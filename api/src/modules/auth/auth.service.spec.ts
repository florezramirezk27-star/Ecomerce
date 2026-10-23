import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ServiceUnavailableException } from '@nestjs/common';
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
  const sessionFindUnique = jest.fn();
  const userFindUnique = jest.fn();
  const sessionCreate = jest.fn();
  const transaction = jest.fn();
  const cacheGet = jest.fn();
  const cacheSet = jest.fn();
  const cacheInvalidate = jest.fn();
  const cacheInvalidateUser = jest.fn();

  /**
   * Redis del intercambio OAuth.
   *
   * `isEnabled` decide si el codigo vive en Redis (fuente de verdad) o en el
   * Map local (modo desarrollo sin Redis). `getAndDelete` consume el codigo
   * de forma atomica.
   */
  const redisIsEnabled = jest.fn();
  const redisGetAndDelete = jest.fn();
  const redisSetWithTtl = jest.fn();
  const redisMock = {
    isEnabled: redisIsEnabled,
    getAndDelete: redisGetAndDelete,
    setWithTtl: redisSetWithTtl,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    findByResetToken.mockResolvedValue(null);
    usersUpdate.mockResolvedValue({});
    sessionDeleteMany.mockResolvedValue({ count: 0 });
    sessionFindUnique.mockResolvedValue(null);
    userFindUnique.mockResolvedValue(null);
    sessionCreate.mockResolvedValue({
      id: 'sess-nueva',
      userId: 'user-1',
      token: 'tok',
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    // `$transaction` recibe un callback y le pasa un cliente `tx` con la misma
    // forma que `prisma`. El mock lo ejecuta tal cual para que el test valide el
    // flujo real (borrar + crear dentro de la misma transaccion).
    transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
      Promise.resolve(
        cb({
          session: {
            deleteMany: sessionDeleteMany,
            create: sessionCreate,
          },
        }),
      ),
    );
    cacheGet.mockResolvedValue(null);
    cacheSet.mockResolvedValue(undefined);
    cacheInvalidate.mockResolvedValue(undefined);
    cacheInvalidateUser.mockResolvedValue(undefined);
    // Por defecto, sin Redis: el modo local.
    redisIsEnabled.mockReturnValue(false);
    redisGetAndDelete.mockResolvedValue(null);
    redisSetWithTtl.mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: { findByResetToken, update: usersUpdate },
        },
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('jwt-firmado') },
        },
        {
          provide: MailService,
          useValue: {},
        },
        {
          provide: PrismaService,
          useValue: {
            session: {
              deleteMany: sessionDeleteMany,
              findUnique: sessionFindUnique,
            },
            user: { findUnique: userFindUnique },
            $transaction: transaction,
          },
        },
        {
          provide: RedisService,
          useValue: redisMock,
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

  describe('refreshSession', () => {
    const sesionViva = {
      id: 'sess-vieja',
      userId: 'user-1',
      token: 'tok-viejo',
      expiresAt: new Date(Date.now() + 60_000),
    };

    beforeEach(() => {
      sessionFindUnique.mockResolvedValue(sesionViva);
      userFindUnique.mockResolvedValue({
        id: 'user-1',
        email: 'admin@kronio.co',
        name: 'Admin',
        role: 'ADMIN',
      });
    });

    it('rota la sesion dentro de una transaccion y devuelve un JWT nuevo', async () => {
      const result = await service.refreshSession('user-1', 'sess-vieja');

      // La rotacion ocurre en UNA transaccion: si se hiciera secuencial (crear
      // y luego borrar) una peticion que llegara en medio veria la cookie vieja
      // invalida sin que la nueva exista todavia.
      expect(transaction).toHaveBeenCalledTimes(1);
      expect(sessionDeleteMany).toHaveBeenCalledWith({
        where: { id: 'sess-vieja', userId: 'user-1' },
      });
      expect(sessionCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
        }) as unknown,
      });

      // El cache de la sesion vieja debe invalidarse para que no siga sirviendo.
      expect(cacheInvalidate).toHaveBeenCalledWith('sess-vieja');
      expect(result.access_token).toBe('jwt-firmado');
      expect(result.user).toEqual(
        expect.objectContaining({ id: 'user-1', role: 'ADMIN' }),
      );
    });

    it('rechaza el refresh si la sesion ya expiro', async () => {
      sessionFindUnique.mockResolvedValue({
        ...sesionViva,
        expiresAt: new Date(Date.now() - 60_000),
      });

      await expect(
        service.refreshSession('user-1', 'sess-vieja'),
      ).rejects.toThrow('Sesión expirada o inválida');

      // Nada se rota si la sesion no es valida.
      expect(transaction).not.toHaveBeenCalled();
    });

    it('rechaza el refresh si la sesion pertenece a otro usuario', async () => {
      sessionFindUnique.mockResolvedValue({ ...sesionViva, userId: 'otro' });

      await expect(
        service.refreshSession('user-1', 'sess-vieja'),
      ).rejects.toThrow('Sesión expirada o inválida');

      expect(transaction).not.toHaveBeenCalled();
    });
  });

  describe('intercambio OAuth', () => {
    const usuario = {
      id: 'user-1',
      name: 'Ana',
      email: 'ana@kronio.co',
      role: 'CUSTOMER' as const,
    };

    it('con Redis, guarda el codigo en Redis y no en el Map local', async () => {
      redisIsEnabled.mockReturnValue(true);

      const codigo = await service.generateExchangeCode('tok', usuario);

      expect(redisSetWithTtl).toHaveBeenCalledWith(
        expect.stringContaining(codigo),
        expect.any(Number),
        JSON.stringify({ token: 'tok', user: usuario }),
      );
    });

    it('con Redis, canjea el codigo leyendolo de Redis', async () => {
      redisIsEnabled.mockReturnValue(true);
      redisGetAndDelete.mockResolvedValue(
        JSON.stringify({ token: 'tok', user: usuario }),
      );

      const resultado = await service.exchangeCode('codigo-123');

      expect(resultado).toEqual({ access_token: 'tok', user: usuario });
      expect(redisGetAndDelete).toHaveBeenCalledWith(
        expect.stringContaining('codigo-123'),
      );
    });

    it('con Redis, no recurre al Map local si el codigo no existe', async () => {
      redisIsEnabled.mockReturnValue(true);
      redisGetAndDelete.mockResolvedValue(null);

      const resultado = await service.exchangeCode('codigo-inexistente');

      expect(resultado).toBeNull();
      // El Map local no se consulta: con Redis activo la fuente de verdad es
      // Redis, y un codigo que esta en un lado y no en el otro fallaria de
      // forma intermitente.
      expect(redisGetAndDelete).toHaveBeenCalledTimes(1);
    });

    it('con Redis, un fallo de infraestructura es 503 y no "código inválido"', async () => {
      redisIsEnabled.mockReturnValue(true);
      redisGetAndDelete.mockRejectedValue(new Error('Redis no disponible'));

      // Un 400 "código inválido" seria mentira: el problema no es el codigo,
      // es que Redis no responde, y el cliente deberia poder reintentar.
      await expect(service.exchangeCode('codigo-123')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('con Redis, un fallo al guardar el codigo es 503', async () => {
      redisIsEnabled.mockReturnValue(true);
      redisSetWithTtl.mockResolvedValue(false);

      await expect(
        service.generateExchangeCode('tok', usuario),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('rechaza un valor con la estructura manipulada', async () => {
      redisIsEnabled.mockReturnValue(true);

      // Token que no es texto.
      redisGetAndDelete.mockResolvedValue(
        JSON.stringify({ token: 42, user: usuario }),
      );
      await expect(service.exchangeCode('codigo')).resolves.toBeNull();

      // Rol que no existe.
      redisGetAndDelete.mockResolvedValue(
        JSON.stringify({
          token: 'tok',
          user: { ...usuario, role: 'SUPERADMIN' },
        }),
      );
      await expect(service.exchangeCode('codigo')).resolves.toBeNull();

      // Usuario que no es un objeto.
      redisGetAndDelete.mockResolvedValue(
        JSON.stringify({ token: 'tok', user: 'ana' }),
      );
      await expect(service.exchangeCode('codigo')).resolves.toBeNull();

      // JSON invalido.
      redisGetAndDelete.mockResolvedValue('{no es json');
      await expect(service.exchangeCode('codigo')).resolves.toBeNull();
    });

    it('sin Redis, el modo local guarda y canjea el codigo', async () => {
      redisIsEnabled.mockReturnValue(false);

      const codigo = await service.generateExchangeCode('tok', usuario);
      const resultado = await service.exchangeCode(codigo);

      expect(resultado).toEqual({ access_token: 'tok', user: usuario });
      expect(redisSetWithTtl).not.toHaveBeenCalled();
    });

    it('sin Redis, el codigo local es de un solo uso', async () => {
      redisIsEnabled.mockReturnValue(false);

      const codigo = await service.generateExchangeCode('tok', usuario);

      await expect(service.exchangeCode(codigo)).resolves.toEqual({
        access_token: 'tok',
        user: usuario,
      });
      // La segunda vez ya no esta: se borro al canjearlo.
      await expect(service.exchangeCode(codigo)).resolves.toBeNull();
    });
  });
});
