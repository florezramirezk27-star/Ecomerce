import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PresenceService } from './presence.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';

interface PresencePingDto {
  visitorId?: string;
  path?: string;
  referrer?: string;
}

@ApiTags('Presence')
@Controller('presence')
export class PresenceController {
  constructor(private readonly presenceService: PresenceService) {}

  /**
   * Latido del visitante. Es un GET a proposito: el storefront lo dispara en
   * background (incluido al cerrar la pestana) y asi no depende del token CSRF
   * ni de un preflight. No guarda datos personales, solo un id anonimo.
   */
  @Get('heartbeat')
  @Header('Cache-Control', 'no-store')
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async heartbeat(@Query() query: PresencePingDto, @Req() req: any) {
    const result = await this.presenceService.heartbeat({
      visitorId: query.visitorId ?? null,
      lastPath: query.path,
      referrer: query.referrer,
      userId: req.user?.id ?? null,
    });

    return { online: result.online, ttlMs: 90_000 };
  }

  /** Salida explicita del visitante; el TTL cubre el caso de que no llegue. */
  @Post('leave')
  @Header('Cache-Control', 'no-store')
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async leave(@Body() body: PresencePingDto) {
    return { online: await this.presenceService.leave(body?.visitorId) };
  }

  @Delete('leave')
  @Header('Cache-Control', 'no-store')
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async leaveDelete(@Query('visitorId') visitorId?: string) {
    return { online: await this.presenceService.leave(visitorId) };
  }

  @Get('storefront')
  @Header('Cache-Control', 'no-store')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  getStorefront(@Query('limit') limit?: string) {
    return this.presenceService.getSnapshot(limit ? Number(limit) : undefined);
  }
}
