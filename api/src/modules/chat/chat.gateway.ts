import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { ChatService } from './chat.service';
import { AIService } from '../ai/ai.service';
import { sendMessageSchema } from './schemas/chat.schema';
import { WsThrottlerGuard } from '../../common/guards/ws-throttler.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { WsTicketStore } from '../../common/ws-ticket.store';

@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },
})
@UseGuards(WsThrottlerGuard)
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly aiService: AIService,
    private readonly prisma: PrismaService,
  ) {}

  private async resolveUser(ticket?: string) {
    if (ticket) {
      const payload = WsTicketStore.consume(ticket);
      if (!payload) return undefined;

      const user = await this.prisma.user.findUnique({
        where: { id: payload.userId },
      });
      if (!user) return undefined;

      return { id: user.id, email: user.email, role: user.role };
    }

    return undefined;
  }

  async handleConnection(client: Socket): Promise<void> {
    const ticket = client.handshake.auth?.ticket as string | undefined;

    client.data.authReady = (async () => {
      client.data.user = await this.resolveUser(ticket);
      client.data.guestSecret = client.handshake.auth?.guestSecret as
        | string
        | undefined;
    })();

    await client.data.authReady;

    this.logger.log(
      `Cliente conectado: ${client.id}${client.data.user ? ` (usuario: ${client.data.user.id})` : ' (invitado)'}`,
    );
    client.emit('chat.connected', { clientId: client.id });
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Cliente desconectado: ${client.id}`);
  }

  @SubscribeMessage('chat.message')
  async handleMessage(client: Socket, payload: unknown): Promise<void> {
    await client.data?.authReady?.catch(() => {});

    const parsed = sendMessageSchema.safeParse(payload);
    if (!parsed.success) {
      client.emit('chat.error', {
        message: 'Mensaje inválido',
        errors: parsed.error.issues.map((i) => ({
          field: i.path.join('.'),
          detail: i.message,
        })),
      });
      return;
    }

    const { message, sessionId, guestId, guestSecret } = parsed.data;
    const userId = client.data?.user?.id;
    const isAdmin = client.data?.user?.role === 'ADMIN';
    const effectiveGuestSecret = guestSecret || client.data?.guestSecret;

    if (!userId && !guestId) {
      client.emit('chat.error', {
        message:
          'Debes proporcionar un identificador (guestId o iniciar sesión)',
      });
      return;
    }

    if (!userId && sessionId && !effectiveGuestSecret) {
      client.emit('chat.error', {
        message:
          'Se requiere el secreto de sesión para continuar la conversación',
      });
      return;
    }

    try {
      const context = await this.chatService.getOrCreateSession(
        sessionId,
        userId,
        userId ? undefined : guestId,
        userId ? undefined : effectiveGuestSecret,
      );

      await this.chatService.persistMessage(context.sessionId, 'user', message);

      await this.aiService.updateConversationState(
        context.sessionId,
        context.intent || 'GENERAL',
        message,
      );

      client.emit('chat.stream_start', {
        sessionId: context.sessionId,
        ...(context.newGuestSecret
          ? { guestSecret: context.newGuestSecret }
          : {}),
      });

      const generator = this.aiService.streamMessage(
        message,
        context.messages,
        {
          sessionId: context.sessionId,
          userId,
          isAdmin,
        },
      );

      let lastUIs: any[] = [];
      let fullText = '';

      for await (const chunk of generator) {
        if (chunk.type === 'text' && chunk.content) {
          fullText += chunk.content;
          client.emit('chat.stream', {
            sessionId: context.sessionId,
            content: chunk.content,
          });
        } else if (chunk.type === 'ui' && chunk.ui) {
          lastUIs = chunk.ui;
        }
      }

      await this.chatService.persistMessage(
        context.sessionId,
        'assistant',
        fullText,
      );

      client.emit('chat.done', {
        sessionId: context.sessionId,
        ui: lastUIs.length > 0 ? lastUIs : undefined,
      });
    } catch (error: any) {
      this.logger.error(`Error en chat: ${error.message}`);
      client.emit('chat.error', {
        message:
          error?.status === 403
            ? 'No tienes acceso a esta conversación'
            : 'Error al procesar el mensaje. Intenta de nuevo.',
      });
    }
  }

  @SubscribeMessage('chat.history')
  async handleHistory(
    client: Socket,
    payload: { sessionId: string; limit?: number; guestSecret?: string },
  ): Promise<void> {
    await client.data?.authReady?.catch(() => {});

    if (!payload?.sessionId) {
      client.emit('chat.error', { message: 'sessionId es requerido' });
      return;
    }

    try {
      const userId = client.data?.user?.id;
      const isAdmin = client.data?.user?.role === 'ADMIN';

      const session = await this.chatService.getSessionById(payload.sessionId);

      if (!session) {
        client.emit('chat.error', { message: 'Sesión no encontrada' });
        return;
      }

      this.chatService.assertSessionAccess(session, {
        userId,
        isAdmin,
        guestSecret: payload.guestSecret || client.data?.guestSecret,
      });

      const messages = await this.chatService.getHistory(
        payload.sessionId,
        Math.min(Math.max(payload.limit ?? 50, 1), 100),
      );
      client.emit('chat.history', {
        sessionId: payload.sessionId,
        messages,
      });
    } catch (error: any) {
      client.emit('chat.error', {
        message:
          error?.status === 403
            ? 'No tienes permiso para ver esta sesión'
            : 'Error al obtener historial',
      });
    }
  }
}
