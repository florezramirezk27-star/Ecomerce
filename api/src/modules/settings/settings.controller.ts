import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { SettingsService } from './settings.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { settingsLogoSchema } from '../../common/schemas';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('logo')
  getLogo() {
    const logo = this.settingsService.getLogo();
    return { logo };
  }

  @Post('logo')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  setLogo(
    @Body(new ZodValidationPipe(settingsLogoSchema))
    body: {
      logo: string;
    },
  ) {
    this.settingsService.setLogo(body.logo);
    return { logo: body.logo };
  }

  @Post('logo/remove')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  removeLogo() {
    this.settingsService.removeLogo();
    return { logo: null };
  }
}
