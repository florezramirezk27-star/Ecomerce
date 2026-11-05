import { Test, TestingModule } from '@nestjs/testing';
import { PushDeviceController } from './push-device.controller';
import { PushDeviceService } from './push-device.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

describe('PushDeviceController', () => {
  let controller: PushDeviceController;
  let deviceService: PushDeviceService;

  const registerOrUpdateMock = jest.fn();
  const removeMock = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PushDeviceController],
      providers: [
        {
          provide: PushDeviceService,
          useValue: {
            registerOrUpdate: registerOrUpdateMock,
            remove: removeMock,
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PushDeviceController>(PushDeviceController);
    deviceService = module.get<PushDeviceService>(PushDeviceService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /notifications/devices', () => {
    it('registra el token del administrador autenticado', async () => {
      registerOrUpdateMock.mockResolvedValue({ id: 'dev-1' });

      const req: any = { user: { id: 'admin-1', role: 'ADMIN' } };
      const result = await controller.register(req, {
        token: 'fcm-token-123',
        platform: 'android',
      });

      expect(deviceService.registerOrUpdate).toHaveBeenCalledWith(
        'admin-1',
        'fcm-token-123',
        'android',
      );
      expect(result).toEqual({ ok: true });
    });

    it('actualiza el dispositivo existente sin duplicar', async () => {
      registerOrUpdateMock.mockResolvedValue({ id: 'dev-1', platform: 'ios' });

      const req: any = { user: { id: 'admin-1', role: 'ADMIN' } };
      await controller.register(req, {
        token: 'fcm-token-123',
        platform: 'ios',
      });

      expect(registerOrUpdateMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('DELETE /notifications/devices', () => {
    it('elimina el dispositivo del administrador autenticado', async () => {
      removeMock.mockResolvedValue({ id: 'dev-1' });

      const req: any = { user: { id: 'admin-1', role: 'ADMIN' } };
      const result = await controller.remove(req, {
        token: 'fcm-token-123',
        platform: 'android',
      });

      expect(deviceService.remove).toHaveBeenCalledWith('admin-1', 'fcm-token-123');
      expect(result).toEqual({ ok: true });
    });
  });

  describe('guardas de rol', () => {
    it('solo ADMIN puede acceder (verificado por decorador Roles)', () => {
      const registerHandler = Reflect.getMetadata(
        'roles',
        PushDeviceController.prototype.register,
      );
      const removeHandler = Reflect.getMetadata(
        'roles',
        PushDeviceController.prototype.remove,
      );

      expect(registerHandler).toContain('ADMIN');
      expect(removeHandler).toContain('ADMIN');
    });
  });
});
