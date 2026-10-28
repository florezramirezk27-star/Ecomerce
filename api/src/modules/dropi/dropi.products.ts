import { HttpException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogCacheService } from '../../common/cache/catalog-cache.service';
import { DropiClient } from './dropi.client';
import { DropiAuthService } from './dropi.auth';
import {
  DropiCatalogBody,
  DropiCatalogResponse,
  DropiStockValidation,
  DropiStockItem,
  DROPI_CDN,
  DROPI_API_HOST,
  isDropiSuccess,
} from './dropi.types';
import type { ProductVariation } from '../../common/utils/product-variations';

interface DropiCatalogEnvelope {
  is_succesfull?: boolean;
  is_successful?: boolean;
  isSuccess?: boolean;
  status_code?: number;
  status_reason?: string;
  message?: string;
  data?: { objects?: unknown[] } | null;
  objects?: unknown[];
}

export interface DropiSupplierWarehouseContext {
  supplierId: number;
  /**
   * Bodega con mas stock. Es `undefined` cuando el producto no trae
   * `warehouse_product` (pasa en algunos VARIABLE): en ese caso se usa el
   * `DROPI_WAREHOUSE_ID` de .env como ultimo recurso.
   */
  warehouseId?: number;
  /**
   * Todas las bodegas del proveedor, de mas a menos stock. El catalogo de
   * Dropi no expone `sucursal_id`, asi que no se puede saber de antemano
   * cuales son pedibles: se prueban en orden hasta que una pase.
   */
  warehouseIds: number[];
  /**
   * Variacion a pedir. Dropi exige `variation_id` en los productos VARIABLE;
   * como la tienda no modela variaciones, se elige la de mas stock.
   */
  variationId?: number | null;
  salePrice: number;
  suggestedPrice: number;
  /**
   * Peso que Dropi reporta para el producto. La cotizacion de envio lo exige;
   * si el catalogo no lo trae se usa 1 como valor minimo.
   */
  weight: number;
}

/**
 * Forma minima de un producto del catalogo de Dropi con los campos que usa
 * este servicio: bodegas, stock, precios y media. Las respuestas de Dropi se
 * parsean como `any`; aqui se les da forma local para no regar `any` por el
 * resto del archivo.
 */
export interface DropiProduct {
  id?: number;
  name: string;
  type?: string;
  sku?: string | null;
  description?: string | null;
  sale_price?: number | string | null;
  suggested_price?: number | string | null;
  weight?: number | string | null;
  user?: { id?: number | string };
  warehouse_product?: DropiWarehouseProduct[];
  variations?: DropiVariation[];
  gallery?: DropiGalleryItem[];
  categories?: Array<{ name?: string } | null>;
}

/** Bodega asociada a un producto en el catalogo de Dropi. */
interface DropiWarehouseProduct {
  warehouse_id?: number | string;
  stock?: number;
}

/** Variante de un producto variable (talla/color) en el catalogo de Dropi. */
interface DropiVariation {
  id?: number | string;
  stock?: number;
  sale_price?: number | string | null;
  attribute_values?: Array<{ id?: number; value?: string }>;
}

/** Elemento de la galeria de un producto de Dropi. */
interface DropiGalleryItem {
  url?: string | null;
  urlS3?: string | null;
  main?: boolean;
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
    private readonly cache: CatalogCacheService,
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

