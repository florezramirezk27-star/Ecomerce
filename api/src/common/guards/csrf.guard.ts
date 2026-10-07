import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { Response, Request } from 'express';

import {
  CSRF_COOKIE_NAME,
  createCsrfToken,
  isValidCsrfToken,
  setCsrfCookie,
} from '../csrf';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function safeCompare(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length || ab.length === 0) return false;
  return timingSafeEqual(ab, bb);
}

const CSRF_EXCLUDED_PATHS = new Set([
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/google',
  '/auth/google/callback',
  // Login nativo de la app movil. Es publico por definicion: quien lo llama aun
  // no tiene cookie de sesion ni token CSRF, porque lo que trae es un ID token
  // de Google. La seguridad no la da el CSRF (que protege contra que un sitio
  // malicioso reutilice la sesion de un navegador) sino `GoogleTokenService`,
  // que verifica la firma del token. Sin esta excepcion el POST devolveria 403
  // siempre y el login nativo no seria posible.
  '/auth/google/native',
  '/auth/exchange',
  '/auth/refresh',
  '/auth/logout',
  '/chat/message',
  '/chat/history',
  // Excepcion exacta, no por prefijo: el webhook de Dropi lo firma un servidor
  // con HMAC, no un navegador con cookie de sesion, asi que el doble submit no
  // aplica. Excluir `/dropi/` entero habria dejado sin CSRF al resto de
  // endpoints de Dropi, que si van autenticados por cookie.
  '/dropi/webhook',
]);

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const path = req.path;

    if (
      CSRF_EXCLUDED_PATHS.has(path) ||
      path.startsWith('/chat/') ||
      path.startsWith('/presence/') ||
      path.startsWith('/wp-json/')
    ) {
      return true;
    }

    if (SAFE_METHODS.has(req.method)) {
      if (!req.cookies?.[CSRF_COOKIE_NAME]) {
        setCsrfCookie(res, createCsrfToken());
      }
      return true;
    }

    const cookieToken = req.cookies?.[CSRF_COOKIE_NAME] as string | undefined;
    const headerToken = req.headers['x-csrf-token'] as string | undefined;

    if (
      !isValidCsrfToken(cookieToken) ||
      !isValidCsrfToken(headerToken) ||
      !safeCompare(cookieToken, headerToken)
    ) {
      throw new ForbiddenException('CSRF token inválido');
    }

    return true;
  }
}
