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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AddToCartDto } from './dto/add-to-cart.dto';

@ApiTags('Cart')
@ApiBearerAuth()
@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(
    private readonly cartService: CartService,
  ) {}

  @Post('add')
  addToCart(
    @Req() req,
    @Body() dto: AddToCartDto,
  ) {
    return this.cartService.addToCart(
      req.user.id,
      dto.productId,
      dto.quantity,
    );
  }

  @Get()
  getCart(@Req() req) {
    return this.cartService.getCart(
      req.user.id,
    );
  }

  @Delete(':id')
  removeItem(
    @Req() req,
    @Param('id') id: string,
  ) {
    return this.cartService.removeItem(
      req.user.id,
      id,
    );
  }
}
