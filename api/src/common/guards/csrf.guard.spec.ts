import { ExecutionContext, ForbiddenException } from '@nestjs/common';

import { CsrfGuard } from './csrf.guard';

/**
 * Respuesta falsa. En el camino de metodo seguro el guard intenta fijar la
 * cookie CSRF, asi que hace falta un `cookie()` que no haga nada.
 */
const res = { cookie: () => res } as never;

function makeContext(method: string, path: string, headers = {}) {
  const req = { method, path, headers, cookies: {} };
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
}

describe('CsrfGuard', () => {
  let guard: CsrfGuard;

  beforeEach(() => {
    guard = new CsrfGuard();
  });

  it('deja pasar al webhook de Dropi: lo autentica el HMAC, no una cookie', () => {
    // Sin cookie ni cabecera de CSRF. Si el webhook no estuviera excluido, el
    // guard lo rechazaria con 403 y ningun evento de Dropi llegaria nunca.
    expect(guard.canActivate(makeContext('POST', '/dropi/webhook'))).toBe(true);
  });

  it('sigue exigiendo CSRF en el resto de endpoints de Dropi', () => {
    // La exclusion es exacta, no por prefijo:sync y catalog van por cookie.
    expect(() => guard.canActivate(makeContext('POST', '/dropi/sync'))).toThrow(
      ForbiddenException,
    );
    expect(() =>
      guard.canActivate(makeContext('POST', '/dropi/catalog')),
    ).toThrow(ForbiddenException);
  });

  it('sigue exigiendo CSRF en un checkout autenticado', () => {
    expect(() =>
      guard.canActivate(makeContext('POST', '/orders/checkout')),
    ).toThrow(ForbiddenException);
  });

  it('acepta el metodo seguro y deja que el guard fije la cookie', () => {
    expect(guard.canActivate(makeContext('GET', '/orders/checkout'))).toBe(
      true,
    );
  });

  it('rechaza cuando cookie y cabecera no coinciden', () => {
    const req = {
      method: 'POST',
      path: '/orders/checkout',
      headers: { 'x-csrf-token': 'a'.repeat(43) },
      cookies: { csrf_token: 'b'.repeat(43) },
    };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
