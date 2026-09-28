import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogCacheService } from '../../common/cache/catalog-cache.service';
import { MAX_PAGE_SIZE } from '../../common/pipes/parse-pagination';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

/** Tope duro de resultados por pagina. */
export const DEFAULT_PAGE_SIZE = 20;

/**
 * Columnas del listado. Excluye `description`, `gallery`, `videos` y `customCode`,
 * que son las columnas pesadas y que el listado no usa: sin `select` explicito
 * cada fila arrastra la imagen completa del catalogo por la red.
 */
const listSelect = {
  id: true,
  name: true,
  slug: true,
  price: true,
  oldPrice: true,
  image: true,
  stock: true,
  active: true,
  dropiProductId: true,
  createdAt: true,
  categoryId: true,
  category: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.ProductSelect;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CatalogCacheService,
  ) {}

  async findAll(
    search?: string,
    categoryId?: string,
    sort?: 'priceAsc' | 'priceDesc',
    page?: number,
    limit?: number,
    onSale?: boolean,
    includeInactive = false,
  ) {
    const where: any = {};

    if (!includeInactive) {
      where.active = true;
    }

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
      : { createdAt: 'desc' };

    // Paginacion siempre activa. Antes, sin `page` ni `limit` la consulta
    // devolvia la tabla completa, y `?limit=1000000` no estaba acotado.
    const take = Math.min(
      Math.max(1, Math.trunc(Number(limit) || DEFAULT_PAGE_SIZE)),
      MAX_PAGE_SIZE,
    );
    const currentPage = Math.max(1, Math.trunc(Number(page) || 1));
    const skip = (currentPage - 1) * take;

    return this.cache.remember(
      'products',
      [search, categoryId, sort, onSale, includeInactive, currentPage, take],
      async () => {
        const [total, items] = await Promise.all([
          this.prisma.product.count({ where }),
          this.prisma.product.findMany({
            where,
            orderBy,
            skip,
            take,
            select: listSelect,
          }),
        ]);

        return {
          items,
          total,
          page: currentPage,
          limit: take,
          totalPages: Math.max(1, Math.ceil(total / take)),
        };
      },
    );
  }

  async findOne(idOrSlug: string, includeInactive = false) {
    return this.cache.remember(
      'product',
      [idOrSlug, includeInactive],
      async () => {
        const where: any = {};
        if (!includeInactive) {
          where.active = true;
        }

        // Try by ID first, then by slug
        let product = await this.prisma.product.findFirst({
          where: { ...where, id: idOrSlug },
          include: { category: true },
        });

        if (!product) {
          product = await this.prisma.product.findFirst({
            where: { ...where, slug: idOrSlug },
            include: { category: true },
          });
        }

        if (!product) return null;

        const similar = await this.prisma.product.findMany({
          where: {
            categoryId: product.categoryId,
            id: { not: product.id },
            active: true,
          },
          take: 8,
          orderBy: { createdAt: 'desc' },
          select: listSelect,
        });

        return { ...product, similarProducts: similar };
      },
    );
  }

  async create(dto: CreateProductDto) {
    const product = await this.prisma.product.create({
      data: dto,
      include: {
        category: true,
      },
    });
    await this.cache.invalidate('products');
    await this.cache.invalidate('product');
    await this.cache.invalidate('categories');
    return product;
  }

  async update(id: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.update({
      where: { id },
      data: dto as any,
      include: {
        category: true,
      },
    });
    await this.cache.invalidate('products');
    await this.cache.invalidate('product');
    await this.cache.invalidate('categories');
    return product;
  }

  async remove(id: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.cartItem.deleteMany({ where: { productId: id } });
      await tx.productEmbedding.deleteMany({ where: { productId: id } });

      const referencedInOrder = await tx.orderItem.findFirst({
        where: { productId: id },
        select: { id: true },
      });

      if (referencedInOrder) {
        const product = await tx.product.update({
          where: { id },
          data: { active: false },
        });
        return { ...product, archived: true };
      }

      return tx.product.delete({ where: { id } });
    });

    await this.cache.invalidate('products');
    await this.cache.invalidate('product');
    await this.cache.invalidate('categories');
    return result;
  }
}
