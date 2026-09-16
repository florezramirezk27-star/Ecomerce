import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { Request } from 'express';

function safeCompare(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length || ab.length === 0) return false;
  return timingSafeEqual(ab, bb);
}

@Injectable()
export class WooCommerceGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Falta autenticación de WooCommerce');
    }

    if (authHeader.startsWith('Bearer ')) {
      const expectedToken = process.env.DROPI_INTEGRATION_TOKEN;
      if (!expectedToken) {
        throw new UnauthorizedException('Token de integración no configurado');
      }
      const bearer = authHeader.split(' ')[1];
      if (safeCompare(bearer, expectedToken)) {
        return true;
      }
      throw new UnauthorizedException('Token de integración incorrecto');
    }

    if (!authHeader.startsWith('Basic ')) {
      throw new UnauthorizedException(
        'Falta autenticación básica de WooCommerce',
      );
    }

    const expectedCk = process.env.DROP_WOO_CK;
    const expectedCs = process.env.DROP_WOO_CS;

    if (!expectedCk || !expectedCs) {
      throw new UnauthorizedException(
        'Credenciales de WooCommerce no configuradas',
      );
    }

    try {
      const base64Credentials = authHeader.split(' ')[1];
      const credentials = Buffer.from(base64Credentials, 'base64').toString(
        'ascii',
      );
      const [ck, cs] = credentials.split(':');

      if (
        ck &&
        cs &&
        safeCompare(ck, expectedCk) &&
        safeCompare(cs, expectedCs)
      ) {
        return true;
      }
    } catch {
      throw new UnauthorizedException('Error al procesar las credenciales');
    }

    throw new UnauthorizedException('Credenciales virtuales incorrectas');
  }
}
