import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  getStats() {
    return this.dashboardService.getStats();
  }

  @Get('performance')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  getPerformance(@Query('period') period?: string) {
    return this.dashboardService.getPerformance(period);
  }
}
