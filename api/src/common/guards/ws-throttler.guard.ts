import { Injectable } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { WsException } from '@nestjs/websockets';
import type { ThrottlerRequest } from '@nestjs/throttler';
import type { Socket } from 'socket.io';

/**
 * IP real del cliente en una conexion WebSocket.
 *
 * `handshake.address` es la IP del socket que acepta la conexion, que detras de
 * un balanceador es el balanceador. Con 1000 usuarios detras del mismo proxy,
 * todos caerian en un unico contador y un usuario muy activo dejaria bloqueado
 * al resto. Es el mismo problema que resolvio `trust proxy` en HTTP.
 *
 * Con `trust proxy: 1` se confia en un unico salto, asi que la IP del cliente es
 * la ULTIMA entrada de `X-Forwarded-For` (la que anadio el proxy de confianza,
 * las anteriores las genero el cliente y no son fiables). Si la cabecera no
 * existe, se usa `handshake.address`.
 */
function clientIp(client: Socket): string {
  const forwarded = client.handshake?.headers?.['x-forwarded-for'];

  if (typeof forwarded === 'string' && forwarded.length > 0) {
    const hops = forwarded
      .split(',')
      .map((hop) => hop.trim())
      .filter((hop) => hop.length > 0);

    const last = hops[hops.length - 1];
    if (last) return last;
  }

  return client.handshake?.address || client.conn?.remoteAddress || 'unknown';
}

/**
 * Rate limiting para WebSocket.
 *
 * La clase base no se puede usar tal cual en WS: sus metodos internos llaman a
 * `context.switchToHttp()`, que lanza en un contexto de socket. Se hereda solo
 * para reutilizar la resolucion de `@Throttle` (limite, ttl y duracion de
 * bloqueo por decorador) y se sustituye `handleRequest`.
 *
 * Lo que este guard si resuelve por decorador es `limit` y `ttl`. Lo que
 * estaba mal y aqui se corrige:
 * - el nombre de throttler se pasaba vacio, asi que todos los decoradores
 *   compartian un mismo contador en Redis;
 * - `blockDuration` se pasaba como 0, dejando el bloqueo sin usar;
 * - la clave no incluía el throttler, igual que el punto anterior.
 */
@Injectable()
export class WsThrottlerGuard extends ThrottlerGuard {
  async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const { context, limit, ttl, throttler, blockDuration } = requestProps;
    const client = context.switchToWs().getClient<Socket>();

    // `onModuleInit` de la clase base siempre rellena `name` a 'default', pero
    // el tipo lo declara opcional, asi que se cubre el caso por si acaso.
    const name = throttler.name ?? 'default';

    // El nombre separa las ventanas: un decorador de 5/min no comparte
    // contador con uno de 100/min.
    const key = `ws_${name}_${clientIp(client)}`;

    const record = await this.storageService.increment(
      key,
      ttl,
      limit,
      blockDuration,
      name,
    );

    if (record.totalHits > limit || record.isBlocked) {
      throw new WsException(
        'Demasiadas solicitudes. Intenta de nuevo más tarde.',
      );
    }

    return true;
  }
}
