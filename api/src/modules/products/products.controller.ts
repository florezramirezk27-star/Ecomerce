import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { parsePagination } from '../../common/pipes/parse-pagination';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { createProductSchema, updateProductSchema } from '../../common/schemas';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import type { AuthUser } from '../../common/types/auth-request';

// El guard es opcional (`OptionalJwtAuthGuard`), así que `user` puede faltar.
type ProductsRequest = Request & { user?: AuthUser };

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  findAll(
    @Req() req: ProductsRequest,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('sort') sort?: 'priceAsc' | 'priceDesc',
    @Query('page') pageParam?: string,
    @Query('limit') limitParam?: string,
    @Query('onSale') onSale?: string,
  ) {
    const isAdmin = req.user?.role === 'ADMIN';
    const { page, limit } = parsePagination(pageParam, limitParam);
    const onSaleBool = onSale === 'true';

    return this.productsService.findAll(
      search,
      categoryId,
      sort,
      page,
      limit,
      onSaleBool,
      isAdmin,
    );
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  async findOne(@Req() req: ProductsRequest, @Param('id') id: string) {
    const isAdmin = req.user?.role === 'ADMIN';
    const product = await this.productsService.findOne(id, isAdmin);
    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }
    return product;
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  create(
    @Body(new ZodValidationPipe(createProductSchema)) dto: CreateProductDto,
  ) {
    return this.productsService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateProductSchema)) dto: UpdateProductDto,
  ) {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }
}
