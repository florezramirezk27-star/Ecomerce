import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async findAll(
    search?: string,
    categoryId?: string,
    sort?: 'priceAsc' | 'priceDesc',
    page?: number,
    limit?: number,
    onSale?: boolean,
  ) {
    const where: any = {};

    if (search) {
      where.OR = [
        {
          name: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          description: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
    }

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (onSale) {
      where.oldPrice = { not: null };
    }

    const orderBy: Prisma.ProductOrderByWithRelationInput | undefined = sort
      ? {
          price: sort === 'priceAsc' ? 'asc' : 'desc',
        }
      : undefined;

    const shouldPaginate = Boolean(page || limit);

    if (!shouldPaginate) {
      return this.prisma.product.findMany({
        where,
        orderBy,
        include: {
          category: true,
        },
      });
    }

    const take = limit && limit > 0 ? limit : 20;
    const currentPage = page && page > 0 ? page : 1;
    const skip = (currentPage - 1) * take;

    const [total, items] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy,
        skip,
        take,
        include: {
          category: true,
        },
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / take));

    return {
      items,
      total,
      page: currentPage,
      limit: take,
      totalPages,
    };
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
      },
    });

    if (!product) return null;

    const similar = await this.prisma.product.findMany({
      where: {
        categoryId: product.categoryId,
        id: { not: id },
        active: true,
      },
      take: 8,
      orderBy: { createdAt: 'desc' },
      include: { category: true },
    });

    return { ...product, similarProducts: similar };
  }

  create(dto: CreateProductDto) {
    return this.prisma.product.create({
      data: dto,
      include: {
        category: true,
      },
    });
  }

  update(id: string, dto: UpdateProductDto) {
    return this.prisma.product.update({
      where: { id },
      data: dto as any,
      include: {
        category: true,
      },
    });
  }

  remove(id: string) {
    return this.prisma.product.delete({
      where: { id },
    });
  }
}
