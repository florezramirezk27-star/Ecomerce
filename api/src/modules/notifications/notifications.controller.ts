import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedRequest } from '../../common/types/auth-request';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { NotificationsService } from './notifications.service';

const deviceSchema = z.object({
  token: z.string().min(20).max(4096),
  platform: z.enum(['android', 'ios']).default('android'),
});

const removeDeviceSchema = z.object({
  token: z.string().min(20).max(4096),
});

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('devices')
  registerDevice(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(deviceSchema))
    dto: z.infer<typeof deviceSchema>,
  ) {
    return this.notifications.registerDevice(req.user.id, dto);
  }

  @Delete('devices')
  unregisterDevice(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(removeDeviceSchema))
    dto: z.infer<typeof removeDeviceSchema>,
  ) {
    return this.notifications.unregisterDevice(req.user.id, dto.token);
  }

  @Get()
  list(
    @Req() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
  ) {
    return this.notifications.listForAdmin(
      req.user.id,
      limit ? Number(limit) : 30,
    );
  }

  @Patch(':id/read')
  markRead(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.notifications.markRead(req.user.id, id);
  }
}
