import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import express from 'express';
import type { IncomingMessage } from 'http';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { RedisService } from './common/redis/redis.service';

async function bootstrap() {
  const server = express();

  // `verify` guarda el cuerpo crudo antes de que `express.json()` lo reserialice.
  // El webhook de Dropi valida una firma HMAC sobre esos bytes exactos: si se
  // firmara el objeto ya parseado, el JSON reordenado no coincidiria y toda
  // firma valida seria rechazada.
  //
  // Solo se guarda en memoria (Buffer) y solo para el tamano que ya permite
  // `limit`; no se persiste en disco ni se registra en logs.
  server.use(
    express.json({
      limit: '1mb',
      verify: (req: IncomingMessage, _res, buf: Buffer) => {
        (req as IncomingMessage & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  server.use(express.urlencoded({ limit: '1mb', extended: true }));
  server.use(cookieParser());

  const app = await NestFactory.create(AppModule, new ExpressAdapter(server));

  // Sin esto, detras de un balanceador todas las peticiones comparten la IP del
  // proxy: el rate limiting por IP se vuelve inutil y los logs no muestran al
  // cliente real. El numero indica cuantos saltos de proxy confiar.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // Cierra el pool de Postgres y Redis de forma ordenada en SIGTERM, para que un
  // rolling update no corte requests en vuelo.
  app.enableShutdownHooks();

  app.use(helmet());

  const allowedOrigins = (
    process.env.CORS_ORIGIN || 'https://ecomerce-delta-three.vercel.app'
  )
    .split(',')
    .map((o) => o.trim());

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle('Ecommerce API')
    .setDescription('API Ecommerce')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      'JWT-auth',
    )
    .build();

  app.useGlobalFilters(new GlobalExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  if (process.env.NODE_ENV !== 'production') {
    const document = SwaggerModule.createDocument(app, config);

    SwaggerModule.setup('api', app, document);
  }

  const port = Number(process.env.PORT) || 3001;
  await app.listen(port);

  await reportRedisAtStartup(app);
}

/**
 * Verifica al arrancar que el rate limiting este realmente activo.
 *
 * Sin `REDIS_URL`, `RedisService` no construye cliente, el storage de
 * throttling devuelve siempre "no bloqueado" y **toda** la limitacion de tasa
 * queda desactivada sin dar ningun error. `/health` sigue devolviendo 200 y el
 * despliegue parece correcto, asi que esto solo se detecta cuando ya hubo un
 * abuso. `REDIS_REQUIRED` convierte el fallo en un 503 en `/ready`.
 *
 * Fallar abierto durante un incidente es correcto, pero solo si es visible.
 */
async function reportRedisAtStartup(app: INestApplication): Promise<void> {
  const logger = new Logger('Bootstrap');
  const redis = app.get(RedisService);
  const status = redis.status();

  if (status === 'ready') {
    logger.log('Rate limiting respaldado por Redis: activo');
    return;
  }

  if (!redis.isEnabled()) {
    const mensaje =
      'REDIS_URL no esta configurado: el rate limiting esta DESACTIVADO ' +
      '(ningun endpoint limitara peticiones) y el cache no persiste. ' +
      'Configura REDIS_URL antes de exponer la API.';

    if (process.env.REDIS_REQUIRED === 'true') {
      // El orquestador tiene que ver esto: si para el despliegue, un Redis mal
      // configurado no llega a produccion a escondidas.
      throw new Error(mensaje);
    }

    logger.error(mensaje);
    return;
  }

  // Hay URL pero Redis no responde todavia. Se reintenta: puede estar levantando.
  const conectado = await redis.ping();
  if (conectado) {
    logger.log('Rate limiting respaldado por Redis: activo');
    return;
  }

  logger.warn(
    'Redis configurado pero no responde: el rate limiting opera en modo ' +
      'fail-open hasta que se recupere.',
  );
}

bootstrap();
