import { WsException } from '@nestjs/websockets';
import type { ThrottlerRequest, ThrottlerStorage } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import type { Socket } from 'socket.io';

import { WsThrottlerGuard } from './ws-throttler.guard';

/** Socket minimo: al guard solo le interesan `handshake` y `conn`. */
function fakeSocket(options: {
  address?: string;
  remoteAddress?: string;
  forwardedFor?: string;
}): Socket {
  return {
    handshake: {
      address: options.address,
      headers: options.forwardedFor
        ? { 'x-forwarded-for': options.forwardedFor }
        : {},
    },
    conn: { remoteAddress: options.remoteAddress },
  } as unknown as Socket;
}

function fakeContext(client: Socket) {
  return {
    switchToWs: () => ({ getClient: () => client }),
    getHandler: () => function handler() {},
    getClass: () => class Gateway {},
  } as never;
}

/** Registro que devuelve el storage, replicando la forma de la lib. */
interface ThrottlerRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/** Los cinco argumentos que el guard pasa a `storage.increment`. */
type IncrementArgs = [string, number, number, number, string];

type Increment = jest.Mock<Promise<ThrottlerRecord>, IncrementArgs>;

const OK: ThrottlerRecord = {
  totalHits: 1,
  timeToExpire: 60_000,
  isBlocked: false,
  timeToBlockExpire: 0,
};

function request(overrides: Partial<ThrottlerRequest> = {}): ThrottlerRequest {
  return {
    context: fakeContext(fakeSocket({ address: '10.0.0.1' })),
    limit: 10,
    ttl: 60_000,
    blockDuration: 0,
    throttler: { name: 'default', ttl: 60_000, limit: 100 },
    getTracker: () => Promise.resolve('tracker'),
    generateKey: () => 'key',
    ...overrides,
  };
}

function mockIncrement(record: ThrottlerRecord = OK): Increment {
  return jest
    .fn<Promise<ThrottlerRecord>, IncrementArgs>()
    .mockResolvedValue(record);
}

function makeGuard(increment: Increment): WsThrottlerGuard {
  const storage = {
    increment,
  } as unknown as ThrottlerStorage;

  return new WsThrottlerGuard({ throttlers: [] }, storage, new Reflector());
}

/** Argumentos de una llamada concreta a `increment`, ya tipados. */
function args(increment: Increment, llamada = 0): IncrementArgs {
  return increment.mock.calls[llamada];
}

describe('WsThrottlerGuard', () => {
  describe('identidad del cliente', () => {
    it('usa la ULTIMA entrada de X-Forwarded-For, no la primera', async () => {
      // Con `trust proxy: 1` se confia en un salto. La IP real del cliente es
      // la que anadio el proxy de confianza; las anteriores las puede poner
      // cualquiera. Usar la primera haria que todos los usuarios de un mismo
      // proxy compartieran la IP de la izquierda y un unico contador.
      const increment = mockIncrement();
      const guard = makeGuard(increment);

      await guard.handleRequest(
        request({
          context: fakeContext(
            fakeSocket({
              address: '172.16.0.9',
              forwardedFor: '1.1.1.1, 2.2.2.2',
            }),
          ),
        }),
      );

      expect(args(increment)[0]).toBe('ws_default_2.2.2.2');
    });

    it('tolera espacios en la cabecera', async () => {
      const increment = mockIncrement();
      const guard = makeGuard(increment);

      await guard.handleRequest(
        request({
          context: fakeContext(
            fakeSocket({
              address: '172.16.0.9',
              forwardedFor: ' 1.1.1.1 ,  2.2.2.2 ',
            }),
          ),
        }),
      );

      expect(args(increment)[0]).toBe('ws_default_2.2.2.2');
    });

    it('sin la cabecera cae a handshake.address', async () => {
      const increment = mockIncrement();
      const guard = makeGuard(increment);

      await guard.handleRequest(
        request({
          context: fakeContext(fakeSocket({ address: '203.0.113.7' })),
        }),
      );

      expect(args(increment)[0]).toBe('ws_default_203.0.113.7');
    });

    it('sin nada usa remoteAddress y no "undefined"', async () => {
      const increment = mockIncrement();
      const guard = makeGuard(increment);

      await guard.handleRequest(
        request({
          context: fakeContext(fakeSocket({ remoteAddress: '198.51.100.4' })),
        }),
      );

      const [clave] = args(increment);
      expect(clave).toBe('ws_default_198.51.100.4');
      expect(clave).not.toContain('undefined');
    });
  });

  describe('separacion de contadores', () => {
    it('dos throttlers distintos no comparten contador', async () => {
      const increment = mockIncrement();
      const guard = makeGuard(increment);

      await guard.handleRequest(request());
      await guard.handleRequest(
        request({ throttler: { name: 'chat', ttl: 1_000, limit: 5 } }),
      );

      expect(args(increment, 0)[0]).toBe('ws_default_10.0.0.1');
      expect(args(increment, 1)[0]).toBe('ws_chat_10.0.0.1');
    });

    it('pasa el nombre del throttler al storage', async () => {
      const increment = mockIncrement();
      const guard = makeGuard(increment);

      await guard.handleRequest(
        request({ throttler: { name: 'chat', ttl: 1_000, limit: 5 } }),
      );

      expect(args(increment)[4]).toBe('chat');
    });

    it('no manda nombre vacio al storage', async () => {
      // Con `''` todos los decoradores caian en el mismo contador de Redis.
      const increment = mockIncrement();
      const guard = makeGuard(increment);

      await guard.handleRequest(
        request({ throttler: { ttl: 1_000, limit: 5 } }),
      );

      expect(args(increment)[4]).toBe('default');
    });
  });

  describe('propagacion de limites', () => {
    it('reenvia el ttl y el limite resueltos por el decorador', async () => {
      const increment = mockIncrement();
      const guard = makeGuard(increment);

      await guard.handleRequest(request({ limit: 5, ttl: 1_000 }));

      const [, ttl, limit] = args(increment);
      expect(ttl).toBe(1_000);
      expect(limit).toBe(5);
    });

    it('reenvia blockDuration en vez de un 0 fijo', async () => {
      const increment = mockIncrement();
      const guard = makeGuard(increment);

      await guard.handleRequest(request({ blockDuration: 15_000 }));

      expect(args(increment)[3]).toBe(15_000);
    });
  });

  describe('bloqueo', () => {
    it('deja pasar mientras no se exceda el limite', async () => {
      const increment = mockIncrement({ ...OK, totalHits: 10 });
      const guard = makeGuard(increment);

      await expect(guard.handleRequest(request({ limit: 10 }))).resolves.toBe(
        true,
      );
    });

    it('bloquea al superar el limite', async () => {
      const increment = mockIncrement({ ...OK, totalHits: 11 });
      const guard = makeGuard(increment);

      await expect(guard.handleRequest(request({ limit: 10 }))).rejects.toThrow(
        WsException,
      );
    });

    it('bloquea si el storage dice que la ventana de bloqueo sigue viva', async () => {
      // Un `totalHits` bajo no importa si el bloqueo anterior no ha expirado.
      const increment = mockIncrement({
        ...OK,
        totalHits: 1,
        isBlocked: true,
        timeToBlockExpire: 30_000,
      });
      const guard = makeGuard(increment);

      await expect(guard.handleRequest(request())).rejects.toThrow(WsException);
    });
  });
});
