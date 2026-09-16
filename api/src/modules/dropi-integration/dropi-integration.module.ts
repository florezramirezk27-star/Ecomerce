import { Module } from '@nestjs/common';
import { WooCommerceController } from './woocommerce.controller';
import { WooCommerceService } from './woocommerce.service';
import { DropiModule } from '../dropi/dropi.module';

@Module({
  imports: [DropiModule],
  controllers: [WooCommerceController],
  providers: [WooCommerceService],
})
export class DropiIntegrationModule {}
