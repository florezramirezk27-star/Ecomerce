import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DropiClient } from './dropi.client';
import { DropiAuthService } from './dropi.auth';
import {
  DropiCatalogBody,
  DropiCatalogResponse,
  DropiStockValidation,
  DropiStockItem,
  DROPI_CDN,
  DROPI_API_HOST,
} from './dropi.types';

interface DropiCatalogEnvelope {
  is_succesfull?: boolean;
  isSuccess?: boolean;
  status_code?: number;
  status_reason?: string;
  message?: string;
  data?: { objects?: unknown[] } | null;
  objects?: unknown[];
}

export interface DropiSupplierWarehouseContext {
  supplierId: number;
  warehouseId: number;
  salePrice: number;
  suggestedPrice: number;
}

interface DropiMediaItem {
  url?: string | null;
  urlS3?: string | null;
  gallery?: DropiMediaItem[];
  object?: unknown;
}

interface DropiMediaEnvelope {
  is_succesfull?: boolean;
  isSuccess?: boolean;
  status_code?: number;
  status_reason?: string;
  objects?: unknown[] | null;
  data?: { objects?: unknown[] } | null;
  url?: string | null;
  urlS3?: string | null;
}

@Injectable()
export class DropiProductsService {
  private readonly logger = new Logger(DropiProductsService.name);

  constructor(
    private readonly client: DropiClient,
    private readonly auth: DropiAuthService,
    private readonly prisma: PrismaService,
  ) {}

  async fetchCatalog(body: DropiCatalogBody): Promise<DropiCatalogResponse> {
    const defaultBody = {
      pageSize: 50,
      startData: 0,
      privated_product: false,
      userVerified: false,
      favorite: false,
      country: 'COLOMBIA',
      get_stock: false,
      no_count: true,
      search_type: 'simple',
      with_collection: true,
    };

    const token = await this.auth.getToken();
    const { statusCode, data } = await this.client.request(
      '/bff/catalog/products/v4/index',
      'POST',
      { ...defaultBody, ...body },
      token,
      'api-v2.dropi.co',
    );

    if (statusCode === 401) {
      this.logger.warn(
        'Dropi token expirado/inválido durante catálogo, renovando token...',
      );
      this.auth.invalidateToken();
      const newToken = await this.auth.getToken();

      if (!newToken) {
        throw new Error(
          'No se pudo renovar el token de Dropi: login BFF falló (credenciales/2FA inválidas o Dropi no disponible)',
        );
      }

      const retryResult = await this.client.request(
        '/bff/catalog/products/v4/index',
        'POST',
        { ...defaultBody, ...body },
        newToken,
        'api-v2.dropi.co',
      );

      if (retryResult.statusCode === 401) {
        throw new Error(
          'Dropi rechazó el token renovado: sesión inválida o cuenta deshabilitada',
        );
      }

      return this.normalizeCatalogEnvelope(this.tryParse(retryResult.data));
    }

    return this.normalizeCatalogEnvelope(this.tryParse(data));
  }

  private tryParse(data: string): DropiCatalogEnvelope | null {
    try {
      return JSON.parse(data) as DropiCatalogEnvelope;
    } catch {
      return null;
    }
  }

  private normalizeCatalogEnvelope(
    parsed: DropiCatalogEnvelope | null,
  ): DropiCatalogResponse {
    if (!parsed || typeof parsed !== 'object') {
      return { isSuccess: false, objects: [] };
    }

    const objects = Array.isArray(parsed.data?.objects)
      ? parsed.data!.objects!
      : Array.isArray(parsed.objects)
        ? parsed.objects
        : [];

    return {
      isSuccess: parsed.is_succesfull === true || parsed.isSuccess === true,
      message: parsed.status_reason ?? parsed.message ?? undefined,
      objects,
    };
  }

  async resolveDropshipperContext(
    dropiProductId: number,
  ): Promise<DropiSupplierWarehouseContext | null> {
    const product = await this.getProductById(dropiProductId);
    if (!product) return null;

    const supplierId = Number(product.user?.id);
    const warehouses = Array.isArray(product.warehouse_product)
      ? (product.warehouse_product as {
          warehouse_id?: number | string;
          stock?: number;
        }[])
      : [];

    if (!supplierId || warehouses.length === 0) return null;

    const best = warehouses.reduce((acc, w) =>
      (w.stock || 0) >= (acc.stock || 0) ? w : acc,
    );

    const warehouseId = Number(best.warehouse_id);
    if (!warehouseId) return null;

    this.logger.log(
      `Dropi contexto resuelto para ${dropiProductId}: supplier=${supplierId}, warehouse=${warehouseId}`,
    );

    return {
      supplierId,
      warehouseId,
      salePrice: Number(product.sale_price) || 0,
      suggestedPrice: Number(product.suggested_price) || 0,
    };
  }

