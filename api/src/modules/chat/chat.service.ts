import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatIntent } from '@prisma/client';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import {
  ChatContext,
  ProductRecommendation,
} from './interfaces/chat.interface';

interface SessionContext {
  messages: Array<{ role: string; content: string }>;
  expiresAt: number;
}

@Injectable()
export class ChatService {
  private readonly memoryStore = new Map<string, SessionContext>();
  private readonly SESSION_TTL_MS = 30 * 60 * 1000;

  private readonly SYSTEM_PROMPT = `Eres "KronioBot", el asistente virtual de Kronio Market, una tienda online colombiana de productos variados.

REGLAS FUNDAMENTALES:
- Responde SIEMPRE en español, con tono amable y profesional.
- Sé conciso pero útil. Usa emojis moderadamente para hacer la conversación más amigable.
- Si el usuario pregunta por precios, muestra la información y sugiere visitar la tienda.
- Si el usuario muestra intención de compra, guíalo amablemente a través del proceso.

INTENCIONES DE COMPRA - DETECCIÓN:
Cuando detectes intención de compra (frases como "quiero comprar", "cuánto cuesta", "precio", "me interesa", "cómo compro"):
1. Proporciona información del producto si está disponible.
2. Explica que puede agregar productos al carrito y proceder al checkout.
3. Puedes mencionar que aceptamos pagos contra entrega (CASH_ON_DELIVERY).

INFORMACIÓN DE LA TIENDA:
- Nombre: Kronio Market
- Métodos de pago: Pago contra entrega (efectivo)
- Envíos: A toda Colombia
- Horario de atención: 8:00 AM - 6:00 PM`;

  constructor(private readonly prisma: PrismaService) {}

  private static hashSecret(secret: string): string {
    return createHash('sha256').update(secret, 'utf8').digest('hex');
  }

  private static secretsMatch(secret: string, storedHash: string): boolean {
    const a = Buffer.from(ChatService.hashSecret(secret), 'hex');
    const b = Buffer.from(storedHash, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  async getOrCreateSession(
    sessionId?: string,
    userId?: string,
    guestId?: string,
    guestSecret?: string,
  ): Promise<ChatContext> {
    if (sessionId) {
      const session = await this.prisma.chatSession.findUnique({
        where: { id: sessionId },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            take: 50,
          },
        },
      });

      if (session) {
        if (session.userId) {
          if (!userId || session.userId !== userId) {
            throw new ForbiddenException('No tienes acceso a esta sesión');
          }
        } else {
          const hash = session.guestSecretHash;
          if (
            !hash ||
            !guestSecret ||
            !ChatService.secretsMatch(guestSecret, hash)
          ) {
            throw new ForbiddenException('No tienes acceso a esta sesión');
          }
        }

        return {
          sessionId: session.id,
          userId: session.userId ?? undefined,
          guestId: session.guestId ?? undefined,
          intent: session.intent ?? undefined,
          messages: session.messages.map((m) => ({
            role: m.role as 'user' | 'assistant' | 'system',
            content: m.content,
          })),
        };
      }
    }

    if (userId) {
      const created = await this.prisma.chatSession.create({
        data: {
          userId: userId ?? null,
          guestId: null,
          intent: 'GENERAL',
        },
      });

      return {
        sessionId: created.id,
        userId: created.userId ?? undefined,
        guestId: created.guestId ?? undefined,
        intent: created.intent ?? undefined,
        messages: [],
      };
    }

    const newGuestSecret = randomBytes(32).toString('base64url');
    const created = await this.prisma.chatSession.create({
      data: {
        userId: null,
        guestId: guestId ?? null,
        guestSecretHash: ChatService.hashSecret(newGuestSecret),
        intent: 'GENERAL',
      },
    });

    return {
      sessionId: created.id,
      userId: created.userId ?? undefined,
      guestId: created.guestId ?? undefined,
      intent: created.intent ?? undefined,
      newGuestSecret,
      messages: [],
    };
  }

