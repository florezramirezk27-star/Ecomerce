import { Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';
import { DropiModule } from '../dropi/dropi.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [PrismaModule, DropiModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
