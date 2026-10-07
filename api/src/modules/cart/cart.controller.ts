import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CartService } from './cart.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { addToCartSchema, updateCartItemSchema } from '../../common/schemas';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../../common/types/auth-request';

@ApiTags('Cart')
@ApiBearerAuth()
@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Post('add')
  addToCart(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(addToCartSchema))
    dto: { productId: string; quantity: number },
  ) {
    return this.cartService.addToCart(req.user.id, dto.productId, dto.quantity);
  }

  @Get()
  getCart(@Req() req: AuthenticatedRequest) {
    return this.cartService.getCart(req.user.id);
  }

  @Delete(':id')
  removeItem(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.cartService.removeItem(req.user.id, id);
  }

  @Patch(':id')
  updateItem(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCartItemSchema))
    dto: { quantity: number },
  ) {
    return this.cartService.updateQuantity(req.user.id, id, dto.quantity);
  }
}
