import type { Request } from 'express';

/**
 * Lo que `JwtStrategy.validate()` deja en `req.user` después de comprobar
 * JWT + sesión en la base de datos (o en la caché de sesiones).
 */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  sessionId: string;
}

/**
 * Petición con el JWT ya validado por Passport (`JwtAuthGuard`).
 *
 * Existe para que los controladores no declaren `@Req() req` sin tipo: eso
 * deja `req.user` como `any` implícito y se pierde toda la verificación de
 * campos (`req.user.id`, `req.user.role`, ...).
 */
export type AuthenticatedRequest = Request & { user: AuthUser };
