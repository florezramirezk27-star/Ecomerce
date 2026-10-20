import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { SettingsService } from './settings.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  settingsLogoSchema,
  settingsHeroVideoSchema,
} from '../../common/schemas';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('logo')
  async getLogo() {
    const logo = await this.settingsService.getLogo();
    return { logo };
  }

  @Post('logo')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async setLogo(
    @Body(new ZodValidationPipe(settingsLogoSchema))
    body: {
      logo: string;
    },
  ) {
    await this.settingsService.setLogo(body.logo);
    return { logo: body.logo };
  }

  @Post('logo/remove')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async removeLogo() {
    await this.settingsService.removeLogo();
    return { logo: null };
  }

  @Get('hero-video')
  async getHeroVideo() {
    const video = await this.settingsService.getHeroVideo();
    return { video };
  }

  @Post('hero-video')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async setHeroVideo(
    @Body(new ZodValidationPipe(settingsHeroVideoSchema))
    body: {
      video: string;
    },
  ) {
    await this.settingsService.setHeroVideo(body.video);
    return { video: body.video };
  }

  @Post('hero-video/remove')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async removeHeroVideo() {
    await this.settingsService.removeHeroVideo();
    return { video: null };
  }
}
