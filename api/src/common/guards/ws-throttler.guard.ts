import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { WsException } from '@nestjs/websockets';
import type { ThrottlerRequest } from '@nestjs/throttler';

@Injectable()
export class WsThrottlerGuard extends ThrottlerGuard {
  async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const { context, limit, ttl } = requestProps;
    const client = context.switchToWs().getClient();
    const ip =
      client.handshake?.address || client.conn?.remoteAddress || 'unknown';

    const key = `ws_${ip}`;
    const record = await this.storageService.increment(key, ttl, limit, 0, '');

    if (record.totalHits > limit) {
      throw new WsException(
        'Demasiadas solicitudes. Intenta de nuevo más tarde.',
      );
    }

    return true;
  }
}
