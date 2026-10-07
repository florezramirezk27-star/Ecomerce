import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { OrdersService } from './orders.service';
import { CheckoutDto } from './dto/checkout.dto';
import { parsePagination } from '../../common/pipes/parse-pagination';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { checkoutSchema, updateOrderStatusSchema } from '../../common/schemas';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../../common/types/auth-request';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    const { page: pageNumber, limit: limitNumber } = parsePagination(
      page,
      limit,
    );
    return this.ordersService.findAll(pageNumber, limitNumber);
  }

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  // Cada checkout escribe pedido, descuenta stock y llama a la API de Dropi.
  // El limite global (100/min) deja margen de sobra para automatizar pedidos y
  // agotar el stock de un producto. 10/min sigue siendo comodamente mas que lo
  // que necesita un comprador legitimo.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async checkout(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(checkoutSchema)) dto: CheckoutDto,
  ) {
    return this.ordersService.checkout(req.user.id, dto);
  }

  @Get('my-orders')
  @UseGuards(JwtAuthGuard)
  findMyOrders(
    @Req() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const { page: pageNumber, limit: limitNumber } = parsePagination(
      page,
      limit,
    );
    return this.ordersService.findMyOrders(
      req.user.id,
      pageNumber,
      limitNumber,
    );
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  updateStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateOrderStatusSchema))
    dto: { status: string },
  ) {
    return this.ordersService.updateStatus(id, dto.status);
  }

  @Post(':id/reprocess')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  reprocess(@Param('id') id: string, @Query('force') force?: string) {
    return this.ordersService.reprocessOrder(id, force === 'true');
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.ordersService.findOne(id, req.user.id, req.user.role);
  }
}
