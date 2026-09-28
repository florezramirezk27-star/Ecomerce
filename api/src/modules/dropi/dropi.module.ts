import { Module } from '@nestjs/common';
import { DropiController } from './dropi.controller';
import { DropiService } from './dropi.service';
import { DropiClient } from './dropi.client';
import { DropiAuthService } from './dropi.auth';
import { DropiProductsService } from './dropi.products';
import { DropiOrdersService } from './dropi.orders';
import { DropiTrackingService } from './dropi.tracking';
import { DropiSyncService } from './dropi.sync';
import { PrismaModule } from '../../prisma/prisma.module';
import { DropiWebhookGuard } from '../../common/guards/dropi-webhook.guard';

@Module({
  imports: [PrismaModule],
  controllers: [DropiController],
  providers: [
    DropiClient,
    DropiAuthService,
    DropiProductsService,
    DropiOrdersService,
    DropiTrackingService,
    DropiSyncService,
    DropiService,
    // Registrado para que Nest lo resuelva por DI. Sin esto funciona igual
    // (no tiene dependencias de constructor), pero queda explicito.
    DropiWebhookGuard,
  ],
  exports: [DropiService, DropiTrackingService],
})
export class DropiModule {}
