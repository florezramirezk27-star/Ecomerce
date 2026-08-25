import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmbeddingsService } from './embeddings.service';
import OpenAI from 'openai';

@Injectable()
export class RAGService {
  private readonly logger = new Logger(RAGService.name);
  private readonly openai: OpenAI | null;
  private readonly model: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly embeddingsService: EmbeddingsService,
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
    this.model =
      this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini';
  }

  async retrieveRelevantContext(
    userMessage: string,
    history: Array<{ role: string; content: string }>,
    userId?: string,
  ): Promise<{
    products: Array<{
      id: string;
      name: string;
      slug: string;
      price: number;
      image: string | null;
      stock: number;
      categoryName: string;
      similarity: number;
    }>;
    contextSummary: string;
  }> {
    if (!this.openai) {
      return { products: [], contextSummary: '' };
    }
    const searchQuery = await this.optimizeSearchQuery(userMessage, history);
    const products = await this.embeddingsService.semanticSearch(
      searchQuery,
      5,
    );
    const contextSummary =
      products.length > 0
        ? `Productos relevantes encontrados: ${products.map((p) => `${p.name} ($${p.price.toLocaleString('es-CO')} COP)`).join(', ')}`
        : 'No se encontraron productos relevantes en el catálogo.';

    return { products, contextSummary };
  }

  private async optimizeSearchQuery(
    userMessage: string,
    history: Array<{ role: string; content: string }>,
  ): Promise<string> {
    if (!this.openai) return userMessage;
    const recentHistory = history
      .slice(-6)
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `Eres un optimizador de búsqueda para un e-commerce. 
            Dado el historial de chat y el último mensaje del usuario, genera una consulta de búsqueda optimizada 
            de 2-5 palabras para encontrar productos relevantes en el catálogo.
            Responde SOLO con la consulta, sin explicaciones ni puntuación.`,
          },
          {
            role: 'user',
            content: `Historial:\n${recentHistory}\n\nÚltimo mensaje: ${userMessage}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 30,
      });

      return response.choices[0]?.message?.content?.trim() || userMessage;
    } catch {
      return userMessage;
    }
  }
}
