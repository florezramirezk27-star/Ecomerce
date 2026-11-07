import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  registerPushDeviceSchema,
  type RegisterPushDeviceDto,
} from '../../common/schemas/push/register-push-device.schema';
import { PushDeviceService } from './push-device.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../../common/types/auth-request';

@Controller('notifications')
export class PushDeviceController {
  constructor(private readonly deviceService: PushDeviceService) {}

  /**
   * Registra (o actualiza) el token FCM del dispositivo para el administrador
   * autenticado.
   *
   * Cuerpo:
   *   { "token": "FCM_TOKEN", "platform": "android" | "ios" }
   *
   * Solo ADMIN. El token queda asociado al usuario autenticado; no se permite
   * registrar a nombre de otro usuario.
   */
  @Post('devices')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(200)
  async register(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(registerPushDeviceSchema))
    dto: RegisterPushDeviceDto,
  ) {
    await this.deviceService.registerOrUpdate(
      req.user.id,
      dto.token,
      dto.platform as 'android' | 'ios',
    );
    return { ok: true };
  }

  /**
   * Elimina el dispositivo del administrador autenticado por su token FCM.
   *
   * Cuerpo:
   *   { "token": "FCM_TOKEN", "platform": "android" | "ios" }
   *
   * Solo ADMIN. Solo se puede eliminar el propio dispositivo.
   */
  @Delete('devices')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(200)
  async remove(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(registerPushDeviceSchema))
    dto: RegisterPushDeviceDto,
  ) {
    await this.deviceService.remove(req.user.id, dto.token);
    return { ok: true };
  }
}
