import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CategoriesModule } from './modules/categories/categories.module';
import { ProductsModule } from './modules/products/products.module';
import { CartModule } from './modules/cart/cart.module';
import { OrdersModule } from './modules/orders/orders.module';
import { UploadModule } from './modules/uploads/upload.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { MailModule } from './modules/mail/mail.module';
import { SettingsModule } from './modules/settings/settings.module';
import { DropiModule } from './modules/dropi/dropi.module';
import { DropiIntegrationModule } from './modules/dropi-integration/dropi-integration.module';
import { ChatModule } from './modules/chat/chat.module';
import { PresenceModule } from './modules/presence/presence.module';
import { AIModule } from './modules/ai/ai.module';
import { MetaModule } from './modules/meta/meta.module';
import { CsrfGuard } from './common/guards/csrf.guard';
import { RedisModule } from './common/redis/redis.module';
import { RedisService } from './common/redis/redis.service';
import { RedisThrottlerStorage } from './common/redis/redis-throttler.storage';
import { CacheModule } from './common/cache/cache.module';

/**
 * Lee un entero positivo de la configuración. Los valores predeterminados
 * mantienen el límite actual; el entorno de pruebas puede aumentarlo sin
 * modificar ni debilitar por accidente la configuración de producción.
 */
function positiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} debe ser un entero positivo`);
  }
  return value;
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    RedisModule,
    CacheModule,
    ThrottlerModule.forRootAsync({
      inject: [RedisService],
      useFactory: (redis: RedisService) => ({
        // El storage por defecto de Nest es un Map en memoria que nunca se poda
        // y crea un setTimeout por request. Con Redis el limite es global entre
        // réplicas y cada ventana expira sola.
        storage: new RedisThrottlerStorage(redis),
        throttlers: [
          {
            // Los valores por defecto conservan el límite existente: 100
            // solicitudes por IP cada 60 segundos. Para pruebas de carga,
            // ajustarlos solo en un entorno aislado, no en producción.
            ttl: positiveIntegerEnv('HTTP_RATE_LIMIT_TTL_MS', 60000),
            limit: positiveIntegerEnv('HTTP_RATE_LIMIT_MAX', 100),
          },
        ],
      }),
    }),
    PrismaModule,
    UsersModule,
    AuthModule,
    CategoriesModule,
    ProductsModule,
    CartModule,
    OrdersModule,
    UploadModule,
    DashboardModule,
    MailModule,
    SettingsModule,
    DropiModule,
    DropiIntegrationModule,
    ChatModule,
    PresenceModule,
    AIModule,
    MetaModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
  ],
})
export class AppModule {}
