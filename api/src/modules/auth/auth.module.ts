import { Module } from '@nestjs/common';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { GoogleTokenService } from './google-token.service';
import { UsersModule } from '../users/users.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { GoogleStrategy } from './strategies/google.strategy';
import { FacebookStrategy } from './strategies/facebook.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { SessionCacheService } from './session-cache.service';
import { RedisModule } from '../../common/redis/redis.module';

const facebookStrategyProvider = {
  provide: FacebookStrategy,
  useFactory: () => {
    if (
      !process.env.FACEBOOK_CLIENT_ID ||
      !process.env.FACEBOOK_CLIENT_SECRET
    ) {
      return undefined;
    }
    return new FacebookStrategy();
  },
};

@Module({
  imports: [
    UsersModule,
    PassportModule,
    PrismaModule,
    RedisModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const jwtSecret =
          config.get<string>('JWT_SECRET') || process.env.JWT_SECRET;

        if (!jwtSecret || jwtSecret === 'dev-secret-key') {
          throw new Error(
            'JWT_SECRET no está configurado correctamente. ' +
              'Configura JWT_SECRET en tu archivo .env con un valor seguro.',
          );
        }

        // `expiresIn` llega como string libre desde la env y `JwtSignOptions`
        // exige `number | StringValue` (de `ms`), asi que se normaliza con un
        // cast: el valor real ya es algo como '30m' o '1h'.
        const expiresIn = (config.get<string>('JWT_ACCESS_EXPIRES_IN') ||
          '1h') as JwtSignOptions['expiresIn'];

        return {
          secret: jwtSecret,
          signOptions: {
            expiresIn,
            algorithm: 'HS256',
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionCacheService,
    JwtStrategy,
    GoogleStrategy,
    GoogleTokenService,
    facebookStrategyProvider,
  ],
})
export class AuthModule {}
