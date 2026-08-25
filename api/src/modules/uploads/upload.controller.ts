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

const ALLOWED_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

const MAGIC_BYTES: Record<string, Array<(buf: Buffer) => boolean>> = {
  'image/jpeg': [
    (buf) => buf.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  ],
  'image/png': [
    (buf) => buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
  ],
  'image/webp': [
    (buf) =>
      buf.subarray(0, 4).equals(Buffer.from('RIFF')) &&
      buf.subarray(8, 12).equals(Buffer.from('WEBP')),
  ],
  'image/gif': [
    (buf) => buf.subarray(0, 6).equals(Buffer.from('GIF87a')),
    (buf) => buf.subarray(0, 6).equals(Buffer.from('GIF89a')),
  ],
};

function verifyMagicBytes(buffer: Buffer, mimetype: string): boolean {
  const checks = MAGIC_BYTES[mimetype];
  if (!checks) return false;
  return checks.some((check) => check(buffer));
}

@Controller('uploads')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 5_000_000,
      },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIMES.includes(file.mimetype as any)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              `Tipo de archivo no permitido: ${file.mimetype}. Solo se aceptan: ${ALLOWED_MIMES.join(', ')}`,
            ),
            false,
          );
        }
      },
    }),
  )
  async upload(@UploadedFile() file: UploadedImageFile) {
    if (!file) {
      throw new BadRequestException('No se recibió ningún archivo.');
    }

    if (!verifyMagicBytes(file.buffer, file.mimetype)) {
      throw new BadRequestException(
        'El contenido del archivo no coincide con su tipo declarado.',
      );
    }

    const url = await this.uploadService.uploadFile(file);
    return { url };
  }
}
