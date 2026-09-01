import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    PrismaModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const jwtSecret = config.get('JWT_SECRET') || process.env.JWT_SECRET;

        if (!jwtSecret || jwtSecret === 'dev-secret-key') {
          throw new Error(
            'JWT_SECRET no está configurado correctamente. ' +
              'Configura JWT_SECRET en tu archivo .env con un valor seguro.',
          );
        }

        const expiresIn = config.get('JWT_ACCESS_EXPIRES_IN') || '1h';

        return {
          secret: jwtSecret,
          signOptions: {
            expiresIn,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, GoogleStrategy],
})
export class AuthModule {}
