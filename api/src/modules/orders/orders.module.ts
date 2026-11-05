import { Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';
import { DropiModule } from '../dropi/dropi.module';
import { PushNotificationModule } from '../push-notification/push-notification.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [PrismaModule, DropiModule, PushNotificationModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
