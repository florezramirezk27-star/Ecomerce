import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CatalogCacheService } from '../../common/cache/catalog-cache.service';
import { DropiProduct, DropiProductsService } from './dropi.products';
import { DropiTrackingService } from './dropi.tracking';

export interface StockSyncSummary {
  checked: number;
  updated: number;
  /** Productos cuyo stock de Dropi es identico al local: no se tocaron. */
  unchanged: number;
  errors: number;
  skipped: number;
  /**
   * Nombres de lo que no se pudo sincronizar. Sin esto el logAutomatico solo
   * decia "2 sin datos en Dropi" y no habia forma de saber quais eran sin
   * conectarse a Dropi a mano: el unico sintoma es un numero.
   */
  skippedNames: string[];
  errorNames: string[];
  details: {
    id: number;
    name: string;
    updated: boolean;
    unchanged?: boolean;
    error?: string;
  }[];
  /**
   * Productos cuyo precio local quedo por debajo del minimo que exige Dropi.
   * No se corrigen solos: el precio lo define el_dueno a mano y el sync no debe
   * deshacerlo, pero es exactamente la causa de que la orden no se cree.
   */
  priceWarnings: {
    id: number;
    name: string;
    local: number;
    suggested: number;
  }[];
}

const DEFAULT_SYNC_INTERVAL_MIN = 30;
const FIRST_RUN_DELAY_MS = 15 * 1000;

function syncIntervalMs(): number {
  const raw = Number(process.env.DROPI_STOCK_SYNC_INTERVAL_MINUTES);
  const min = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_SYNC_INTERVAL_MIN;
  return min * 60 * 1000;
}