  async detectIntent(message: string): Promise<ChatIntent> {
    const lower = message.toLowerCase();

    if (
      /\b(comprar|compro|precio|cuesta|carrito|ordenar|pedir|adquirir)\b/.test(
        lower,
      )
    ) {
      return 'PURCHASE';
    }
    if (
      /\b(envío|envio|envían|domicilio|entrega|shipping|envíen)\b/.test(lower)
    ) {
      return 'SHIPPING';
    }
    if (
      /\b(pedido|orden|estado|seguimiento|llegó|llegó|rastrear)\b/.test(lower)
    ) {
      return 'ORDER_STATUS';
    }
    if (
      /\b(productos?|catálogos?|catalogos?|tienen|venden|características|especificaciones)\b/.test(
        lower,
      )
    ) {
      return 'PRODUCT_INFO';
    }
    if (
      /\b(ayuda|soporte|problema|error|falla|bug|ayúdame|no funciona)\b/.test(
        lower,
      )
    ) {
      return 'SUPPORT';
    }

    return 'GENERAL';
  }

  async searchProducts(
    query: string,
    limit = 5,
  ): Promise<ProductRecommendation[]> {
    const products = await this.prisma.product.findMany({
      where: {
        active: true,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ],
      },
      include: { category: true },
      take: limit,
    });

    return products.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      price: Number(p.price),
      image: p.image ?? undefined,
      stock: p.stock,
      categoryName: p.category.name,
    }));
  }

  async getContextFromCache(
    sessionId: string,
  ): Promise<Array<{ role: string; content: string }> | null> {
    const cached = this.memoryStore.get(sessionId);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.messages;
    }
    if (cached) {
      this.memoryStore.delete(sessionId);
    }
    return null;
  }

  setContextCache(
    sessionId: string,
    messages: Array<{ role: string; content: string }>,
  ): void {
    this.memoryStore.set(sessionId, {
      messages: messages.slice(-40),
      expiresAt: Date.now() + this.SESSION_TTL_MS,
    });
  }

  buildPrompt(
    context: ChatContext,
    products: ProductRecommendation[],
    intent: ChatIntent,
  ): string {
    let productContext = '';
    if (products.length > 0) {
      productContext = `\nPRODUCTOS RELACIONADOS DISPONIBLES:\n${products
        .map(
          (p) =>
            `- ${p.name} | Precio: $${p.price.toLocaleString('es-CO')} COP | Stock: ${p.stock > 0 ? 'Disponible' : 'Agotado'}`,
        )
        .join('\n')}`;
    }

    return `${this.SYSTEM_PROMPT}
${productContext}

CONTEXTO ADICIONAL:
- Intención detectada: ${intent}
- Historial de mensajes: ${context.messages.length} intercambios previos

INSTRUCCIONES ESPECÍFICAS:
1. Si hay productos relacionados disponibles, menciónalos y recomiéndalos.
2. Si el usuario quiere comprar, indícale que puede agregar los productos al carrito desde la página de producto.
3. Si pregunta por envíos, indica que hacemos envíos a toda Colombia.
4. Responde de forma natural y conversacional.`;
  }

  async persistMessage(
    sessionId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    intent?: ChatIntent,
  ): Promise<void> {
    await this.prisma.chatMessage.create({
      data: {
        sessionId,
        role,
        content,
      },
    });

    if (intent) {
      await this.prisma.chatSession.update({
        where: { id: sessionId },
        data: { intent },
      });
    }

    await this.prisma.chatSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    });
  }

  async getSessionById(sessionId: string) {
    return this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        userId: true,
        guestId: true,
        guestSecretHash: true,
      },
    });
  }

  assertSessionAccess(
    session: {
      userId: string | null;
      guestId: string | null;
      guestSecretHash: string | null;
    },
    opts: { userId?: string; isAdmin?: boolean; guestSecret?: string },
  ): void {
    if (opts.isAdmin) return;

    if (session.userId) {
      if (!opts.userId || session.userId !== opts.userId) {
        throw new ForbiddenException('No tienes permiso para ver esta sesión');
      }
      return;
    }

    const hash = session.guestSecretHash;
    if (
      !hash ||
      !opts.guestSecret ||
      !ChatService.secretsMatch(opts.guestSecret, hash)
    ) {
      throw new ForbiddenException('No tienes permiso para ver esta sesión');
    }
  }

  async getHistory(sessionId: string, limit = 50, before?: string) {
    const where: any = { sessionId };
    if (before) {
      where.id = { lt: before };
    }

    return this.prisma.chatMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
