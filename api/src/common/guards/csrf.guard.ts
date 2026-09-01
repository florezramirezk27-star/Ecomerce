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
      if (!req.cookies?.[CSRF_COOKIE_NAME]) {
        setCsrfCookie(res, createCsrfToken());
      }
      return true;
    }

    const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
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