import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(private readonly prisma: PrismaService) {
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
        (req: Request) => req?.cookies?.token || null,
      ]),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    if (!payload.sessionId) {
      throw new UnauthorizedException('Sesión inválida');
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

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      sessionId: payload.sessionId,
    };
  }
}
