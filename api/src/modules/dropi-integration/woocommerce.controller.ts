import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Param,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { WooCommerceGuard } from './woocommerce.guard';
import { WooCommerceService } from './woocommerce.service';
import type { DropiWebhookBody } from './woocommerce.service';

const MAX_ID = 2147483647;

@Controller('wp-json/wc/v3')
@UseGuards(WooCommerceGuard)
export class WooCommerceController {
  private readonly logger = new Logger(WooCommerceController.name);

  constructor(private readonly wooCommerceService: WooCommerceService) {}

  @Get('orders')
  async listOrders(
    @Res({ passthrough: true }) res: Response,
    @Query() query: Record<string, string>,
  ) {
    const result = await this.wooCommerceService.listOrders({
      page: query.page,
      perPage: query.per_page,
      status: query.status,
      search: query.search,
    });

    res.setHeader('X-WP-Total', String(result.total));
    res.setHeader('X-WP-TotalPages', String(result.totalPages));

    return result.items;
  }

  @Get('orders/:id')
  async getOrder(@Param('id') id: string) {
    const numericId = this.parseNumericId(id);
    return this.wooCommerceService.getOrderByNumericId(numericId);
  }

  @Put('orders/:id')
  @HttpCode(200)
  async receiveUpdate(@Param('id') id: string, @Body() data: DropiWebhookBody) {
    const numericId = this.parseNumericId(id);
    return this.wooCommerceService.applyDropiUpdate(numericId, data);
  }

  @Post('orders')
  async createOrder(@Body() data: DropiWebhookBody) {
    this.logger.warn(
      '[Dropi] POST /orders rechazado (solo lectura/actualización)',
    );
    const candidateId = data.id ?? data.number;
    const candidate = this.parseNumericIdSafe(String(candidateId ?? ''));
    if (candidate) {
      return this.wooCommerceService.getOrderByNumericId(candidate);
    }
    throw new BadRequestException(
      'Las órdenes se crean localmente; este endpoint solo soporta lectura y actualización de órdenes.',
    );
  }

  private parseNumericId(id: string): number {
    const value = this.parseNumericIdSafe(id);
    if (!value) {
      throw new BadRequestException(
        'El identificador del pedido debe ser un número entero positivo',
      );
    }
    return value;
  }

  private parseNumericIdSafe(id: string): number | null {
    if (!id) return null;
    if (!/^\d+$/.test(id)) return null;
    const num = parseInt(id, 10);
    if (Number.isNaN(num) || num < 1 || num > MAX_ID) return null;
    return num;
  }
}
