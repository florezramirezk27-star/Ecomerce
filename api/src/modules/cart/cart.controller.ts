import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CartService } from './cart.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { addToCartSchema } from '../../common/schemas';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Cart')
@ApiBearerAuth()
@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Post('add')
  addToCart(
    @Req() req,
    @Body(new ZodValidationPipe(addToCartSchema))
    dto: { productId: string; quantity: number },
  ) {
    return this.cartService.addToCart(req.user.id, dto.productId, dto.quantity);
  }

  @Get()
  getCart(@Req() req) {
    return this.cartService.getCart(req.user.id);
  }

  @Delete(':id')
  removeItem(@Req() req, @Param('id') id: string) {
    return this.cartService.removeItem(req.user.id, id);
  }
}
