import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { Request } from 'express';

import { RedisService } from '../redis/redis.service';

function safeCompare(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length || ab.length === 0) return false;
  return timingSafeEqual(ab, bb);
}

/** Ventana de validez de la marca de tiempo, en ms. */
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

/** Prefijo de las claves de anti-replay en Redis. */
const NONCE_PREFIX = 'dropi:webhook:nonce';

/**
 * Nonces ya vistos, para cuando Redis no esta disponible.
 *
 * Solo sirve de red de seguridad dentro de una misma instancia. Con varias
 * instancias, la unica garantia fuerte viene de Redis, y por eso es el camino
 * principal: si esto es lo unico que corre, el limite de una instancia es 10k.
 */
const seenNonces = new Map<string, number>();
const MAX_TRACKED_NONCES = 10_000;

function rememberNonceLocally(nonce: string, expiresAt: number): boolean {
  const now = Date.now();

  for (const [key, expiry] of seenNonces) {
    if (expiry <= now) seenNonces.delete(key);
  }

  if (seenNonces.size >= MAX_TRACKED_NONCES) {
    // Descarta lo mas antiguo; el Map esta ordenado por insercion.
    const oldest = seenNonces.keys().next().value as string | undefined;
    if (oldest !== undefined) seenNonces.delete(oldest);
  }

  if (seenNonces.has(nonce)) return false;
  seenNonces.set(nonce, expiresAt);
  return true;
}

/**
 * Autentica el webhook de Dropi por firma HMAC-SHA256.
 *
 * Este endpoint antes no tenia ninguna proteccion: cualquiera podia hacer POST
 * y cambiar el estado de cualquier pedido, incluido cancelarlo y disparar el
 * correo al cliente. El CSRF no ayuda aqui, porque protege contra navegadores y
 * no contra clientes HTTP directos.
 *
 * Dropi firma el cuerpo con el secreto compartido de la integracion. Se exige:
 * - cabecera `x-dropi-signature` con el HMAC del cuerpo crudo;
 * - cabecera `x-dropi-timestamp` dentro de la ventana de 5 minutos;
 * - que la firma no se haya usado antes.
 *
 * Se compara el cuerpo crudo, no el objeto ya parseado, porque el JSON se
 * reserializa de forma distinta y la firma no coincidiria.
 */
@Injectable()
export class DropiWebhookGuard implements CanActivate {
  private readonly logger = new Logger(DropiWebhookGuard.name);

  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const secret = process.env.DROPI_WEBHOOK_SECRET;
    if (!secret) {
      // Falla cerrado: sin secreto configurado no se acepta ningun webhook.
      this.logger.error(
        'Webhook de Dropi rechazado: DROPI_WEBHOOK_SECRET no esta configurado.',
      );
      throw new UnauthorizedException('Webhook no configurado');
    }

    const signature = request.headers['x-dropi-signature'];
    const timestamp = request.headers['x-dropi-timestamp'];

    if (typeof signature !== 'string' || typeof timestamp !== 'string') {
      throw new UnauthorizedException('Firma ausente');
    }

    const sentAt = Number(timestamp);
    if (!Number.isFinite(sentAt)) {
      throw new UnauthorizedException('Marca de tiempo invalida');
    }

    if (Math.abs(Date.now() - sentAt) > TIMESTAMP_TOLERANCE_MS) {
      throw new UnauthorizedException('Firma expirada');
    }

    const rawBody = this.rawBody(request);

    const expected = createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');

    const provided = signature.startsWith('sha256=')
      ? signature.slice('sha256='.length)
      : signature;

    if (!safeCompare(expected, provided)) {
      this.logger.warn('Webhook de Dropi rechazado: firma no valida.');
      throw new UnauthorizedException('Firma no valida');
    }

    if (!(await this.consumeNonce(secret, provided, sentAt))) {
      this.logger.warn('Webhook de Dropi rechazado: firma reutilizada.');
      throw new UnauthorizedException('Firma ya utilizada');
    }

    return true;
  }

  /**
   * Marca la firma como usada y devuelve false si ya lo estaba.
   *
   * El TTL es el doble de la ventana de tolerancia: una firma sigue siendo
   * aceptable por ventana de 5 minutos, asi que hay que recordarla ese rato
   * entero. Con el TTL justo a la ventana, una firma reenviada en el ultimo
   * instante passaria por olvidada.
   *
   * `SET NX` hace el check y el set en un solo paso atomico. Con un
   * `exists` seguido de un `set`, dos peticiones concurrentes con la misma
   * firma podrian pasar las dos.
   */
  private async consumeNonce(
    secret: string,
    provided: string,
    sentAt: number,
  ): Promise<boolean> {
    // El nonce se deriva de la firma, asi que dos cuerpos distintos producen
    // nonces distintos y dos copias de la misma peticion, el mismo.
    const nonce = createHmac('sha256', secret).update(provided).digest('hex');
    const ttlSeconds = Math.ceil((TIMESTAMP_TOLERANCE_MS * 2) / 1000);

    const stored = await this.redis.setIfAbsent(
      `${NONCE_PREFIX}:${nonce}`,
      String(sentAt),
      ttlSeconds,
    );

    // Redis no esta disponible: se cae al almacen local de la instancia.
    if (stored === undefined) {
      return rememberNonceLocally(nonce, sentAt + TIMESTAMP_TOLERANCE_MS);
    }

    return stored;
  }

  /**
   * Cuerpo crudo tal como llego por el cable.
   *
   * `express.json()` lo deja disponible en `req.rawBody` porque `main.ts` pasa
   * un `verify` que lo captura. Si no estuviera disponible, se rechaza: firmar
   * el objeto ya parseado daria una firma distinta de la que envio Dropi, asi que
   * aceptarlo seria aceptar basura.
   */
  private rawBody(request: Request): string {
    const withRaw = request as Request & { rawBody?: Buffer };
    if (withRaw.rawBody) return withRaw.rawBody.toString('utf8');

    throw new UnauthorizedException('Cuerpo no verificable');
  }
}
