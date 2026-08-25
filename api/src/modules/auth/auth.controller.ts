import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Post,
  Req,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';

import { z } from 'zod';

import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { WsTicketStore } from '../../common/ws-ticket.store';
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../../common/schemas';

function parseExpiresInToMs(value: string): number {
  const match = value.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 86400000;
  const num = parseInt(match[1], 10);
  switch (match[2]) {
    case 's':
      return num * 1000;
    case 'm':
      return num * 60000;
    case 'h':
      return num * 3600000;
    case 'd':
      return num * 86400000;
    default:
      return 7 * 86400000;
  }
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get()
  test() {
    return {
      message: 'Auth funcionando',
    };
  }

  private setTokenCookie(res: Response, token: string) {
    const isProduction = process.env.NODE_ENV === 'production';
    const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
    const maxAge = parseExpiresInToMs(expiresIn);
    res.cookie('token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge,
    });
  }

  private clearTokenCookie(res: Response) {
    const isProduction = process.env.NODE_ENV === 'production';
    res.clearCookie('token', {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
    });
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('register')
  async register(
    @Body(new ZodValidationPipe(registerSchema))
    registerDto: {
      name: string;
      email: string;
      password: string;
    },
  ) {
    return this.authService.register(registerDto);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('login')
  async login(
    @Body(new ZodValidationPipe(loginSchema))
    loginDto: {
      email: string;
      password: string;
    },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(
      loginDto.email,
      loginDto.password,
    );
    this.setTokenCookie(res, result.access_token);
    return { user: result.user };
  }

  @Post('forgot-password')
  forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) dto: { email: string },
  ) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema))
    dto: {
      token: string;
      password: string;
    },
  ) {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {}

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(@Req() req, @Res() res: Response) {
    try {
      const result = await this.authService.googleLogin(req.user);

      const code = this.authService.generateExchangeCode(
        result.access_token,
        result.user,
      );

      const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/google/callback?code=${encodeURIComponent(code)}`;
      return res.redirect(redirectUrl);
    } catch {
      return res.redirect(
        `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=google_auth_failed`,
      );
    }
  }

  @Post('exchange')
  @HttpCode(200)
  async exchangeCode(
    @Body(new ZodValidationPipe(z.object({ code: z.string().min(1) })))
    body: { code: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = this.authService.exchangeCode(body.code);
    if (!result) {
      throw new HttpException('Código inválido o expirado', 400);
    }
    this.setTokenCookie(res, result.access_token);
    return { user: result.user };
  }

  @ApiBearerAuth()
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  profile(@Request() req) {
    return req.user;
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  logout(@Request() req, @Res({ passthrough: true }) res: Response) {
    this.clearTokenCookie(res);
    return this.authService.logout(req.user.id, req.user.sessionId);
  }

  @ApiBearerAuth()
  @Post('logout-force')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async logoutForce(@Request() req, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.logout(req.user.id);
    this.clearTokenCookie(res);
    return result;
  }

  @ApiBearerAuth()
  @Get('ws-ticket')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  wsTicket(@Request() req) {
    return { ticket: WsTicketStore.create(req.user.id, req.user.role) };
  }
}
