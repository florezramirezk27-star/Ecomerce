import {
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AveonlineService } from './aveonline.service';
import type { AveonlineCreateOrderRequest } from './aveonline.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('aveonline')
export class AveonlineController {
  constructor(private readonly aveonlineService: AveonlineService) {}

  @Get('status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  status() {
    return this.aveonlineService.getStatus();
  }

  @Post('login')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async login() {
    await this.aveonlineService.login();
    return this.aveonlineService.getStatus();
  }

  @Post('force-relogin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async forceRelogin() {
    return this.aveonlineService.forceRelogin();
  }

  @Get('providers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async providers() {
    try {
      return await this.aveonlineService.listProviders();
    } catch (error: unknown) {
      this.rethrow(error);
    }
  }

  @Post('orders/:orderId/send')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async sendOrder(@Param('orderId') orderId: string) {
    try {
      return await this.aveonlineService.sendOrder(orderId);
    } catch (error: unknown) {
      this.rethrow(error);
    }
  }

  @Post('orders')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async createOrder(@Body() body: AveonlineCreateOrderRequest) {
    try {
      return await this.aveonlineService.createOrder(body);
    } catch (error: unknown) {
      this.rethrow(error);
    }
  }

  @Get('tracking/:orderId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async getTracking(@Param('orderId') orderId: string) {
    try {
      const data = await this.aveonlineService.trackByOrderId(orderId);
      if (!data) {
        throw new HttpException(
          'No se encontró seguimiento Aveonline para esta orden',
          404,
        );
      }
      return data;
    } catch (error: unknown) {
      this.rethrow(error);
    }
  }

  @Post('webhook')
  async webhook(@Body() payload: any) {
    return this.aveonlineService.handleWebhook(payload);
  }

  @Post('webhook/register')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async registerWebhook(@Body('url') url: string) {
    try {
      if (!url) {
        throw new HttpException(
          'Falta la URL del webhook (body: { url })',
          400,
        );
      }
      return await this.aveonlineService.registerWebhook(url);
    } catch (error: unknown) {
      this.rethrow(error);
    }
  }

  private rethrow(error: unknown): never {
    if (error instanceof HttpException) throw error;
    const message =
      error instanceof Error ? error.message : 'Error con Aveonline';
    throw new HttpException(message, 500);
  }
}
