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
  ],
  exports: [DropiService, DropiTrackingService],
})
export class DropiModule {}
