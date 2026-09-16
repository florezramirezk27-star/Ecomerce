import { Module } from '@nestjs/common';
import { AveonlineController } from './aveonline.controller';
import { AveonlineService } from './aveonline.service';
import { AveonlineClient } from './aveonline.client';
import { AveonlineAuthService } from './aveonline.auth';
import { AveonlineProductsService } from './aveonline.products';
import { AveonlineOrdersService } from './aveonline.orders';
import { AveonlineTrackingService } from './aveonline.tracking';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AveonlineController],
  providers: [
    AveonlineClient,
    AveonlineAuthService,
    AveonlineProductsService,
    AveonlineOrdersService,
    AveonlineTrackingService,
    AveonlineService,
  ],
  exports: [AveonlineService],
})
export class AveonlineModule {}
