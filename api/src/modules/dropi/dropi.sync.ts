import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DropiProductsService } from './dropi.products';
import { DropiTrackingService } from './dropi.tracking';
import { DropiCatalogBody } from './dropi.types';

export interface StockSyncSummary {
  checked: number;
  updated: number;
  errors: number;
  skipped: number;
  details: { id: number; name: string; updated: boolean; error?: string }[];
}

const SYNC_INTERVAL_MS = 30 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 15 * 1000;

@Injectable()
export class DropiSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DropiSyncService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly products: DropiProductsService,
    private readonly prisma: PrismaService,
    private readonly tracking: DropiTrackingService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.runAllSync();
    }, SYNC_INTERVAL_MS);
    this.timer.unref?.();

    setTimeout(() => {
      void this.runAllSync();
    }, FIRST_RUN_DELAY_MS).unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async runAllSync() {
    try {
      const summary = await this.syncStock();
      this.logger.log(
        `Stock sync automático: ${summary.checked} revisados, ${summary.updated} actualizados, ${summary.errors} errores`,
      );
    } catch (err: any) {
      this.logger.error(`Stock sync automático falló: ${err.message}`);
    }

    try {
      const updates = await this.tracking.syncAllPendingOrders();
      if (updates.length > 0) {
        this.logger.log(
          `Sync automático de estados Dropi: ${updates.length} orden(es) actualizada(s)`,
        );
      }
    } catch (err: any) {
      this.logger.error(`Sync de estados Dropi falló: ${err.message}`);
    }

    try {
      const deleted = await this.tracking.syncDeletedOrders();
      if (deleted.length > 0) {
        this.logger.log(
          `Sync automático: ${deleted.length} envío(s) eliminado(s) en Dropi marcados como cancelados`,
        );
      }
    } catch (err: any) {
      this.logger.error(`Sync de envíos eliminados falló: ${err.message}`);
    }
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
      const cost = Number(dropiProduct.sale_price) || 0;
      const suggested = dropiProduct.suggested_price
        ? Number(dropiProduct.suggested_price)
        : 0;
      const price = suggested > 0 ? suggested : cost;

      try {
        await this.prisma.product.update({
          where: { id: local.id },
          data: {
            stock,
            ...(price > 0 && { price }),
            ...(suggested > 0 && { oldPrice: Math.round(suggested * 1.15) }),
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