  async getProductById(dropiProductId: number): Promise<any> {
    const result = await this.fetchCatalog({
      pageSize: 1,
      startData: 0,
      privated_product: false,
      userVerified: false,
      favorite: false,
      country: 'COLOMBIA',
      get_stock: true,
      no_count: true,
      search_type: 'id',
      keywords: String(dropiProductId),
      with_collection: true,
    });

    if (!result.isSuccess || !result.objects || result.objects.length === 0) {
      return null;
    }

    return result.objects[0];
  }

  async getRealStock(dropiProductId: number): Promise<number> {
    const result = await this.fetchCatalog({
      pageSize: 1,
      startData: 0,
      privated_product: false,
      userVerified: false,
      favorite: false,
      country: 'COLOMBIA',
      get_stock: true,
      no_count: true,
      search_type: 'id',
      keywords: String(dropiProductId),
      with_collection: true,
    });

    if (!result.isSuccess || !result.objects || result.objects.length === 0) {
      return 0;
    }

    return this.computeStock(result.objects[0]);
  }

  computeStock(product: any): number {
    if (!product) return 0;

    if (product.type === 'VARIABLE' && product.variations) {
      return product.variations.reduce(
        (sum: number, v: any) => sum + (v.stock || 0),
        0,
      );
    }

    if (product.warehouse_product) {
      return product.warehouse_product.reduce(
        (sum: number, w: any) => sum + (w.stock || 0),
        0,
      );
    }

    return 0;
  }

  async validateStock(items: DropiStockItem[]): Promise<DropiStockValidation> {
    const insufficient: {
      name: string;
      requested: number;
      available: number;
    }[] = [];

    for (const item of items) {
      try {
        const product = await this.getProductById(item.dropiProductId);
        if (!product) {
          insufficient.push({
            name: item.name,
            requested: item.quantity,
            available: 0,
          });
          continue;
        }
        const available = this.computeStock(product);
        if (available < item.quantity) {
          insufficient.push({
            name: item.name,
            requested: item.quantity,
            available,
          });
        }
      } catch (err: any) {
        this.logger.error(
          `Stock check failed for ${item.name} (${item.dropiProductId}): ${err.message}`,
        );
        insufficient.push({
          name: item.name,
          requested: item.quantity,
          available: 0,
        });
      }
    }

    return { ok: insufficient.length === 0, insufficient };
  }

