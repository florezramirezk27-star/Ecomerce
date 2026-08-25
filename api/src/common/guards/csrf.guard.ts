import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { randomBytes, timingSafeEqual } from 'crypto';
import { Response, Request } from 'express';

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
  '/auth/exchange',
  '/chat/message',
  '/chat/history',
]);

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const path = req.path;

    if (CSRF_EXCLUDED_PATHS.has(path) || path.startsWith('/chat/')) {
      return true;
    }

    if (SAFE_METHODS.has(req.method)) {
      let csrfToken = req.cookies?.['csrf-token'];
      if (!csrfToken) {
        csrfToken = randomBytes(32).toString('hex');
        res.cookie('csrf-token', csrfToken, {
          httpOnly: false,
          sameSite: 'lax',
          path: '/',
          secure: process.env.NODE_ENV === 'production',
        });
      }
      return true;
    }

    const cookieToken = req.cookies?.['csrf-token'];
    const headerToken = req.headers['x-csrf-token'] as string | undefined;

    if (
      !cookieToken ||
      !headerToken ||
      !safeCompare(cookieToken, headerToken)
    ) {
      throw new ForbiddenException('CSRF token inválido');
    }

    return true;
  }
}