@Injectable()
export class DropiSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DropiSyncService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly products: DropiProductsService,
    private readonly prisma: PrismaService,
    private readonly tracking: DropiTrackingService,
    private readonly cache: CatalogCacheService,
  ) {}

  onModuleInit() {
    const every = syncIntervalMs();
    this.timer = setInterval(() => {
      void this.runAllSync();
    }, every);
    this.timer.unref?.();

    this.logger.log(
      `Sync de stock cada ${Math.round(every / 60000)} min; primera corrida en ${FIRST_RUN_DELAY_MS / 1000}s`,
    );

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
        `Stock sync automático: ${summary.checked} revisados, ${summary.updated} actualizados, ${summary.unchanged} sin cambios, ${summary.errors} errores, ${summary.skipped} sin datos en Dropi`,
      );

      // Los numeros solos no dicen nada. Un "2 sin datos en Dropi" obliga a
      // conectarse a Dropi a mano para descubrir quais son, y si son productos
      // que siguen activos el cliente compra algo que no se puede enviar.
      for (const nombre of summary.skippedNames) {
        this.logger.warn(`Stock sync: sin datos en Dropi -> ${nombre}`);
      }
      for (const nombre of summary.errorNames) {
        this.logger.error(`Stock sync: fallo al leer de Dropi -> ${nombre}`);
      }

      if (summary.priceWarnings.length > 0) {
        this.logger.warn(
          `Stock sync: ${summary.priceWarnings.length} producto(s) por debajo del precio minimo de Dropi: ${summary.priceWarnings.map((w) => `${w.name} (${w.local} < ${w.suggested})`).join('; ')}`,
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Stock sync automático falló: ${message}`);
    }

    try {
      const updates = await this.tracking.syncAllPendingOrders();
      if (updates.length > 0) {
        this.logger.log(
          `Sync automático de estados Dropi: ${updates.length} orden(es) actualizada(s)`,
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Sync de estados Dropi falló: ${message}`);
    }

    try {
      const deleted = await this.tracking.syncDeletedOrders();
      if (deleted.length > 0) {
        this.logger.log(
          `Sync automático: ${deleted.length} envío(s) eliminado(s) en Dropi marcados como cancelados`,
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Sync de envíos eliminados falló: ${message}`);
    }
  }

  async syncStock(targetIds?: number[]): Promise<StockSyncSummary> {
    const localProducts = await this.prisma.product.findMany({
      where: { dropiProductId: { not: null } },
      select: {
        id: true,
        dropiProductId: true,
        name: true,
        price: true,
        stock: true,
        variations: true,
      },
    });

    if (localProducts.length === 0) {
      this.logger.warn('No hay productos importados de Dropi para sincronizar');
      return {
        checked: 0,
        updated: 0,
        unchanged: 0,
        errors: 0,
        skipped: 0,
        skippedNames: [],
        errorNames: [],
        details: [],
        priceWarnings: [],
      };
    }

    const wanted = new Set(
      targetIds && targetIds.length > 0
        ? targetIds
        : localProducts.map((p) => p.dropiProductId!),
    );

    const summary: StockSyncSummary = {
      checked: 0,
      updated: 0,
      unchanged: 0,
      errors: 0,
      skipped: 0,
      skippedNames: [],
      errorNames: [],
      details: [],
      priceWarnings: [],
    };

    for (const local of localProducts) {
      const dropiId = local.dropiProductId!;
      summary.checked++;

      if (!wanted.has(dropiId)) {
        summary.skipped++;
        summary.skippedNames.push(
          `${local.name} (${dropiId}, fuera de la seleccion)`,
        );
        continue;
      }

      // Uno por uno y en serie. Antes se paginaba el catalogo generico
      // (`search_type: 'simple'` sin keywords), pero eso devuelve solo los 88
      // productos de la propia tienda del dropshipper, no el catalogo del
      // proveedor: ningun producto importado aparecia nunca y el stock local
      // se quedaba congelado sin dar error. La busqueda por id si los ve.
      let dropiProduct: DropiProduct | null = null;
      try {
        dropiProduct = await this.products.getProductById(dropiId);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        summary.errors++;
        summary.errorNames.push(`${local.name} (${dropiId}): ${message}`);
        summary.details.push({
          id: dropiId,
          name: local.name,
          updated: false,
          error: `Dropi no respondio: ${message}`,
        });
        continue;
      }

      if (!dropiProduct) {
        summary.skipped++;
        summary.skippedNames.push(
          `${local.name} (${dropiId}): ya no existe en el catalogo de Dropi`,
        );
        summary.details.push({
          id: dropiId,
          name: local.name,
          updated: false,
          error: 'producto ausente en el catalogo de Dropi',
        });
        continue;
      }

      const stock = this.products.computeStock(dropiProduct);
      // Presentaciones del producto. Se guardan en `Product.variations` para
      // que la ficha deje elegir la variante y para mandar su `variation_id`
      // a Dropi. Tambien actualiza las que ya existian (los productos
      // importados antes de modelar variaciones quedarian con `null` y sin
      // selector en la ficha hasta que el sync los pase por aqui).
      const dropiVariations = this.products.buildVariations(dropiProduct);
      const localVariations = local.variations ?? null;
      const variationsChanged =
        JSON.stringify(localVariations) !==
        JSON.stringify(dropiVariations.length > 0 ? dropiVariations : null);
      const suggested = Number(dropiProduct.suggested_price) || 0;

      // Aviso, no correccion: si el precio quedo por debajo del minimo de
      // Dropi, la orden se va a rechazar aunque el stock este bien. Se revisa
      // siempre, incluso si el stock no cambia.
      const localPrice = Number(local.price) || 0;
      if (suggested > 0 && localPrice < suggested) {
        summary.priceWarnings.push({
          id: dropiId,
          name: local.name,
          local: localPrice,
          suggested,
        });
        this.logger.warn(
          `Sync: "${local.name}" esta en ${localPrice} y Dropi exige minimo ${suggested}; la orden sera rechazada`,
        );
      }

      // Solo se escribe si el stock O las presentaciones cambiaron. Antes se
      // actualizaba (y se contaba como "actualizado") aunque Dropi devolviera el
      // mismo numero, lo que ensuciaba el conteo del panel y golpeaba la base
      // sin motivo.
      if (stock === local.stock && !variationsChanged) {
        summary.unchanged++;
        summary.details.push({
          id: dropiId,
          name: local.name,
          updated: false,
          unchanged: true,
        });
        continue;
      }

      try {
        // Solo el stock (y las presentaciones, si cambiaron). El sync antes
        // tambien sobrescribia `price` y `oldPrice` con el precio sugerido de
        // Dropi, lo que deshacia a mano cualquier ajuste de precio. No se toca
        // el precio.
        await this.prisma.product.update({
          where: { id: local.id },
          data: {
            stock,
            ...(variationsChanged
              ? {
                  variations:
                    dropiVariations.length > 0
                      ? (dropiVariations as unknown as Prisma.InputJsonValue)
                      : Prisma.DbNull,
                }
              : {}),
          },
        });
        summary.updated++;
        summary.details.push({
          id: dropiId,
          name: local.name,
          updated: true,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        summary.errors++;
        summary.errorNames.push(`${local.name} (${dropiId}): ${message}`);
        summary.details.push({
          id: dropiId,
          name: local.name,
          updated: false,
          error: message,
        });
      }
    }

    // El sync escribe productos por fuera de ProductsService, asi que hay que
    // invalidar a mano. Se hace una sola vez al final y no por producto: cada
    // invalidacion es un SCAN y hacerlo por producto seria O(n) recorridos.
    if (summary.updated > 0) {
      await this.cache.invalidate('products');
      await this.cache.invalidate('product');
      await this.cache.invalidate('categories');
      await this.cache.invalidate('category');
    }

    return summary;
  }
}
