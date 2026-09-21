import {
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DropiQuoteParams } from './dropi.types';
import { DropiService } from './dropi.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('dropi')
export class DropiController {
  constructor(private readonly dropiService: DropiService) {}

  @Get('status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async status() {
    return this.dropiService.getStatus();
  }

  @Get('catalog')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async catalog(
    @Query('search') search?: string,
    @Query('pageSize') pageSize?: string,
    @Query('userVerified') userVerified?: string,
    @Query('favorite') favorite?: string,
    @Query('privated') privated?: string,
  ) {
    const body: any = {
      pageSize: pageSize ? Number(pageSize) : 50,
      startData: 0,
      privated_product: privated === 'true',
      userVerified: userVerified === 'true',
      favorite: favorite === 'true',
      country: 'COLOMBIA',
      get_stock: false,
      no_count: true,
      search_type: 'simple',
      with_collection: true,
    };

    if (search) {
      const searchId = Number(search);
      if (!isNaN(searchId) && search.trim() === String(searchId)) {
        body.search_type = 'id';
        body.keywords = search;
      } else {
        body.name = search;
      }
    }

    return this.dropiService.getDropiProducts(body);
  }

  @Post('import')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async import(@Body('dropiProductId') dropiProductId: number) {
    try {
      return await this.dropiService.importProduct(dropiProductId);
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      const message =
        error instanceof Error ? error.message : 'Error al importar';
      throw new HttpException(message, 500);
    }
  }

  @Get('tracking/:orderId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async getTracking(
    @Param('orderId') orderId: string,
    @Query('updateOrder') updateOrder?: string,
  ) {
    try {
      if (updateOrder === 'true') {
        return await this.dropiService.syncOrderStatus(orderId);
      }
      const data = await this.dropiService.trackByOrderId(orderId);
      if (!data) {
        throw new HttpException(
          'No se encontró guía de rastreo para esta orden',
          404,
        );
      }
      return data;
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      const message =
        error instanceof Error ? error.message : 'Error al rastrear';
      throw new HttpException(message, 500);
    }
  }

  @Post('sync-orders')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async syncOrders() {
    return this.dropiService.syncAllPendingOrders();
  }

  @Post('sync-stock')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async syncStock(@Body('dropiProductIds') ids?: number[]) {
    return this.dropiService.syncStock(Array.isArray(ids) ? ids : undefined);
  }

  @Post('orders')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async createOrder(@Body() payload: Record<string, unknown>) {
    return this.dropiService.createFinalOrder(payload);
  }

  @Post('orders/quote')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async quoteShipping(@Body() params: Record<string, unknown>) {
    return this.dropiService.quoteShipping(
      params as unknown as DropiQuoteParams,
    );
  }

  @Post('webhook')
  async webhook(@Body() payload: any) {
    return this.dropiService.handleWebhook(payload);
  }

  @Post('relogin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async relogin() {
    await this.dropiService.login();
    return this.dropiService.getStatus();
  }

  @Post('force-relogin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async forceRelogin() {
    return this.dropiService.forceRelogin();
  }
}
