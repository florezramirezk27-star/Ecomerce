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
    'Consulta el stock actual y precio de productos en la base de datos local. Usa esta herramienta cuando el usuario pregunte por disponibilidad, precios, o productos específicos.';
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
    } else if (args.query) {
      where.OR = [
        { name: { contains: args.query, mode: 'insensitive' } },
        { description: { contains: args.query, mode: 'insensitive' } },
      ];
    }

    const products = await this.prisma.product.findMany({
      where,
      include: { category: { select: { name: true } } },
      take: 10,
      orderBy: { createdAt: 'desc' },
    });

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
        categoryName: p.category.name,
      })),
    };
  }
}
