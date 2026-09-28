import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { SessionCacheService } from './session-cache.service';

describe('AuthService', () => {
  let service: AuthService;

  // Mocks a nivel de modulo, no de test: asi se inyectan por `useValue` y
  // cada test solo configura el comportamiento que necesita, sin castear el
  // servicio a `any` para llegar a sus dependencias privadas.
  const findByResetToken = jest.fn();
  const usersUpdate = jest.fn();
  const sessionDeleteMany = jest.fn();
  const cacheGet = jest.fn();
  const cacheSet = jest.fn();
  const cacheInvalidate = jest.fn();
  const cacheInvalidateUser = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();

    findByResetToken.mockResolvedValue(null);
    usersUpdate.mockResolvedValue({});
    sessionDeleteMany.mockResolvedValue({ count: 0 });
    cacheGet.mockResolvedValue(null);
    cacheSet.mockResolvedValue(undefined);
    cacheInvalidate.mockResolvedValue(undefined);
    cacheInvalidateUser.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: { findByResetToken, update: usersUpdate },
        },
        {
          provide: JwtService,
          useValue: {},
        },
        {
          provide: MailService,
          useValue: {},
        },
        {
          provide: PrismaService,
          useValue: { session: { deleteMany: sessionDeleteMany } },
        },
        {
          provide: RedisService,
          useValue: {},
        },
        {
          provide: SessionCacheService,
          useValue: {
            get: cacheGet,
            set: cacheSet,
            invalidate: cacheInvalidate,
            invalidateUser: cacheInvalidateUser,
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('resetPassword', () => {
    it('cierra todas las sesiones del usuario y limpia el cache', async () => {
      findByResetToken.mockResolvedValue({
        id: 'user-1',
        resetTokenExpiry: new Date(Date.now() + 60_000),
      });

      await service.resetPassword('token-valido', 'NuevaClave123!');

      expect(usersUpdate).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ resetToken: null, resetTokenExpiry: null }),
      );

      // Sin esto, un atacante con una sesion robada mantiene el acceso tras
      // que la victima resetee la contrasena.
      expect(sessionDeleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
      expect(cacheInvalidateUser).toHaveBeenCalledWith('user-1');
    });
  });
});
