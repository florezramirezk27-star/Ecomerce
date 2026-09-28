import { Test, TestingModule } from '@nestjs/testing';

import { PresenceService } from './presence.service';
import type { PresenceMeta } from './presence.service';
import { RedisService } from '../../common/redis/redis.service';

const META_KEY = 'presence:storefront:meta';

describe('PresenceService', () => {
  let service: PresenceService;

  const isEnabled = jest.fn<boolean, []>();
  const sortedSetAdd = jest.fn<Promise<boolean>, [string, string, number]>();
  const sortedSetTrim = jest.fn<Promise<number>, [string, number]>();
  const sortedSetCount = jest.fn<Promise<number>, [string]>();
  const getHashField = jest.fn<
    Promise<string | null | undefined>,
    [string, string]
  >();
  const getHashAll = jest.fn<
    Promise<Record<string, string> | null>,
    [string]
  >();
  const setHashField = jest.fn<Promise<boolean>, [string, string, string]>();

  const VISITOR = 'visitante-abc12345';

  /** Metadatos tal y como los deja guardados. */
  const guardado = (llamada = 0): PresenceMeta =>
    JSON.parse(setHashField.mock.calls[llamada][2]) as PresenceMeta;

  beforeEach(async () => {
    jest.clearAllMocks();

    isEnabled.mockReturnValue(true);
    sortedSetAdd.mockResolvedValue(true);
    sortedSetTrim.mockResolvedValue(1);
    sortedSetCount.mockResolvedValue(1);
    getHashField.mockResolvedValue(null);
    getHashAll.mockResolvedValue({});
    setHashField.mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PresenceService,
        {
          provide: RedisService,
          useValue: {
            isEnabled,
            sortedSetAdd,
            sortedSetTrim,
            sortedSetCount,
            getHashField,
            getHashAll,
            setHashField,
          },
        },
      ],
    }).compile();

    service = module.get<PresenceService>(PresenceService);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  describe('heartbeat con Redis', () => {
    it('lee solo el campo de ESE visitante, no el hash entero', async () => {
      // El motivo del cambio: con 1000 usuarios concurrentes, cada latido se
      // traia los metadatos de los otros 999 para leer una sola entrada. Eso
      // es O(n) por cliente y O(n^2) en cada ronda de latidos.
      await service.heartbeat({ visitorId: VISITOR, lastPath: '/productos' });

      expect(getHashField).toHaveBeenCalledWith(META_KEY, VISITOR);
      expect(getHashAll).not.toHaveBeenCalled();
    });

    it('no persiste si Redis no acepta el latido', async () => {
      sortedSetAdd.mockResolvedValue(false);

      const resultado = await service.heartbeat({ visitorId: VISITOR });

      expect(getHashField).not.toHaveBeenCalled();
      expect(setHashField).not.toHaveBeenCalled();
      expect(resultado.visitorId).toBe(VISITOR);
    });

    it('conserva la primera vez que se vio el visitante', async () => {
      const primera = Date.now() - 10 * 60_000;
      const previo: PresenceMeta = {
        visitorId: VISITOR,
        firstSeenAt: primera,
        lastPath: '/',
        referrer: '',
        userId: null,
        isReturning: true,
      };
      getHashField.mockResolvedValue(JSON.stringify(previo));

      await service.heartbeat({ visitorId: VISITOR, lastPath: '/carrito' });

      const meta = guardado();
      expect(meta.firstSeenAt).toBe(primera);
      expect(meta.isReturning).toBe(true);
      expect(meta.lastPath).toBe('/carrito');
    });

    it('un metadato previo corrupto no rompe el latido', async () => {
      getHashField.mockResolvedValue('{no es json');

      const resultado = await service.heartbeat({ visitorId: VISITOR });

      expect(resultado.visitorId).toBe(VISITOR);
      expect(guardado().firstSeenAt).toBeGreaterThan(0);
    });

    it('rechaza un visitorId con forma invalida sin tocar Redis', async () => {
      const resultado = await service.heartbeat({ visitorId: 'corto' });

      expect(resultado.visitorId).toBeNull();
      expect(sortedSetAdd).not.toHaveBeenCalled();
    });
  });

  describe('heartbeat sin Redis', () => {
    it('cae a memoria sin intentar leer el hash', async () => {
      isEnabled.mockReturnValue(false);

      const primero = await service.heartbeat({
        visitorId: VISITOR,
        lastPath: '/',
      });
      const segundo = await service.heartbeat({
        visitorId: VISITOR,
        lastPath: '/carrito',
      });
      const otro = await service.heartbeat({
        visitorId: 'visitante-xyz98765',
        lastPath: '/',
      });

      expect(getHashField).not.toHaveBeenCalled();
      expect(primero.online).toBe(1);
      expect(segundo.online).toBe(1);
      expect(otro.online).toBe(2);
    });
  });
});
