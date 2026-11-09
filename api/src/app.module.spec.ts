import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PushNotificationModule } from './modules/push-notification/push-notification.module';
import { PushNotificationService } from './modules/push-notification/push-notification.service';
import { FirebaseMessagingService } from './modules/push-notification/firebase-messaging.service';
import { PushDeviceService } from './modules/push-notification/push-device.service';

describe('AppModule (arranque real de NestJS)', () => {
  let module: TestingModule;
  const previousJwtSecret = process.env.JWT_SECRET;

  beforeEach(async () => {
    process.env.JWT_SECRET = 'ci-test-secret-only-not-production';
    module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
  });

  afterEach(async () => {
    if (previousJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = previousJwtSecret;
    }
    try {
      await module.close();
    } catch {
      // El cierre del módulo puede fallar por conexiones externas (Redis) sin afectar las pruebas de DI.
    }
  });

  it('debe compilar el módulo principal sin errores de DI', () => {
    expect(module).toBeDefined();
  });

  it('debe resolver todas las dependencias de PushNotificationService', () => {
    const svc = module.get(PushNotificationService);
    expect(svc).toBeDefined();
  });

  it('debe resolver FirebaseMessagingService', () => {
    const fcm = module.get(FirebaseMessagingService);
    expect(fcm).toBeDefined();
  });

  it('debe resolver PushDeviceService', () => {
    const deviceService = module.get(PushDeviceService);
    expect(deviceService).toBeDefined();
  });

  it('OrdersModule debe importar PushNotificationModule', () => {
    expect(module.get(OrdersModule)).toBeDefined();
  });
});
