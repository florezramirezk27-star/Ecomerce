import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';

import { DropiWebhookGuard } from './dropi-webhook.guard';
import { RedisService } from '../redis/redis.service';

const SECRET = 'secreto-de-prueba';

function makeContext(options: {
  body?: unknown;
  rawBody?: string;
  signature?: string;
  timestamp?: string;
  omitRawBody?: boolean;
}): ExecutionContext {
  const {
    body = {},
    rawBody = JSON.stringify(body),
    signature,
    timestamp,
    omitRawBody,
  } = options;

  const headers: Record<string, string> = {};
  if (signature !== undefined) headers['x-dropi-signature'] = signature;
  if (timestamp !== undefined) headers['x-dropi-timestamp'] = timestamp;

  const request: Record<string, unknown> = { headers, body };
  if (!omitRawBody) request.rawBody = Buffer.from(rawBody, 'utf8');

  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function sign(rawBody: string, timestamp: string, secret = SECRET) {
  return createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
}

/** Redis que responde siempre "guardado": ningun nonce repetido. */
const setIfAbsentGuardando = jest.fn();
const redisGuardando = {
  setIfAbsent: setIfAbsentGuardando,
} as unknown as RedisService;

/** Redis caido: `undefined` obliga al repliegue en memoria. */
const setIfAbsentCaido = jest.fn();
const redisCaido = {
  setIfAbsent: setIfAbsentCaido,
} as unknown as RedisService;

describe('DropiWebhookGuard', () => {
  const OLD_SECRET = process.env.DROPI_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.DROPI_WEBHOOK_SECRET = SECRET;
    jest.clearAllMocks();
    setIfAbsentGuardando.mockResolvedValue(true);
    setIfAbsentCaido.mockResolvedValue(undefined);
  });

  afterAll(() => {
    if (OLD_SECRET === undefined) delete process.env.DROPI_WEBHOOK_SECRET;
    else process.env.DROPI_WEBHOOK_SECRET = OLD_SECRET;
  });

  it('rechaza todo si el secreto no esta configurado', async () => {
    delete process.env.DROPI_WEBHOOK_SECRET;
    const guard = new DropiWebhookGuard(redisGuardando);

    await expect(guard.canActivate(makeContext({}))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rechaza peticiones sin firma', async () => {
    const guard = new DropiWebhookGuard(redisGuardando);

    await expect(
      guard.canActivate(makeContext({ timestamp: String(Date.now()) })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza si el cuerpo crudo no esta disponible', async () => {
    const guard = new DropiWebhookGuard(redisGuardando);
    const ts = String(Date.now());
    const body = { orderId: 'cabc123' };

    // Firmar el objeto ya parseado daria otra firma: se rechaza en vez de
    // adivinar.
    await expect(
      guard.canActivate(
        makeContext({
          body,
          omitRawBody: true,
          timestamp: ts,
          signature: sign(JSON.stringify(body), ts),
        }),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza una firma calculada con otro secreto', async () => {
    const guard = new DropiWebhookGuard(redisGuardando);
    const ts = String(Date.now());
    const body = { orderId: 'cabc123' };

    await expect(
      guard.canActivate(
        makeContext({
          body,
          timestamp: ts,
          signature: sign(JSON.stringify(body), ts, 'otro-secreto'),
        }),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza una firma de cuerpo modificado', async () => {
    const guard = new DropiWebhookGuard(redisGuardando);
    const ts = String(Date.now());
    const original = JSON.stringify({ orderId: 'cabc123', status: 'PENDING' });
    const altered = JSON.stringify({ orderId: 'cabc123', status: 'CANCELADO' });

    // Firma el cuerpo original, pero se envia otro distinto.
    await expect(
      guard.canActivate(
        makeContext({
          body: JSON.parse(altered),
          rawBody: altered,
          timestamp: ts,
          signature: sign(original, ts),
        }),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza firmas con marca de tiempo antigua', async () => {
    const guard = new DropiWebhookGuard(redisGuardando);
    const ts = String(Date.now() - 10 * 60 * 1000);
    const body = { orderId: 'cabc123' };
    const raw = JSON.stringify(body);

    await expect(
      guard.canActivate(
        makeContext({
          body,
          rawBody: raw,
          timestamp: ts,
          signature: sign(raw, ts),
        }),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('acepta una firma valida y la marca en Redis con NX', async () => {
    const guard = new DropiWebhookGuard(redisGuardando);
    const ts = String(Date.now());
    const body = { orderId: 'cabc123', status: 'PENDING' };
    const raw = JSON.stringify(body);

    await expect(
      guard.canActivate(
        makeContext({
          body,
          rawBody: raw,
          timestamp: ts,
          signature: sign(raw, ts),
        }),
      ),
    ).resolves.toBe(true);

    // La clave es el hash de la firma, y el TTL es el doble de la ventana de
    // tolerancia: una firma sigue siendo aceptable 5 minutos, asi que hay que
    // recordarla ese rato entero.
    expect(setIfAbsentGuardando).toHaveBeenCalledWith(
      expect.stringMatching(/^dropi:webhook:nonce:[0-9a-f]{64}$/),
      ts,
      600,
    );
  });

  it('rechaza cuando Redis dice que el nonce ya existia', async () => {
    const setIfAbsentUsado = jest.fn().mockResolvedValue(false);
    const guard = new DropiWebhookGuard({
      setIfAbsent: setIfAbsentUsado,
    } as unknown as RedisService);
    const ts = String(Date.now());
    const raw = JSON.stringify({ orderId: 'cabc123' });

    await expect(
      guard.canActivate(
        makeContext({
          body: JSON.parse(raw),
          rawBody: raw,
          timestamp: ts,
          signature: sign(raw, ts),
        }),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  describe('con Redis caido', () => {
    it('acepta la firma y la recuerda en memoria', async () => {
      const guard = new DropiWebhookGuard(redisCaido);
      const ts = String(Date.now());
      // Cuerpo propio de este test. El almacen local de nonces es global al
      // modulo, asi que dos tests con la misma marca de tiempo y el mismo
      // cuerpo generan la misma firma y el mismo nonce: el segundo fallaria por
      // el nonce que grabo el primero, y solo cuando caen en el mismo
      // milisegundo. Un fallo intermitente que hace creer que el anti-replay
      // esta roto cuando lo que esta mal es el test.
      const raw = JSON.stringify({ orderId: 'orden-propia-1' });
      const context = makeContext({
        body: JSON.parse(raw),
        rawBody: raw,
        timestamp: ts,
        signature: sign(raw, ts),
      });

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('rechaza la segunda vez, por el almacen local', async () => {
      const guard = new DropiWebhookGuard(redisCaido);
      const ts = String(Date.now());
      const raw = JSON.stringify({ orderId: 'cabc123' });
      const context = makeContext({
        body: JSON.parse(raw),
        rawBody: raw,
        timestamp: ts,
        signature: sign(raw, ts),
      });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
