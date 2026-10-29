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
 * Filtro de estado del listado.
 *
 * - `active`: solo productos visibles en la tienda.
 * - `inactive`: solo archivados (los "eliminados" con pedidos asociados).
 * - `all`: ambos.
 */
export type ProductStatus = 'active' | 'inactive' | 'all';

const PRODUCT_STATUSES: readonly ProductStatus[] = [
  'active',
  'inactive',
  'all',
];

/** Normaliza el `status` de la query. Un valor desconocido se ignora. */
export function parseProductStatus(value?: string): ProductStatus | undefined {
  return PRODUCT_STATUSES.includes(value as ProductStatus)
    ? (value as ProductStatus)
    : undefined;
}

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
    status?: ProductStatus,
  ) {
    const where: Prisma.ProductWhereInput = {};

    // `status` es el filtro explicito del panel. Cuando no viene, se mantiene el
    // comportamiento historico: los anonimos solo ven activos y el admin ve todo
    // (`includeInactive`). El admin manda `status` porque necesita separar
    // activos de archivados: un producto "eliminado" con pedidos queda inactivo
    // y, sin filtro, seguia apareciendo y parecia que el borrado no funciono.
    if (status === 'active') {
      where.active = true;
    } else if (status === 'inactive') {
      where.active = false;
    } else if (!includeInactive) {
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
      [
        search,
        categoryId,
        sort,
        onSale,
        includeInactive,
        status,
        currentPage,
        take,
      ],
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
        const where: Prisma.ProductWhereInput = {};
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
    // La categoria se cachea **con sus productos** (precio, stock, nombre).
    // Sin esta invalidacion, `GET /categories/:id` seguiria devolviendo la
    // ficha anterior del producto recien creado.
    await this.cache.invalidate('category');
    return product;
  }

  async update(id: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.update({
      where: { id },
      data: dto,
      include: {
        category: true,
      },
    });
    await this.cache.invalidate('products');
    await this.cache.invalidate('product');
    await this.cache.invalidate('categories');
    // La categoria se cachea **con sus productos**: al cambiar el precio, el
    // stock o el nombre de un producto, la ficha de su categoria seguia
    // mostrando los datos viejos.
    await this.cache.invalidate('category');
    return product;
  }

  async remove(id: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      // Borrar items del carrito y embeddings primero
      await tx.cartItem.deleteMany({ where: { productId: id } });
      await tx.productEmbedding.deleteMany({ where: { productId: id } });

      // Borrar orderItems asociados (para poder borrar productos de prueba
      // que tengan pedidos; en producción esto protege la integridad, pero
      // el usuario ha indicado que estos son productos de prueba y se pueden
      // eliminar junto con sus pedidos).
      await tx.orderItem.deleteMany({ where: { productId: id } });

      // Eliminar definitivamente el producto (hard delete)
      const product = await tx.product.delete({ where: { id } });
      return product;
    });

    await this.cache.invalidate('products');
    await this.cache.invalidate('product');
    await this.cache.invalidate('categories');
    // Tambien aqui: la categoria cachea la lista de sus productos, asi que
    // un producto borrado (o archivado) seguia apareciendo en su ficha.
    await this.cache.invalidate('category');
    return result;
  }

  /**
   * Desactivar un producto (poner active: false).
   * El producto dejará de aparecer en la tienda pero se conservará en la BD
   * con historial de pedidos preservado.
   */
  async deactivate(id: string) {
    const product = await this.prisma.product.update({
      where: { id },
      data: { active: false },
    });
    await this.cache.invalidate('products');
    await this.cache.invalidate('product');
    await this.cache.invalidate('categories');
    return product;
  }

  /**
   * Reactivar un producto (poner active: true).
   * El producto volverá a aparecer en la tienda.
   */
  async activate(id: string) {
    const product = await this.prisma.product.update({
      where: { id },
      data: { active: true },
    });
    await this.cache.invalidate('products');
    await this.cache.invalidate('product');
    await this.cache.invalidate('categories');
    return product;
  }
}
