import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';

import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';

function parseExpiresIn(value: string): number {
  const match = value.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 86400000;
  const num = parseInt(match[1], 10);
  switch (match[2]) {
    case 's': return num * 1000;
    case 'm': return num * 60000;
    case 'h': return num * 3600000;
    case 'd': return num * 86400000;
    default: return 7 * 86400000;
  }
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly prisma: PrismaService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { name, email, password } = registerDto;

    const existingUser =
      await this.usersService.findByEmail(email);

    if (existingUser) {
      throw new BadRequestException(
        'Email already exists',
      );
    }

    const hashedPassword = await bcrypt.hash(
      password,
      10,
    );

    const user = await this.usersService.create({
      name,
      email,
      password: hashedPassword,
    });

    return {
      id: user.id,
      name: user.name,
      email: user.email,
    };
  }

  private async createSession(userId: string): Promise<{ id: string; token: string; expiresAt: Date }> {
    const expiresInMs = parseExpiresIn(process.env.JWT_EXPIRES_IN || '7d');
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + expiresInMs);

    const session = await this.prisma.session.create({
      data: { userId, token, expiresAt },
    });

    return session;
  }

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);

    if (!user || !user.password) {
      throw new UnauthorizedException(
        'Invalid credentials',
      );
    }

    const isPasswordValid = await bcrypt.compare(
      password,
      user.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException(
        'Invalid credentials',
      );
    }

    const session = await this.createSession(user.id);

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionId: session.id,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  async logout(userId: string, sessionId?: string) {
    if (sessionId) {
      await this.prisma.session.deleteMany({
        where: { id: sessionId, userId },
      });
    } else {
      await this.prisma.session.deleteMany({
        where: { userId },
      });
    }
    return { message: 'Sesión cerrada exitosamente' };
  }

  async logoutByToken(token: string) {
    try {
      const payload = this.jwtService.verify(token, { ignoreExpiration: true });
      await this.prisma.session.deleteMany({
        where: { userId: payload.sub },
      });
      return { message: 'Sesión cerrada exitosamente' };
    } catch {
      throw new UnauthorizedException('Token inválido');
    }
  }

  async googleLogin(googleProfile: {
    email: string;
    name: string;
    googleId: string;
  }) {
    let user = await this.prisma.user.findUnique({
      where: { googleId: googleProfile.googleId },
    });

    if (!user) {
      const existingUser =
        await this.usersService.findByEmail(googleProfile.email);
      if (existingUser) {
        user = await this.prisma.user.update({
          where: { id: existingUser.id },
          data: { googleId: googleProfile.googleId },
        });
      } else {
        const adminEmails = (process.env.ADMIN_GOOGLE_EMAIL || '')
          .split(',')
          .map(e => e.trim().toLowerCase());
        const isAdmin = adminEmails.includes(
          googleProfile.email.toLowerCase(),
        );

        user = await this.prisma.user.create({
          data: {
            name: googleProfile.name,
            email: googleProfile.email,
            googleId: googleProfile.googleId,
            role: isAdmin ? 'ADMIN' : 'CUSTOMER',
          },
        });
      }
    } else if (
      user.role !== 'ADMIN' &&
      (process.env.ADMIN_GOOGLE_EMAIL || '')
        .split(',')
        .map(e => e.trim().toLowerCase())
        .includes(googleProfile.email.toLowerCase())
    ) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { role: 'ADMIN' },
      });
    }

    const session = await this.createSession(user.id);

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionId: session.id,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  async forgotPassword(email: string) {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      return { message: 'Si el correo existe, recibirás un enlace de recuperación' };
    }

    const token = randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000);

    await this.usersService.update(user.id, {
      resetToken: token,
      resetTokenExpiry: expiry,
    });

    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}`;

    await this.mailService.sendPasswordResetEmail(
      user.email,
      user.name,
      resetLink,
    );

    return { message: 'Si el correo existe, recibirás un enlace de recuperación' };
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await this.usersService.findByResetToken(token);

    if (
      !user ||
      !user.resetTokenExpiry ||
      user.resetTokenExpiry < new Date()
    ) {
      throw new BadRequestException(
        'Token inválido o expirado',
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.usersService.update(user.id, {
      password: hashedPassword,
      resetToken: null,
      resetTokenExpiry: null,
    });

    return { message: 'Contraseña actualizada exitosamente' };
  }
}
