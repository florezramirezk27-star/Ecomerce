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
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import type { Request as ExpressRequest, Response } from 'express';

import { z } from 'zod';

import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { WsTicketStore } from '../../common/ws-ticket.store';
import { accessTokenLifetimeMs } from '../../common/token-expiry';
import { createCsrfToken, setCsrfCookie } from '../../common/csrf';
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../../common/schemas';

function accessTokenMs(): number {
  return accessTokenLifetimeMs();
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
  ) {}

  @Get()
  test() {
    return {
      message: 'Auth funcionando',
    };
  }

  private setTokenCookie(res: Response, token: string) {
    const isProduction = process.env.NODE_ENV === 'production';
    const maxAge = accessTokenMs();
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
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(registerDto);
    setCsrfCookie(res, createCsrfToken());
    return result;
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
    setCsrfCookie(res, createCsrfToken());
    return {
      user: result.user,
      access_token: result.access_token,
    };
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('forgot-password')
  forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) dto: { email: string },
  ) {
    return this.authService.forgotPassword(dto.email);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
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

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    let token: string | undefined;

    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.slice(7);
    } else {
      token = req.cookies?.['token'] as string | undefined;
    }

    if (!token) {
      throw new UnauthorizedException('Token no encontrado');
    }

    let payload: { sub: string; sessionId?: string };
    try {
      payload = this.jwtService.verify(token, { ignoreExpiration: true });
    } catch {
      throw new UnauthorizedException('Token inválido');
    }

    if (!payload.sub || !payload.sessionId) {
      throw new UnauthorizedException('Sesión inválida');
    }

    const result = await this.authService.refreshSession(
      payload.sub,
      payload.sessionId,
    );

    this.setTokenCookie(res, result.access_token);

    return {
      user: result.user,
      access_token: result.access_token,
    };
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
    setCsrfCookie(res, createCsrfToken());
    return {
      user: result.user,
      access_token: result.access_token,
    };
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
