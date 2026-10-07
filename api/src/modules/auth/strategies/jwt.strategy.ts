import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { PrismaService } from '../../../prisma/prisma.service';
import { SessionCacheService } from '../session-cache.service';

/**
 * Payload del JWT firmado en `AuthService`. `sessionId` es opcional aquí
 * porque el `validate` lo comprueba explícitamente y debe seguir existiendo
 * ese chequeo en runtime (tokens viejos sin `sessionId` no valen).
 */
interface JwtPayload {
  sub: string;
  sessionId?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionCache: SessionCacheService,
  ) {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret || jwtSecret === 'dev-secret-key') {
      Logger.error(
        'JWT_SECRET no está configurado o tiene el valor por defecto "dev-secret-key". ' +
          'Configura JWT_SECRET en tu archivo .env con un valor seguro.',
        'JwtStrategy',
      );
      throw new Error(
        'JWT_SECRET no está configurado correctamente. Revisa las variables de entorno.',
      );
    }

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: Request) => (req?.cookies?.token as string) || null,
      ]),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
      // Fijar el algoritmo evita depender del default de la libreria y cierra el
      // margen de confusion de algoritmos.
      algorithms: ['HS256'],
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload.sessionId) {
      throw new UnauthorizedException('Sesión inválida');
    }

    // Camino rapido: la sesion ya fue validada contra la base de datos en un
    // request reciente y sigue viva segun su TTL. Evita 2 queries por request.
    const cached = await this.sessionCache.get(payload.sessionId);
    if (cached && cached.userId === payload.sub) {
      return {
        id: cached.userId,
        email: cached.email,
        name: cached.name,
        role: cached.role,
        sessionId: payload.sessionId,
      };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sessionId },
    });

    if (
      !session ||
      session.userId !== payload.sub ||
      session.expiresAt < new Date()
    ) {
      throw new UnauthorizedException('Sesión expirada o inválida');
    }

    await this.sessionCache.set(payload.sessionId, {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      expiresAt: session.expiresAt.getTime(),
    });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      sessionId: payload.sessionId,
    };
  }
}
