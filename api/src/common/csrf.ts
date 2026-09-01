import { randomBytes } from 'crypto';
import { Response } from 'express';

export const CSRF_COOKIE_NAME =
  process.env.NODE_ENV === 'production' ? '__Host-csrf-token' : 'csrf-token';

const CSRF_TOKEN_LENGTH = 64;

export function createCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

export function isValidCsrfToken(
  token: string | undefined | null,
): token is string {
  return (
    typeof token === 'string' &&
    token.length === CSRF_TOKEN_LENGTH &&
    /^[a-f0-9]+$/.test(token)
  );
}

export function setCsrfCookie(res: Response, token: string) {
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  });
}