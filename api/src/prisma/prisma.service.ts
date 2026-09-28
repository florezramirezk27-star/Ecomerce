import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const logger = new Logger('PrismaService');

/**
 * Limites de pool y timeouts aplicados a la conexion.
 *
 * Sin `statement_timeout` un unico query sin indice puede retener una conexion
 * del pool indefinidamente; con varios a la vez el pool se agota y toda la API
 * se cuelga en vez de fallar rapido.
 */
const POOL_DEFAULTS: Record<string, string> = {
  connection_limit: process.env.DB_POOL_SIZE || '10',
  pool_timeout: process.env.DB_POOL_TIMEOUT || '20',
  connect_timeout: process.env.DB_CONNECT_TIMEOUT || '10',
  statement_timeout: process.env.DB_STATEMENT_TIMEOUT || '15000',
};

const POOL_PARAMS = Object.keys(POOL_DEFAULTS);

/**
 * Anade los limites de pool al DATABASE_URL solo si no estan ya definidos, para
 * no sobreescribir una configuracion explicita del `.env`.
 */
export function withPoolLimits(rawUrl: string): string {
  if (!rawUrl) return rawUrl;

  try {
    const url = new URL(rawUrl);

    const missing = POOL_PARAMS.filter((param) => !url.searchParams.has(param));
    if (missing.length === 0) return rawUrl;

    for (const param of missing) {
      url.searchParams.set(param, POOL_DEFAULTS[param]);
    }

    return url.toString();
  } catch {
    logger.warn(
      'No se pudieron aplicar los limites de pool: DATABASE_URL no es un URL valido. Revisa DATABASE_URL.',
    );
    return rawUrl;
  }
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      datasourceUrl: withPoolLimits(process.env.DATABASE_URL || ''),
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      logger.log(
        `Conectado a Postgres (pool=${POOL_DEFAULTS.connection_limit}, statement_timeout=${POOL_DEFAULTS.statement_timeout}ms)`,
      );
    } catch (error) {
      // No se lanza: permite que la app levante y el /health reporte el estado
      // real, en vez de morir antes de que el orquestador pueda observarla.
      logger.error(
        `No se pudo conectar a Postgres: ${(error as Error).message}`,
      );
    }
  }

  /** Cierra el pool para que el rolling update no corte requests en vuelo. */
  async onModuleDestroy() {
    try {
      await this.$disconnect();
      logger.log('Pool de Postgres cerrado');
    } catch (error) {
      logger.error(
        `Error cerrando el pool de Postgres: ${(error as Error).message}`,
      );
    }
  }
}
