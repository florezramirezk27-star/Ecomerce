import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  AgentTool,
  ToolContext,
  StockPriceInput,
  StockPriceOutput,
} from '../interfaces/agent.types';

type StockPriceIn = z.infer<typeof StockPriceInput>;
type StockPriceOut = z.infer<typeof StockPriceOutput>;

/** Palabras vacías que no aportan nada a la búsqueda de respaldo. */
const STOP_WORDS = new Set([
  'que',
  'como',
  'los',
  'las',
  'por',
  'para',
  'con',
  'del',
  'de',
  'una',
  'uno',
  'unos',
  'unas',
  'quiero',
  'quisiera',
  'buscar',
  'busco',
  'me',
  'mi',
  'tienen',
  'tiene',
  'tienes',
  'venden',
  'vende',
  'hay',
  'ver',
  'producto',
  'productos',
  'catalogo',
  'catálogo',
  'tienda',
  'alguno',
  'algunos',
  'alguna',
  'algunas',
]);

/** Fila del catálogo con lo mínimo que necesita la herramienta. */
type RowCatalogo = {
  id: string;
  name: string;
  slug: string;
  price: unknown;
  oldPrice: unknown;
  stock: number;
  image: string | null;
  description?: string | null;
  category?: { name: string } | null;
};

@Injectable()
export class StockPriceTool implements AgentTool<StockPriceIn, StockPriceOut> {
  name = 'consultarStockYPrecio';
  description =
    'Consulta el stock actual y el precio de los productos de la base de datos local. Es la única herramienta para ver productos.\n' +
    'Cómo usarla:\n' +
    '- Producto concreto (nombre o marca, p. ej. "reloj naviforce", "tennis blancos"): pasa las palabras del producto en el parámetro query.\n' +
    '- Productos de UNA categoría (p. ej. "relojes", "zapatos", "electrodomésticos", "tecnología"): pasa el nombre de la categoría en el parámetro category.\n' +
    '- Producto dentro de una categoría: usa los dos parámetros a la vez (query y category).\n' +
    '- SOLO cuando el cliente pida ver todo el catálogo sin nombrar nada ("qué productos tienes", "qué venden", "muéstrame el catálogo"): invócala SIN query ni category.\n' +
    'Debes pasar SIEMPRE los términos que nombre el cliente; el resultado se acota a lo que nombre. Devuelve hasta 10 productos.';
  parameters = StockPriceInput;

  constructor(private readonly prisma: PrismaService) {}

  async execute(
    args: StockPriceIn,
    _context: ToolContext,
  ): Promise<StockPriceOut> {
    // La herramienta no usa el contexto; se conserva el parametro para cumplir
    // el contrato de AgentTool y `void` evita el aviso de variable sin usar.
    void _context;

    const query = args.query?.trim();
    const category = args.category?.trim();

    const products = await this.buscarEnBase(args, query, category);

    if (
      (query || category) &&
      !args.productId &&
      !args.slug &&
      products.length === 0
    ) {
      // Segunda pasada sin acentos ni plurales sobre el catálogo completo:
      // cubre los casos en que lo que escribe el cliente no coincide letra
      // por letra con el nombre o la categoría del producto.
      const fuzzy = await this.buscarFuzzy(query, category);
      if (fuzzy.length > 0) {
        return { success: true, products: fuzzy };
      }
    }

    return {
      success: products.length > 0,
      products: products.map((p) => this.toOutput(p)),
    };
  }

  /**
   * Primera pasada: filtros directos en la base de datos. El término libre
   * (`query`) se busca en nombre, descripción y nombre de categoría; el
   * parámetro `category` filtra por la categoría del producto. Cuando ambos
   * llegan, se combinan con AND (producto de esa categoría).
   */
  private async buscarEnBase(
    args: StockPriceIn,
    query?: string,
    category?: string,
  ): Promise<RowCatalogo[]> {
    const where: Prisma.ProductWhereInput = { active: true };

    if (args.productId) {
      where.id = args.productId;
    } else if (args.slug) {
      where.slug = args.slug;
    } else if (query || category) {
      const condiciones: Prisma.ProductWhereInput[] = [];

      if (query) {
        condiciones.push({
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
            { category: { name: { contains: query, mode: 'insensitive' } } },
          ],
        });
      }

      if (category) {
        condiciones.push({
          category: { name: { contains: category, mode: 'insensitive' } },
        });
      }

      where.AND = condiciones;
    }

    return this.prisma.product.findMany({
      where,
      include: { category: { select: { name: true } } },
      take: 10,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Segunda pasada: coincide por términos normalizados, sin acentos. Con OR
   * entre términos ("reloj naviforce") devolvía todo lo que casara con uno
   * solo (todos los relojes); aquí cada término debe aparecer en el producto.
   */
  private async buscarFuzzy(
    query?: string,
    category?: string,
  ): Promise<StockPriceOut['products']> {
    const terms = this.normalizeText(`${query ?? ''} ${category ?? ''}`)
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

    if (terms.length === 0) return [];

    const fallbackCatalog = await this.prisma.product.findMany({
      where: { active: true },
      include: { category: { select: { name: true } } },
      take: 200,
      orderBy: { createdAt: 'desc' },
    });

    return fallbackCatalog
      .filter((p) =>
        terms.every(
          (term) =>
            this.normalizeText(p.name).includes(term) ||
            this.normalizeText(p.description ?? '').includes(term) ||
            this.normalizeText(p.category?.name ?? '').includes(term),
        ),
      )
      .slice(0, 10)
      .map((p) => this.toOutput(p));
  }

  private toOutput(p: RowCatalogo): StockPriceOut['products'][number] {
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      price: Number(p.price),
      oldPrice: p.oldPrice ? Number(p.oldPrice) : null,
      stock: p.stock,
      image: p.image,
      categoryName: p.category?.name || 'General',
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
