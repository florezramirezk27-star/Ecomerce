import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import OpenAI from 'openai';

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);
  private readonly openai: OpenAI | null;
  private readonly embeddingModel = 'text-embedding-3-small';
  private readonly embeddingDim = 1536;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    } else {
      this.openai = null;
      this.logger.warn('OPENAI_API_KEY not set — embeddings disabled');
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }
    const cleaned = text.replace(/[\n\r]+/g, ' ').slice(0, 8000);
    const response = await this.openai.embeddings.create({
      model: this.embeddingModel,
      input: cleaned,
    });
    return response.data[0].embedding;
  }

  async generateProductEmbedding(product: {
    name: string;
    description?: string | null;
    categoryName: string;
    price: number;
  }): Promise<number[]> {
    const text = [
      `Producto: ${product.name}`,
      product.description ? `Descripción: ${product.description}` : '',
      `Categoría: ${product.categoryName}`,
      `Precio: $${product.price} COP`,
    ]
      .filter(Boolean)
      .join('. ');
    return this.generateEmbedding(text);
  }

  async syncProductEmbedding(productId: string): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { category: { select: { name: true } } },
    });
    if (!product) return;

    const vector = await this.generateProductEmbedding({
      name: product.name,
      description: product.description,
      categoryName: product.category.name,
      price: Number(product.price),
    });

    const vectorStr = `[${vector.join(',')}]`;

    const existing = await this.prisma.productEmbedding.findUnique({
      where: { productId },
    });

    if (existing) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE "ProductEmbedding" SET vector = $1::vector, "updatedAt" = NOW() WHERE "productId" = $2`,
        vectorStr,
        productId,
      );
    } else {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO "ProductEmbedding" ("id", "productId", vector, model) VALUES ($1, $2, $3::vector, $4)`,
        `emb_${productId}`,
        productId,
        vectorStr,
        this.embeddingModel,
      );
    }
  }

  async semanticSearch(
    query: string,
    limit = 5,
    categoryFilter?: string,
    maxPrice?: number,
  ): Promise<
    Array<{
      id: string;
      name: string;
      slug: string;
      price: number;
      image: string | null;
      stock: number;
      categoryName: string;
      similarity: number;
    }>
  > {
    const queryVector = await this.generateEmbedding(query);
    const queryVectorStr = `[${queryVector.join(',')}]`;

    let sql = `
      SELECT p.id, p.name, p.slug, p.price::float, p.image, p.stock,
             c.name as "categoryName",
             1 - (pe.vector <=> $1::vector) as similarity
      FROM "ProductEmbedding" pe
      JOIN "Product" p ON p.id = pe."productId"
      JOIN "Category" c ON c.id = p."categoryId"
      WHERE p.active = true AND pe.vector IS NOT NULL
    `;

    const params: string[] = [queryVectorStr];

    if (categoryFilter) {
      params.push(categoryFilter);
      sql += ` AND LOWER(c.name) = LOWER($${params.length})`;
    }

    if (maxPrice !== undefined) {
      params.push(String(maxPrice));
      sql += ` AND p.price <= $${params.length}`;
    }

    sql += ` ORDER BY similarity DESC LIMIT ${limit}`;

    try {
      const results = await this.prisma.$queryRawUnsafe<any[]>(sql, ...params);
      return results.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        price: r.price,
        image: r.image,
        stock: r.stock,
        categoryName: r.categoryName,
        similarity: r.similarity,
      }));
    } catch (error: any) {
      this.logger.error(
        `Semantic search error: ${error.message}. Falling back to text search.`,
      );
      return this.fallbackTextSearch(query, limit, categoryFilter, maxPrice);
    }
  }

  private async fallbackTextSearch(
    query: string,
    limit = 5,
    categoryFilter?: string,
    maxPrice?: number,
  ) {
    const where: any = { active: true };
    where.OR = [
      { name: { contains: query, mode: 'insensitive' } },
      { description: { contains: query, mode: 'insensitive' } },
    ];

    if (categoryFilter) {
      where.category = {
        name: { equals: categoryFilter, mode: 'insensitive' },
      };
    }

    if (maxPrice !== undefined) {
      where.price = { lte: maxPrice };
    }

    const products = await this.prisma.product.findMany({
      where,
      include: { category: { select: { name: true } } },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    return products.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      price: Number(p.price),
      image: p.image,
      stock: p.stock,
      categoryName: p.category.name,
      similarity: 0,
    }));
  }
}
