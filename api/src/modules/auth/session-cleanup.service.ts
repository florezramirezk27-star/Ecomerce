import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Cada cuanto se ejecuta la limpieza de sesiones caducadas.
 *
 * Se deja configurable por env para poder bajarlo en pruebas; por defecto una
 * hora, que es suficiente: las sesiones caducadas no molestan a nadie hasta que
 * la tabla crece de mas.
 */
const SWEEP_INTERVAL_MS = Number(
  process.env.SESSION_SWEEP_INTERVAL_MS || 60 * 60 * 1000,
);

/**
 * Borra de la base de datos las sesiones ya caducadas.
 *
 * Sin esto la tabla `Session` crece sin limite: se crea una sesion en cada login
 * y en cada refresh, y nada borra las que expiran (el logout solo quita la
 * propia). En produccion se llegaron a acumular 137 sesiones muertas frente a 1
 * viva. Ademas de la basura, el `findUnique` del refresh se hace mas lento con
 * cada fila antigua.
 *
 * Solo borra filas con `expiresAt < now`: ninguna sesion activa se ve afectada.
 */
@Injectable()
export class SessionCleanupService implements OnModuleDestroy {
  private readonly logger = new Logger(SessionCleanupService.name);
  private readonly sweeper: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {
    this.sweeper = setInterval(() => {
      void this.sweep();
    }, SWEEP_INTERVAL_MS);
    this.sweeper.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.sweeper);
  }

  /** Limpia las sesiones caducadas y registra cuantas borro. */
  async sweep(): Promise<number> {
    try {
      const { count } = await this.prisma.session.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });

      if (count > 0) {
        this.logger.log(`Sesiones caducadas eliminadas: ${count}`);
      }
      return count;
    } catch (error) {
      this.logger.error(
        `No se pudieron limpiar las sesiones caducadas: ${
          error instanceof Error ? error.message : 'error desconocido'
        }`,
      );
      return 0;
    }
  }
}
