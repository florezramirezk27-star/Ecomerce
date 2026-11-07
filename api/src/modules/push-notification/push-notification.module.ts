import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PushDeviceController } from './push-device.controller';
import { PushDeviceService } from './push-device.service';
import { FirebaseMessagingService } from './firebase-messaging.service';
import { PushNotificationService } from './push-notification.service';

@Module({
  imports: [PrismaModule],
  controllers: [PushDeviceController],
  providers: [PushDeviceService, FirebaseMessagingService, PushNotificationService],
  exports: [PushNotificationService, PushDeviceService],
})
export class PushNotificationModule {}
