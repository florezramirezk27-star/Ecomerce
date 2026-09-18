import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  AgentTool,
  ToolContext,
  StockPriceInput,
  StockPriceOutput,
} from '../interfaces/agent.types';

type StockPriceIn = z.infer<typeof StockPriceInput>;
type StockPriceOut = z.infer<typeof StockPriceOutput>;

@Injectable()
export class StockPriceTool implements AgentTool<StockPriceIn, StockPriceOut> {
  name = 'consultarStockYPrecio';
  description =
    'Consulta el stock actual y precio de productos en la base de datos local. Usa esta herramienta cuando el usuario pregunte por disponibilidad, precios, o productos específicos. Si el usuario pregunta de forma general qué productos hay en la tienda o pide ver el catálogo, invócala SIN el parámetro query para listar los productos disponibles.';
  parameters = StockPriceInput;

  constructor(private readonly prisma: PrismaService) {}

  async execute(
    args: StockPriceIn,
    _context: ToolContext,
  ): Promise<StockPriceOut> {
    const where: any = { active: true };

    if (args.productId) {
      where.id = args.productId;
    } else if (args.slug) {
      where.slug = args.slug;
    } else if (args.query && args.query.trim()) {
      const q = args.query.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }

    const products = await this.prisma.product.findMany({
      where,
      include: { category: { select: { name: true } } },
      take: 10,
      orderBy: { createdAt: 'desc' },
    });

    if (args.query && args.query.trim() && products.length === 0) {
      const normalizedQuery = this.normalizeText(args.query.trim());
      const terms = normalizedQuery
        .split(/\s+/)
        .filter((w) => w.length > 2);

      if (terms.length > 0) {
        const fallbackCatalog = await this.prisma.product.findMany({
          where: { active: true },
          include: { category: { select: { name: true } } },
          take: 200,
          orderBy: { createdAt: 'desc' },
        });

        const matches = fallbackCatalog
          .filter((p) =>
            terms.some(
              (term) =>
                this.normalizeText(p.name).includes(term) ||
                this.normalizeText(p.description ?? '').includes(term),
            ),
          )
          .slice(0, 10);

        if (matches.length > 0) {
          return {
            success: true,
            products: matches.map((p) => ({
              id: p.id,
              name: p.name,
              slug: p.slug,
              price: Number(p.price),
              oldPrice: p.oldPrice ? Number(p.oldPrice) : null,
              stock: p.stock,
              image: p.image,
              categoryName: p.category?.name || 'General',
            })),
          };
        }
      }
    }

    return {
      success: products.length > 0,
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        price: Number(p.price),
        oldPrice: p.oldPrice ? Number(p.oldPrice) : null,
        stock: p.stock,
        image: p.image,
        categoryName: p.category?.name || 'General',
      })),
    };
  }

  private normalizeText(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ñ/g, 'n')
      .toLowerCase();
  }
}
