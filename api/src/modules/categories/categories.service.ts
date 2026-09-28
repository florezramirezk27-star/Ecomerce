import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogCacheService } from '../../common/cache/catalog-cache.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

/**
 * Columnas del listado de categorias. Sin `select` explicito Prisma arrastra
 * columnas de peso innecesario en la respuesta.
 */
const listSelect = {
  id: true,
  name: true,
  slug: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Tope de productos embebidos en el detalle de una categoria. */
const MAX_CATEGORY_PRODUCTS = 100;

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CatalogCacheService,
  ) {}

  findAll() {
    return this.cache.remember('categories', ['all'], () =>
      this.prisma.category.findMany({
        select: {
          ...listSelect,
          _count: {
            select: {
              products: { where: { active: true } },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
    );
  }

  findOne(id: string) {
    return this.cache.remember('category', [id], () =>
      this.prisma.category.findUnique({
        where: { id },
        select: {
          ...listSelect,
          products: {
            where: { active: true },
            // Sin `take` esta consulta arrastra la categoria entera: una sola
            // categoria con 50k productos revienta la memoria del proceso. El
            // total real de la categoria viene en `_count`.
            take: MAX_CATEGORY_PRODUCTS,
            select: {
              id: true,
              name: true,
              slug: true,
              price: true,
              oldPrice: true,
              image: true,
              stock: true,
            },
          },
          _count: {
            select: {
              products: { where: { active: true } },
            },
          },
        },
      }),
    );
  }

  async create(data: CreateCategoryDto) {
    const category = await this.prisma.category.create({
      data,
      include: {
        _count: {
          select: { products: true },
        },
      },
    });
    await this.invalidate();
    return category;
  }

  async update(id: string, data: UpdateCategoryDto) {
    const category = await this.prisma.category.update({
      where: { id },
      data,
      include: {
        _count: {
          select: { products: true },
        },
      },
    });
    await this.invalidate();
    return category;
  }

  async remove(id: string) {
    const category = await this.prisma.category.delete({
      where: { id },
    });
    await this.invalidate();
    return category;
  }

  private async invalidate() {
    await this.cache.invalidate('categories');
    await this.cache.invalidate('category');
    await this.cache.invalidate('products');
    await this.cache.invalidate('product');
  }
}