      return this.marcarImportados(
        this.normalizeCatalogEnvelope(this.tryParse(retryResult.data)),
      );
    }

    return this.marcarImportados(
      this.normalizeCatalogEnvelope(this.tryParse(data)),
    );
  }

  /**
   * Anade a cada objeto del catalogo `imported: true` cuando ese id de Dropi
   * ya esta en la tienda, para que la UI bloquee el boton de importar en vez
   * de dejar crear un duplicado. Una sola consulta por pagina, no una por
   * producto.
   */
  private async marcarImportados(
    response: DropiCatalogResponse,
  ): Promise<DropiCatalogResponse> {
    // `objects` viene del JSON de Dropi, tipado como any[]; aqui se le da forma
    // local para no regar `any` por el resto del metodo.
    const objects = (response.objects ?? []) as Array<{
      id?: number | string;
      imported?: boolean;
    }>;
    const ids = objects
      .map((o) => Number(o.id))
      .filter((id) => Number.isFinite(id));

    if (ids.length === 0) return response;

    const enTienda = await this.prisma.product.findMany({
      where: { dropiProductId: { in: ids } },
      select: { dropiProductId: true },
    });
    const importados = new Set(
      enTienda
        .map((p) => p.dropiProductId)
        .filter((v): v is number => typeof v === 'number'),
    );

    for (const o of objects) {
      o.imported = importados.has(Number(o.id));
    }
    return response;
  }

  /**
   * Un producto de Dropi solo se importa una vez: si ya esta en la tienda se
   * devuelve 409 antes de gastar una llamada a Dropi. El indice unico de
   * `dropiProductId` es la garantia de fondo; esto es el mensaje claro.
   */
  private async assertNoImportado(dropiProductId: number): Promise<void> {
    const existente = await this.prisma.product.findFirst({
      where: { dropiProductId },
      select: { id: true, name: true },
    });

    if (existente) {
      throw new HttpException(
        `El producto ya está importado en la tienda ("${existente.name}"). ` +
          'Edítalo desde Productos en lugar de importarlo otra vez.',
        409,
      );
    }
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
      ? parsed.data.objects
      : Array.isArray(parsed.objects)
        ? parsed.objects
        : [];

    return {
      // Un catalogo con productos es un exito aunque el flag venga con otra
      // grafia (o sin flag): de eso depende `getProductById`, y si esto queda
      // en false la orden sale con el proveedor/bodega de .env y Dropi la
      // rechaza con "las existencias han variado".
      isSuccess: isDropiSuccess(parsed) || objects.length > 0,
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
      ? product.warehouse_product
      : [];

    if (!supplierId) return null;

    // De mas a menos stock, deduplicando. El orden importa: la primera es la
    // que se intenta primero, y las siguientes son el reintento cuando Dropi
    // dice que esa bodega no tiene stock o no tiene sucursal.
    const warehouseIds = warehouses
      .slice()
      .sort((a, b) => (b.stock || 0) - (a.stock || 0))
      .map((w) => Number(w.warehouse_id))
      .filter((id) => Number.isFinite(id) && id > 0)
      .filter((id, idx, all) => all.indexOf(id) === idx);

    const warehouseId = warehouseIds[0];
    const variationId = this.pickVariationId(product);

    // Sin bodega NI variacion no hay con que pedir: se cae a los defaults de
    // .env. Con cualquiera de las dos alcanza para armar una orden valida.
    if (!warehouseId && variationId == null) return null;

    this.logger.log(
      `Dropi contexto resuelto para ${dropiProductId}: supplier=${supplierId}` +
        (warehouseId ? `, warehouse=${warehouseId}` : '') +
        (variationId ? `, variation=${variationId}` : '') +
        (warehouseIds.length > 1
          ? ` (candidatas: ${warehouseIds.join(', ')})`
          : ''),
    );

    return {
      supplierId,
      warehouseId,
      warehouseIds,
      variationId,
      salePrice: Number(product.sale_price) || 0,
      suggestedPrice: Number(product.suggested_price) || 0,
      weight: this.positiveNumber(product.weight) || 1,
    };
  }

  private positiveNumber(value: unknown): number | null {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  /**
   * Elige la variacion con mas stock de un producto VARIABLE. La tienda no
   * modela variaciones, pero Dropi exige `variation_id` para crearlas: sin el
   * la orden se rechaza con "las existencias han variado". Se toma la de mas
   * stock porque es la que mas probablemente alcance la cantidad pedida.
   */
  private pickVariationId(product: DropiProduct): number | null {
    if (String(product.type).toUpperCase() !== 'VARIABLE') return null;
    const variations = Array.isArray(product.variations)
      ? product.variations
      : [];
    if (variations.length === 0) return null;

    const best = variations
      .slice()
      .sort((a, b) => (Number(b.stock) || 0) - (Number(a.stock) || 0))
      .find((v) => {
        const id = Number(v.id);
        return Number.isFinite(id) && id > 0;
      });

    const id = best ? Number(best.id) : NaN;
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  /**
   * Convierte las `variations` de un producto VARIABLE en el JSON que guarda la
   * tienda en `Product.variations`. Se comparte con el sync de stock para que
   * la lista y los stock por presentacion no se queden congelados.
   *
   * Cada variante trae su propio stock, asi que la tienda puede mostrar (y
   * validar) disponibilidad por presentacion en vez de una sola suma que dejaba
   * vender una variante ya agotada.
   */
  buildVariations(product: DropiProduct): ProductVariation[] {
    if (String(product.type).toUpperCase() !== 'VARIABLE') return [];
    const list = Array.isArray(product.variations) ? product.variations : [];

    const out: ProductVariation[] = [];
    for (const variation of list) {
      const id = Number(variation?.id);
      if (!Number.isInteger(id) || id <= 0) continue;

      // "Talla M / Rojo": Dropi describe cada variante con la lista de valores
      // de sus atributos. Sin ellos se usa un nombre de respaldo para no dejar
      // un chip vacio en la ficha.
      const attributes = Array.isArray(variation?.attribute_values)
        ? variation.attribute_values
        : [];
      const name =
        attributes
          .map((attribute) => String(attribute?.value ?? '').trim())
          .filter(Boolean)
          .join(' / ') || `Presentación ${id}`;

      out.push({ id, name, stock: Number(variation?.stock) || 0 });
    }
    return out;
  }

  async getProductById(dropiProductId: number): Promise<DropiProduct | null> {
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

    return result.objects[0] as DropiProduct;
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

    return this.computeStock(result.objects[0] as DropiProduct);
  }

  computeStock(product: DropiProduct): number {
    if (!product) return 0;

    // Un producto VARIABLE guarda su stock en `variations`. Antes bastaba con
    // que el arreglo EXISTIERA (aunque fuera `[]`) para devolver 0 y no caer
    // nunca a `warehouse_product`: el producto se veia con stock en Dropi pero
    // el backend calculaba 0, dejaba el stock local en 0 y rechazaba la venta
    // con "stock insuficiente". El frontend ya exige `length > 0`; aqui igual.
    const variations = product.variations;
    if (
      String(product.type).toUpperCase() === 'VARIABLE' &&
      Array.isArray(variations) &&
      variations.length > 0
    ) {
      return variations.reduce(
        (sum: number, v: DropiVariation) => sum + (Number(v.stock) || 0),
        0,
      );
    }

    if (
      Array.isArray(product.warehouse_product) &&
      product.warehouse_product.length > 0
    ) {
      return product.warehouse_product.reduce(
        (sum: number, w: DropiWarehouseProduct) => sum + (Number(w.stock) || 0),
        0,
      );
    }

    return 0;
  }

  /**
   * Stock real de una variante concreta, o el total si no se especifico.
   *
   * El stock total de un VARIABLE es la suma de todas las presentaciones; si el
   * cliente eligio una en concreto, ese es el que hay que chequear. Si no se
   * encuentra la variante (Dropi dejo de tenerla) se cae al total para no
   * bloquear una venta que igual Dropi decidira al crear la orden.
   */
  computeAvailable(product: DropiProduct, variationId?: number | null): number {
    if (!variationId) return this.computeStock(product);

    const variations = Array.isArray(product.variations)
      ? product.variations
      : [];
    const match = variations.find((v) => Number(v.id) === variationId);

    return match ? Number(match.stock) || 0 : this.computeStock(product);
  }

  async validateStock(items: DropiStockItem[]): Promise<DropiStockValidation> {
    const insufficient: {
      name: string;
      requested: number;
      available: number;
    }[] = [];

    for (const item of items) {
      let product: DropiProduct | null;
      try {
        product = await this.getProductById(item.dropiProductId);
      } catch (err: unknown) {
        // No se pudo hablar con Dropi (red, token, timeout). Eso NO es "sin
        // stock": antes se contaba como `available: 0` y el cliente recibia
        // "stock insuficiente" aunque el producto existiera. Se deja pasar y,
        // si de verdad no hay, Dropi rechaza la orden al crearla.
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `No se pudo verificar el stock de ${item.name} (${item.dropiProductId}): ${message}. Se intenta crear la orden igualmente.`,
        );
        continue;
      }

      if (!product) {
        // La busqueda por id no devolvio el producto. Puede ser un fallo de la
        // busqueda, no necesariamente falta de stock: se avisa, pero no se
        // bloquea la venta. El stock local (sincronizado con Dropi) sigue
        // siendo el que manda en el checkout.
        this.logger.warn(
          `Dropi no devolvio ${item.name} (${item.dropiProductId}) al verificar el stock; se intenta crear la orden igualmente.`,
        );
        continue;
      }

      const available = this.computeAvailable(product, item.variationId);
      if (available < item.quantity) {
        insufficient.push({
          name: item.name,
          requested: item.quantity,
          available,
        });
      }
    }

    return { ok: insufficient.length === 0, insufficient };
  }

  private mediaUrl(raw?: string | null): string | null {
    if (!raw) return null;
    if (typeof raw !== 'string') return null;
    if (/^https?:\/\//.test(raw)) return raw;
    // Algunos CDN usan rutas relativas
    if (raw.startsWith('//')) return `https:${raw}`;
    return `${DROPI_CDN}${raw.replace(/^\/+/, '')}`;
  }

  private tryParseMedia(data: string): DropiMediaEnvelope | null {
    try {
      return JSON.parse(data) as DropiMediaEnvelope;
    } catch {
      return null;
    }
  }

  private collectMedia(items: any[] | null | undefined): string[] {
    if (!Array.isArray(items)) return [];
    const urls: string[] = [];
    for (const it of items) {
      if (!it) continue;
      if (typeof it === 'string') {
        const u = this.mediaUrl(it);
        if (u && !urls.includes(u)) urls.push(u);
        continue;
      }
      if (typeof it !== 'object') continue;
      const mediaObject = it as any;
      const candidates = [
        mediaObject.url,
        mediaObject.urlS3,
        mediaObject.src,
        mediaObject.image,
        mediaObject.imageUrl,
        mediaObject.photo,
        mediaObject.file,
        mediaObject.path,
        mediaObject.link,
      ];
      for (const c of candidates) {
        const u = this.mediaUrl(c);
        if (u && !urls.includes(u)) urls.push(u);
      }
      // Buscar galerías anidadas
      if (Array.isArray(mediaObject.gallery)) {
        urls.push(...this.collectMedia(mediaObject.gallery));
      }
      if (Array.isArray(mediaObject.images)) {
        urls.push(...this.collectMedia(mediaObject.images));
      }
      if (Array.isArray(mediaObject.photos)) {
        urls.push(...this.collectMedia(mediaObject.photos));
      }
      if (Array.isArray(mediaObject.media)) {
        urls.push(...this.collectMedia(mediaObject.media));
      }
      if (Array.isArray(mediaObject.files)) {
        urls.push(...this.collectMedia(mediaObject.files));
      }
      if (Array.isArray(mediaObject.pictures)) {
        urls.push(...this.collectMedia(mediaObject.pictures));
      }
    }
    return urls;
  }

  private extractAllImages(obj: any, out: string[] = []): string[] {
    if (!obj || typeof obj !== 'object') return out;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        this.extractAllImages(item, out);
      }
      return out;
    }
    const keys = [
      'gallery',
      'images',
      'photos',
      'media',
      'files',
      'pictures',
      'imageList',
      'productImages',
      'product_gallery',
      'galeria',
      'imagenes',
      'image_list',
      'allImages',
      'slider',
      'thumbnails',
    ];
    for (const key of keys) {
      if (Array.isArray(obj[key])) {
        const urls = this.collectMedia(obj[key]);
        for (const u of urls) {
          if (u && !out.includes(u)) out.push(u);
        }
      }
    }
    const direct = this.mediaUrl(
      obj.url ||
        obj.urlS3 ||
        obj.src ||
        obj.image ||
        obj.imageUrl ||
        obj.photo ||
        obj.file ||
        obj.path ||
        obj.link ||
        obj.img,
    );
    if (direct && !out.includes(direct)) out.push(direct);
    for (const value of Object.values(obj)) {
      if (value && typeof value === 'object') {
        this.extractAllImages(value, out);
      }
    }
    return out;
  }

  async fetchProductVideos(dropiProductId: number): Promise<string[]> {
    const token = this.auth.getOfficialToken();
    if (!token) return [];

    const videos: string[] = [];

    const endpoints = [
      { method: 'POST' as const, path: '/api/product/video/list', body: { id: dropiProductId } },
      { method: 'POST' as const, path: '/api/product/videos', body: { id: dropiProductId } },
      { method: 'GET' as const, path: `/api/product/${dropiProductId}/videos` },
      { method: 'GET' as const, path: `/api/products/v2/${dropiProductId}/videos` },
    ];

    for (const ep of endpoints) {
      try {
        const { statusCode, data } = await this.client.request(
          ep.path,
          ep.method,
          ep.body,
          token,
          DROPI_API_HOST,
        );
        if (statusCode !== 200) continue;
        const parsed = this.tryParseMedia(data);
        if (!parsed) continue;
        const extracted = this.extractAllImages(parsed).filter(
          (u) =>
            typeof u === 'string' &&
            (u.includes('.mp4') ||
              u.includes('.webm') ||
              u.includes('.mov') ||
              u.includes('.m3u8') ||
              u.includes('video')),
        );
        for (const u of extracted) {
          if (u && !videos.includes(u)) videos.push(u);
        }
        const objects =
          (parsed.objects as any[]) ??
          (parsed.data?.objects as any[]) ??
          (parsed.data as any)?.videos ??
          (parsed as any)?.videos ??
          [];
        const collected = this.collectMedia(objects);
        for (const u of collected) {
          if (
            u &&
            !videos.includes(u) &&
            (u.includes('.mp4') ||
              u.includes('.webm') ||
              u.includes('.mov') ||
              u.includes('.m3u8') ||
              u.includes('video'))
          )
            videos.push(u);
        }
      } catch (err) {
        // continuar
      }
    }

    return [...new Set(videos)];
  }

  async fetchFullProductMedia(dropiProductId: number): Promise<string[]> {
    const token = this.auth.getOfficialToken();
    if (!token) return [];

    const images: string[] = [];

    const endpoints = [
      { method: 'GET' as const, path: `/api/products/v2/${dropiProductId}`, host: DROPI_API_HOST },
      { method: 'GET' as const, path: `/api/product/${dropiProductId}`, host: DROPI_API_HOST },
      { method: 'GET' as const, path: `/api/product/v2/${dropiProductId}`, host: DROPI_API_HOST },
      { method: 'GET' as const, path: `/api/product/detail/${dropiProductId}`, host: DROPI_API_HOST },
      { method: 'POST' as const, path: '/api/product/gallery', host: DROPI_API_HOST, body: { id: dropiProductId, productId: dropiProductId } },
      { method: 'POST' as const, path: '/api/product/images', host: DROPI_API_HOST, body: { id: dropiProductId } },
      { method: 'POST' as const, path: '/api/gallery/list', host: DROPI_API_HOST, body: { product_id: dropiProductId } },
      { method: 'POST' as const, path: '/api/product/video/list', host: DROPI_API_HOST, body: { id: dropiProductId } },
    ];

    for (const ep of endpoints) {
      try {
        const { statusCode, data } = await this.client.request(
          ep.path,
          ep.method,
          ep.body,
          token,
          ep.host,
        );
        if (statusCode !== 200) continue;
        const parsed = this.tryParseMedia(data);
        if (!parsed) continue;
        const extracted = this.extractAllImages(parsed);
        for (const u of extracted) {
          if (u && !images.includes(u)) images.push(u);
        }
      } catch (err) {
        // continuar con siguiente
      }
    }

    return [...new Set(images)];
  }

  async importProduct(dropiProductId: number): Promise<any> {
    // Un solo import por producto: si ya esta en la tienda se contesta 409
    // sin siquiera llamar a Dropi.
    await this.assertNoImportado(dropiProductId);

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
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.error(`Dropi API call failed: ${message}`);
      throw new Error('Error al conectar con Dropi');
    }

    if (!result.isSuccess || !result.objects || result.objects.length === 0) {
      this.logger.error(
        `Producto ${dropiProductId} no encontrado en Dropi. Response: ${JSON.stringify(result).substring(0, 200)}`,
      );
      throw new Error(`Producto ${dropiProductId} no encontrado en Dropi.`);
    }

    const dropiProduct = result.objects[0] as DropiProduct;
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
    // Presentaciones (solo para productos VARIABLE). Se guardan para que la
    // ficha deje elegir la variante y para mandar su `variation_id` a Dropi.
    const variations = this.buildVariations(dropiProduct);

    const toAbsolute = (g?: any): string | undefined => {
      if (!g) return undefined;
      const u = typeof g === 'string' ? g : g?.url || g?.urlS3 || g?.src || g?.image || g?.imageUrl;
      if (!u || typeof u !== 'string') return undefined;
      if (/^https?:\/\//.test(u)) return u;
      if (u.startsWith('//')) return `https:${u}`;
      return `${DROPI_CDN}${u.replace(/^\/+/, '')}`;
    };

    const allFromProduct = this.extractAllImages(dropiProduct);
    const catalogGallery = [
      ...(dropiProduct.gallery || []),
      ...(dropiProduct.images || []),
      ...(dropiProduct.photos || []),
    ]
      .map((g: any) => toAbsolute(g))
      .filter(Boolean) as string[];
    const mergedCatalog = [...new Set([...allFromProduct, ...catalogGallery])].filter(Boolean);

    const mainGalleryUrl = mergedCatalog[0];
    const image = mainGalleryUrl;
    const gallery = mergedCatalog.slice(1);

    const suggested = Number(dropiProduct.suggested_price) || 0;
    const cost = Number(dropiProduct.sale_price) || 0;
    const sellable = suggested > 0 ? suggested : cost;

    const product = await this.prisma.product
      .create({
        data: {
          name,
          slug,
          price: sellable,
          oldPrice: suggested > 0 ? Math.round(suggested * 1.15) : undefined,
          stock,
          customCode: dropiProduct.sku || undefined,
          // Si Dropi no devuelve el id se guarda el con el que se pidio: es el
          // mismo, y sin el la fila quedaria sin `dropiProductId` y se podria
          // importar otra vez.
          dropiProductId: dropiProduct.id ?? dropiProductId,
          image: image || undefined,
          gallery,
          description: dropiProduct.description || undefined,
          // Sin presentaciones queda en `undefined` para que el JSON no se
          // llene de listas vacias que no significan nada. El cast es porque
          // `ProductVariation[]` no declara indice de cadena y Prisma no lo
          // acepta como `InputJsonValue` aunque si sea JSON valido.
          variations:
            variations.length > 0
              ? (variations as unknown as Prisma.InputJsonValue)
              : undefined,
          categoryId: category.id,
        },
        include: { category: true },
      })
      .catch((e: unknown) => {
        // Dos imports simultaneos del mismo producto: gana el indice unico de
        // dropiProductId y aqui se traduce a un mensaje entendible.
        const prismaError = e as {
          code?: string;
          meta?: { target?: string | string[] };
        };
        const target = prismaError.meta?.target;
        const chocoEnDropi = Array.isArray(target)
          ? target.includes('dropiProductId')
          : target === 'dropiProductId';

        if (prismaError.code === 'P2002' && chocoEnDropi) {
          throw new HttpException(
            'El producto ya está importado en la tienda',
            409,
          );
        }
        throw e;
      });

    if (suggested > 0) {
      this.logger.log(
        `Dropi import ${dropiProductId}: precio = ${sellable} (sugerido ${suggested}, costo ${cost})`,
      );
    }

    await this.invalidateCatalogCache();

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

    let mergedGallery = [...new Set([...mergedCatalog, ...fullImages])].filter(Boolean);
    // Si aún solo hay 1, intentar extraer de nuevo con más agresividad
    if (mergedGallery.length <= 1) {
      const extra = this.extractAllImages({ product: dropiProduct, data: dropiProduct, objects: [dropiProduct] });
      mergedGallery = [...new Set([...mergedGallery, ...extra])].filter(Boolean);
    }
    const videos = [...new Set(videoUrls.filter(Boolean))];

    if (mergedGallery.length > 0 || videos.length > 0) {
      const updated = await this.prisma.product.update({
        where: { id: product.id },
        data: {
          image: mergedGallery[0] || image || undefined,
          gallery: mergedGallery.slice(1),
          videos,
          video: videos[0] ?? undefined,
        },
      });
      product.image = updated.image || mergedGallery[0] || product.image;
      product.gallery = mergedGallery.slice(1);
      product.videos = videos;
      if (videos[0]) product.video = videos[0];
      this.logger.log(
        `Dropi import: ${dropiProductId} -> ${mergedGallery.length} imágenes, ${videos.length} videos`,
      );
    } else {
      this.logger.log(
        `Dropi import: ${dropiProductId} -> sin media adicional (${mergedCatalog.length} imágenes, 0 videos)`,
      );
    }

    return product;
  }

  /**
   * Vuelve a leer la imagen principal, la galeria y los videos de un producto
   * que YA esta en la tienda y los actualiza.
   *
   * Existe porque Dropi rota las URLs de su CDN: la carpeta vieja
   * (`uploads/images/products/...`) desaparece y las imagenes guardadas en la
   * importacion empiezan a devolver 403. El optimizador de Next lo traduce a un
   * 502 en `/_next/image` y la ficha se queda sin foto. Como la media
   * actualizada solo la entrega Dropi con su token (que vive en el backend),
   * esto tiene que correr aqui y no en el navegador.
   *
   * Se reescribe la galeria completa, no se fusiona: lo que se busca es dejar
   * solo URLs que hoy funcionen, y las viejas rotas son justo lo que sobra.
   */
  async refreshProductMedia(productId: string): Promise<{
    id: string;
    image: string | null;
    gallery: string[];
    videos: string[];
  }> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, dropiProductId: true, image: true },
    });

    if (!product) {
      throw new HttpException('Producto no encontrado', 404);
    }

    const dropiProductId = product.dropiProductId;
    if (!dropiProductId) {
      throw new HttpException(
        'El producto no viene de Dropi: no hay nada que re-sincronizar',
        400,
      );
    }

    const token = this.auth.getOfficialToken();
    if (!token) {
      throw new HttpException(
        'Falta DROPI_API_TOKEN en el servidor: no se puede leer la media actualizada de Dropi',
        503,
      );
    }

    const [fullImages, videoUrls] = await Promise.all([
      this.fetchFullProductMedia(dropiProductId),
      this.fetchProductVideos(dropiProductId),
    ]);

    const gallery = [...new Set(fullImages.filter(Boolean))];
    const videos = [...new Set(videoUrls.filter(Boolean))];

    if (gallery.length === 0 && videos.length === 0) {
      throw new HttpException(
        'Dropi no devolvio imagenes ni videos para este producto',
        502,
      );
    }

    // La primera de la galeria que Dropi devuelve hoy es la principal. Si solo
    // llegaron videos, se respeta la imagen actual para no dejarla vacia.
    const image = gallery[0] ?? product.image ?? null;

    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: {
        image: image ?? undefined,
        gallery,
        videos,
        video: videos[0] ?? undefined,
      },
      select: { id: true, image: true, gallery: true, videos: true },
    });

    await this.invalidateCatalogCache();

    this.logger.log(
      `Dropi media refresh ${dropiProductId}: ${gallery.length} imagenes, ${videos.length} videos`,
    );

    return updated;
  }

  /**
   * Invalida la cache del catalogo.
   *
   * Este servicio escribe productos con Prisma directamente, saltandose
   * ProductsService, asi que la invalidacion de la cache no ocurre sola.
   */
  private async invalidateCatalogCache() {
    await this.cache.invalidate('products');
    await this.cache.invalidate('product');
    await this.cache.invalidate('categories');
    await this.cache.invalidate('category');
  }
}
