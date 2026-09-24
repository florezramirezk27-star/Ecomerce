import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { MailService } from './mail.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('mail')
export class MailController {
  constructor(private readonly mailService: MailService) {}

  @Post('test')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async test(@Body('to') to?: string) {
    const target =
      (to && to.trim()) ||
      process.env.ADMIN_EMAIL ||
      process.env.ADMIN_GOOGLE_EMAIL ||
      '';
    return this.mailService.sendTestEmail(target);
  }
}