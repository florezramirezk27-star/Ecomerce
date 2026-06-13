import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { UploadService } from './upload.service';
import type { UploadedImageFile } from './upload.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('uploads')
export class UploadController {
  constructor(
    private readonly uploadService: UploadService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 5_000_000,
      },
    }),
  )
  async upload(
    @UploadedFile() file: UploadedImageFile,
  ) {
    if (!file) {
      throw new BadRequestException('No se recibió ningún archivo.');
    }

    const url = await this.uploadService.uploadFile(file);
    return { url };
  }
}
