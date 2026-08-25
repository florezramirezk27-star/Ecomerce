import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import https from 'https';

@Injectable()
export class DropiService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DropiService.name);
  private readonly DROPI_CDN = 'https://api.dropi.co/';
  private activeToken: string = '';
  private email: string;
  private password: string;
  private isLoggingIn = false;
  private reloginInterval: NodeJS.Timeout | null = null;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    this.email = this.configService.get<string>('DROPI_EMAIL') ?? '';
    this.password = this.configService.get<string>('DROPI_PASSWORD') ?? '';
  }

  async onModuleInit() {
    await this.login();
    this.startAutoRelogin();
  }

  onModuleDestroy() {
    this.stopAutoRelogin();
  }

  private startAutoRelogin() {
    const RELINERVAL = 45 * 60 * 1000;
    this.reloginInterval = setInterval(() => {
      if (!this.activeToken) {
        this.logger.log('Auto-relogin triggered: token missing');
        this.login();
      }
    }, RELINERVAL);
  }

  private stopAutoRelogin() {
    if (this.reloginInterval) {
      clearInterval(this.reloginInterval);
      this.reloginInterval = null;
    }
  }

  private async httpsRequest(
    hostname: string,
    path: string,
    method: string,
    bodyStr: string,
    extraHeaders: Record<string, string>,
  ): Promise<{ statusCode?: number; data: string }> {
    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname,
          path,
          method,
          timeout: 15000,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(bodyStr),
            Origin: 'https://app.dropi.co',
            Referer: 'https://app.dropi.co/',
            Accept: 'application/json, text/plain, */*',
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
            'sec-ch-ua':
              '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-site',
            ...extraHeaders,
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve({ statusCode: res.statusCode, data }));
        },
      );

      req.on('error', reject);
      req.write(bodyStr);
      req.end();
    });
  }

  async login(): Promise<void> {
    if (this.isLoggingIn) return;
    this.isLoggingIn = true;

    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        const bodyStr = JSON.stringify({
          email: this.email,
          password: this.password,
          white_brand_id: 1,
        });

        const { statusCode, data } = await this.httpsRequest(
          'api.dropi.co',
          '/api/login',
          'POST',
          bodyStr,
          {},
        );

        if (statusCode !== 200) {
          throw new Error(`Login failed with status ${statusCode}: ${data}`);
        }

        const result = JSON.parse(data);
        if (!result.isSuccess || !result.token) {
          throw new Error(`Login rejected: ${result.message || 'no token'}`);
        }

        this.activeToken = result.token;
        this.logger.log('Dropi login successful, token acquired');
        break;
      } catch (error: any) {
        retryCount++;
        this.logger.error(
          `Dropi login attempt ${retryCount} failed: ${error.message}`,
        );

        if (retryCount < maxRetries) {
          const delay = Math.pow(2, retryCount) * 1000;
          this.logger.log(`Retrying login in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          this.logger.error('Dropi login failed after all retries');
          this.activeToken = '';
        }
      } finally {
        this.isLoggingIn = false;
      }
    }
  }

  private async request(body: object): Promise<any> {
    if (!this.activeToken) {
      await this.login();
      if (!this.activeToken) {
        throw new Error('No se pudo autenticar con Dropi');
      }
    }

    const bodyStr = JSON.stringify(body);

    const { statusCode, data } = await this.httpsRequest(
      'api.dropi.co',
      '/api/products/v4/index',
      'POST',
      bodyStr,
      { 'X-Authorization': `Bearer ${this.activeToken}` },
    );

    if (statusCode === 401) {
      this.logger.warn('Dropi token expired, re-logging in...');
      await this.login();
      if (!this.activeToken) {
        throw new Error('No se pudo renovar el token de Dropi');
      }

      const retryResult = await this.httpsRequest(
        'api.dropi.co',
        '/api/products/v4/index',
        'POST',
        bodyStr,
        { 'X-Authorization': `Bearer ${this.activeToken}` },
      );

      if (retryResult.statusCode === 401) {
        throw new Error('Dropi token renew failed');
      }

      try {
        return JSON.parse(retryResult.data);
      } catch {
        return retryResult.data;
      }
    }

    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  }

  async getDropiProducts(body?: object): Promise<any> {
    return this.request(
      body || {
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
      },
    );
  }

  async importProduct(dropiProductId: number) {
    let result: any;
    try {
      result = await this.getDropiProducts({
        pageSize: 1,
        startData: 0,
        privated_product: false,
        userVerified: false,
        favorite: false,
        country: 'COLOMBIA',
        get_stock: false,
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

    const existing = await this.prisma.product.findUnique({ where: { slug } });
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

    let stock = 0;
    if (dropiProduct.type === 'VARIABLE' && dropiProduct.variations) {
      stock = dropiProduct.variations.reduce(
        (sum: number, v: any) => sum + (v.stock || 0),
        0,
      );
    } else if (dropiProduct.warehouse_product) {
      stock = dropiProduct.warehouse_product.reduce(
        (sum: number, w: any) => sum + (w.stock || 0),
        0,
      );
    }

    const mainGallery =
      dropiProduct.gallery?.find((g: any) => g.main) ||
      dropiProduct.gallery?.[0];
    const image = mainGallery?.url
      ? `${this.DROPI_CDN}${mainGallery.url}`
      : mainGallery?.urlS3
        ? `${this.DROPI_CDN}${mainGallery.urlS3}`
        : undefined;

    const gallery = (dropiProduct.gallery || [])
      .filter((g: any) => g !== mainGallery)
      .map((g: any) =>
        g.url
          ? `${this.DROPI_CDN}${g.url}`
          : g.urlS3
            ? `${this.DROPI_CDN}${g.urlS3}`
            : undefined,
      )
      .filter(Boolean) as string[];

    const product = await this.prisma.product.create({
      data: {
        name,
        slug,
        price: dropiProduct.sale_price || 0,
        oldPrice: dropiProduct.suggested_price || undefined,
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

    return product;
  }

  async createOrder(data: {
    items: {
      dropiProductId: number;
      quantity: number;
      price: number;
      name: string;
    }[];
    shipping: {
      name: string;
      phone: string;
      email?: string;
      address: string;
      city: string;
      state: string;
      notes?: string;
    };
  }): Promise<{ success: boolean; message: string }> {
    if (!this.activeToken) {
      await this.login();
      if (!this.activeToken) {
        return { success: false, message: 'No autenticado con Dropi' };
      }
    }

    const results: string[] = [];

    for (const item of data.items) {
      try {
        const bodyStr = JSON.stringify({
          product_id: item.dropiProductId,
          quantity: item.quantity,
          price: item.price,
          shipping_address: data.shipping.address,
          shipping_city: data.shipping.city,
          shipping_state: data.shipping.state,
          customer_name: data.shipping.name,
          customer_phone: data.shipping.phone,
          customer_email: data.shipping.email || '',
          notes: data.shipping.notes || '',
        });

        const { statusCode, data: resData } = await this.httpsRequest(
          'api.dropi.co',
          '/api/orders/store',
          'POST',
          bodyStr,
          { 'X-Authorization': `Bearer ${this.activeToken}` },
        );

        if (statusCode === 401) {
          await this.login();
          const retry = await this.httpsRequest(
            'api.dropi.co',
            '/api/orders/store',
            'POST',
            bodyStr,
            { 'X-Authorization': `Bearer ${this.activeToken}` },
          );
          if (retry.statusCode === 200) {
            results.push(`Dropi OK: ${item.name}`);
            continue;
          }
        }

        if (statusCode === 200) {
          results.push(`Dropi OK: ${item.name}`);
        } else {
          this.logger.warn(
            `Dropi order failed for ${item.name}: ${statusCode} ${resData}`,
          );
          results.push(`Dropi falló: ${item.name}`);
        }
      } catch (err: any) {
        this.logger.error(`Dropi order error for ${item.name}: ${err.message}`);
        results.push(`Dropi error: ${item.name}`);
      }
    }

    const allOk = results.every((r) => r.startsWith('Dropi OK'));
    return {
      success: allOk,
      message: results.join(' | '),
    };
  }

  async getStatus(): Promise<{ connected: boolean; email: string }> {
    return {
      connected: !!this.activeToken,
      email: this.email,
    };
  }

  async forceRelogin(): Promise<{ connected: boolean; email: string }> {
    this.activeToken = '';
    await this.login();
    return this.getStatus();
  }
}
