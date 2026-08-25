import {
  Body,
  Controller,
  Get,
  HttpException,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DropiService } from './dropi.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('dropi')
export class DropiController {
  constructor(private readonly dropiService: DropiService) {}

  @Get('status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async status() {
    return this.dropiService.getStatus();
  }

  @Get('catalog')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async catalog(
    @Query('search') search?: string,
    @Query('pageSize') pageSize?: string,
    @Query('userVerified') userVerified?: string,
    @Query('favorite') favorite?: string,
  ) {
    const body: any = {
      pageSize: pageSize ? Number(pageSize) : 50,
      startData: 0,
      privated_product: false,
      userVerified: userVerified === 'true',
      favorite: favorite === 'true',
      country: 'COLOMBIA',
      get_stock: false,
      no_count: true,
      search_type: 'simple',
      with_collection: true,
    };

    if (search) {
      const searchId = Number(search);
      if (!isNaN(searchId) && search.trim() === String(searchId)) {
        body.search_type = 'id';
        body.keywords = search;
      } else {
        body.name = search;
      }
    }

    return this.dropiService.getDropiProducts(body);
  }

  @Post('import')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async import(@Body('dropiProductId') dropiProductId: number) {
    try {
      return await this.dropiService.importProduct(dropiProductId);
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      const message =
        error instanceof Error ? error.message : 'Error al importar';
      throw new HttpException(message, 500);
    }
  }

  @Post('relogin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async relogin() {
    await this.dropiService.login();
    return this.dropiService.getStatus();
  }

  @Post('force-relogin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async forceRelogin() {
    return this.dropiService.forceRelogin();
  }
}
