import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DropiProductsService } from './dropi.products';
import { DropiCatalogBody } from './dropi.types';

export interface StockSyncSummary {
  checked: number;
  updated: number;
  errors: number;
  skipped: number;
  details: { id: number; name: string; updated: boolean; error?: string }[];
}

const SYNC_INTERVAL_MS = 30 * 60 * 1000;

@Injectable()
export class DropiSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DropiSyncService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly products: DropiProductsService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      this.syncStock()
        .then((summary) =>
          this.logger.log(
            `Stock sync automático: ${summary.checked} revisados, ${summary.updated} actualizados`,
          ),
        )
        .catch((err) =>
          this.logger.error(`Stock sync automático falló: ${err.message}`),
        );
    }, SYNC_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async syncStock(targetIds?: number[]): Promise<StockSyncSummary> {
    const localProducts = await this.prisma.product.findMany({
      where: { dropiProductId: { not: null } },
      select: { id: true, dropiProductId: true, name: true },
    });

    if (localProducts.length === 0) {
      this.logger.warn('No hay productos importados de Dropi para sincronizar');
      return { checked: 0, updated: 0, errors: 0, skipped: 0, details: [] };
    }

    const wanted = new Set(
      targetIds && targetIds.length > 0
        ? targetIds
        : localProducts.map((p) => p.dropiProductId!),
    );

    const dropiById = new Map<number, any>();

    try {
      const pageSize = 100;
      let startData = 0;

      while (true) {
        const body: DropiCatalogBody = {
          pageSize,
          startData,
          privated_product: false,
          userVerified: false,
          favorite: false,
          country: 'COLOMBIA',
          get_stock: true,
          no_count: true,
          search_type: 'simple',
          with_collection: true,
        };

        const page = await this.products.fetchCatalog(body);

        if (!page?.isSuccess || !Array.isArray(page.objects)) {
          this.logger.warn(
            'Dropi devolvió una página inválida durante el sync',
          );
          break;
        }

        for (const obj of page.objects) {
          if (obj?.id != null && wanted.has(Number(obj.id))) {
            dropiById.set(Number(obj.id), obj);
          }
        }

        if (page.objects.length < pageSize) break;
        startData += pageSize;
      }
    } catch (err: any) {
      this.logger.error(`Error trayendo catálogo de Dropi: ${err.message}`);
      throw new Error(`No se pudo sincronizar con Dropi: ${err.message}`);
    }

    const summary: StockSyncSummary = {
      checked: 0,
      updated: 0,
      errors: 0,
      skipped: 0,
      details: [],
    };

    for (const local of localProducts) {
      const dropiId = local.dropiProductId!;
      summary.checked++;

      if (!wanted.has(dropiId)) {
        summary.skipped++;
        continue;
      }

      const dropiProduct = dropiById.get(dropiId);

      if (!dropiProduct) {
        summary.skipped++;
        summary.details.push({
          id: dropiId,
          name: local.name,
          updated: false,
          error: 'producto ausente en catálogo Dropi',
        });
        continue;
      }

      const stock = this.products.computeStock(dropiProduct);
      const salePrice = Number(dropiProduct.sale_price);
      const suggestedPrice = dropiProduct.suggested_price
        ? Number(dropiProduct.suggested_price)
        : undefined;

      try {
        await this.prisma.product.update({
          where: { id: local.id },
          data: {
            stock,
            ...(salePrice > 0 && { price: salePrice }),
            ...(suggestedPrice && { oldPrice: suggestedPrice }),
          },
        });
        summary.updated++;
        summary.details.push({
          id: dropiId,
          name: local.name,
          updated: true,
        });
      } catch (err: any) {
        summary.errors++;
        summary.details.push({
          id: dropiId,
          name: local.name,
          updated: false,
          error: err.message,
        });
      }
    }

    return summary;
  }
}
