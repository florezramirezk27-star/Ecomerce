import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpException,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ChatService } from './chat.service';
import { AIService } from '../ai/ai.service';
import { SendMessageDto } from './dto/chat-message.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';

@ApiTags('Chat')
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly aiService: AIService,
  ) {}

  @Post('message')
  @HttpCode(200)
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async sendMessage(@Body() dto: SendMessageDto, @Req() req: any) {
    const userId = req.user?.id;
    const isAdmin = req.user?.role === 'ADMIN';
    const message = dto.message.trim();

    if (!userId && !dto.guestId) {
      throw new HttpException('Se requiere guestId o autenticación', 400);
    }

    if (!userId && dto.sessionId && !dto.guestSecret) {
      throw new HttpException(
        'Se requiere guestSecret para continuar una sesión de invitado',
        400,
      );
    }

    const context = await this.chatService.getOrCreateSession(
      dto.sessionId,
      userId,
      userId ? undefined : dto.guestId,
      userId ? undefined : dto.guestSecret,
    );

    await this.chatService.persistMessage(context.sessionId, 'user', message);

    await this.aiService.updateConversationState(
      context.sessionId,
      context.intent || 'GENERAL',
      message,
    );

    const result = await this.aiService.processMessage(
      message,
      context.messages,
      {
        sessionId: context.sessionId,
        userId,
        isAdmin,
      },
    );

    await this.chatService.persistMessage(
      context.sessionId,
      'assistant',
      result.text,
    );

    return {
      sessionId: context.sessionId,
      response: result.text,
      ui: result.ui || undefined,
      toolCalls: result.toolCalls,
      ...(context.newGuestSecret
        ? { guestSecret: context.newGuestSecret }
        : {}),
    };
  }

  @Get('history')
  @UseGuards(OptionalJwtAuthGuard)
  async getHistory(
    @Query('sessionId') sessionId: string,
    @Req() req: any,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
    @Headers('x-guest-secret') guestSecret?: string,
  ) {
    if (!sessionId) {
      throw new HttpException('sessionId es requerido', 400);
    }

    const userId = req.user?.id;
    const isAdmin = req.user?.role === 'ADMIN';

    const session = await this.chatService.getSessionById(sessionId);

    if (!session) {
      throw new HttpException('Sesión no encontrada', 404);
    }

    this.chatService.assertSessionAccess(session, {
      userId,
      isAdmin,
      guestSecret,
    });

    const messages = await this.chatService.getHistory(
      sessionId,
      limit ? Number(limit) : 50,
      before,
    );

    return { sessionId, messages };
  }
}