  private mediaUrl(raw?: string | null): string | null {
    if (!raw) return null;
    if (/^https?:\/\//.test(raw)) return raw;
    return `${DROPI_CDN}${raw}`;
  }

  private tryParseMedia(data: string): DropiMediaEnvelope | null {
    try {
      return JSON.parse(data) as DropiMediaEnvelope;
    } catch {
      return null;
    }
  }

  private collectMedia(items: DropiMediaItem[] | null | undefined): string[] {
    if (!Array.isArray(items)) return [];
    const urls: string[] = [];
    for (const it of items) {
      const mediaObject = it as DropiMediaItem;
      const u = this.mediaUrl(mediaObject.url || mediaObject.urlS3);
      if (u && !urls.includes(u)) urls.push(u);
    }
    return urls;
  }

  async fetchProductVideos(dropiProductId: number): Promise<string[]> {
    const token = this.auth.getOfficialToken();
    if (!token) return [];

    const { statusCode, data } = await this.client.request(
      '/api/product/video/list',
      'POST',
      { id: dropiProductId },
      token,
      DROPI_API_HOST,
    );

    if (statusCode !== 200) return [];

    const parsed = this.tryParseMedia(data);
    if (!parsed) return [];

    const objects =
      parsed.objects ?? parsed.data?.objects ?? parsed.data?.objects ?? [];
    return this.collectMedia(objects as DropiMediaItem[]);
  }

  async fetchFullProductMedia(dropiProductId: number): Promise<string[]> {
    const token = this.auth.getOfficialToken();
    if (!token) return [];

    const { statusCode, data } = await this.client.request(
      `/api/products/v2/${dropiProductId}`,
      'GET',
      undefined,
      token,
      DROPI_API_HOST,
    );

    if (statusCode !== 200) return [];

    const parsed = this.tryParseMedia(data);
    if (!parsed) return [];

    const candidates: DropiMediaItem[] = [];
    if (Array.isArray(parsed.objects)) {
      candidates.push(...(parsed.objects as DropiMediaItem[]));
    }
    if (Array.isArray(parsed.objects) === false) {
      candidates.push(parsed as DropiMediaItem);
    }

    const images: string[] = [];
    for (const c of candidates) {
      const own = this.mediaUrl(c.url || c.urlS3);
      if (own) images.push(own);
      images.push(...this.collectMedia(c.gallery));
    }
    return [...new Set(images)];
  }

  async importProduct(dropiProductId: number): Promise<any> {
    let result: DropiCatalogResponse;
    try {
      result = await this.fetchCatalog({
        pageSize: 1,
        startData: 0,
        privated_product: false,
        userVerified: false,
        favorite: false,
        country: 'COLOMBIA',
        get_stock: true,
        no_count: true,
        search_type: 'id',
        keywords: String(dropiProductId),
        with_collection: true,
      });
    } catch (e: any) {
      this.logger.error(`Dropi API call failed: ${e.message}`);
      throw new Error('Error al conectar con Dropi');
    }

    if (!result.isSuccess || !result.objects || result.objects.length === 0) {
      this.logger.error(
        `Producto ${dropiProductId} no encontrado en Dropi. Response: ${JSON.stringify(result).substring(0, 200)}`,
      );
      throw new Error(`Producto ${dropiProductId} no encontrado en Dropi.`);
    }

    const dropiProduct = result.objects[0];
    const name = dropiProduct.name;

    let slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const existing = await this.prisma.product.findUnique({
      where: { slug },
    });
    if (existing) {
      slug = `${slug}-${dropiProduct.id}`;
    }

    const categoryName = dropiProduct.categories?.[0]?.name || 'Sin categoría';
    const categorySlug = categoryName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    let category = await this.prisma.category.findFirst({
      where: { name: { equals: categoryName, mode: 'insensitive' } },
    });

    if (!category) {
      category = await this.prisma.category.create({
        data: { name: categoryName, slug: categorySlug },
      });
    }

    const stock = this.computeStock(dropiProduct);

    const mainGallery =
      dropiProduct.gallery?.find((g: any) => g.main) ||
      dropiProduct.gallery?.[0];
    const toAbsolute = (g: any): string | undefined => {
      const u = g?.url || g?.urlS3;
      if (!u) return undefined;
      if (/^https?:\/\//.test(u)) return u;
      return `${DROPI_CDN}${u}`;
    };

    const image = toAbsolute(mainGallery);
    const gallery = (dropiProduct.gallery || [])
      .filter((g: any) => g !== mainGallery)
      .map(toAbsolute)
      .filter(Boolean) as string[];

    const suggested = Number(dropiProduct.suggested_price) || 0;
    const cost = Number(dropiProduct.sale_price) || 0;
    const sellable = suggested > 0 ? suggested : cost;

    const product = await this.prisma.product.create({
      data: {
        name,
        slug,
        price: sellable,
        oldPrice: suggested > 0 ? Math.round(suggested * 1.15) : undefined,
        stock,
        customCode: dropiProduct.sku || undefined,
        dropiProductId: dropiProduct.id || undefined,
        image: image || undefined,
        gallery,
        description: dropiProduct.description || undefined,
        categoryId: category.id,
      },
      include: { category: true },
    });

    if (suggested > 0) {
      this.logger.log(
        `Dropi import ${dropiProductId}: precio = ${sellable} (sugerido ${suggested}, costo ${cost})`,
      );
    }

    const token = this.auth.getOfficialToken();
    if (!token) {
      this.logger.warn(
        'Dropi: media completa deshabilitada — agrega DROPI_API_TOKEN (token atkn_) al .env para importar todas las fotos y videos del producto',
      );
      return product;
    }

    const [fullImages, videoUrls] = await Promise.all([
      this.fetchFullProductMedia(dropiProductId),
      this.fetchProductVideos(dropiProductId),
    ]);

    const mergedGallery = [...gallery];
    for (const u of fullImages) {
      if (u && !mergedGallery.includes(u)) mergedGallery.push(u);
    }

    const videos = [...new Set(videoUrls.filter(Boolean))];

    if (mergedGallery.length !== gallery.length || videos.length > 0) {
      const updated = await this.prisma.product.update({
        where: { id: product.id },
        data: {
          gallery: mergedGallery,
          videos,
          video: videos[0] ?? undefined,
        },
      });
      mergedGallery.forEach((u, i) => {
        product.gallery[i] = u;
      });
      product.videos = videos;
      if (videos[0]) product.video = videos[0];
      if (updated.image) product.image = updated.image;
      this.logger.log(
        `Dropi import: ${dropiProductId} -> ${mergedGallery.length} imágenes, ${videos.length} videos`,
      );
    } else {
      this.logger.log(
        `Dropi import: ${dropiProductId} -> sin media adicional (${gallery.length} imágenes, 0 videos)`,
      );
    }

    return product;
  }
}
