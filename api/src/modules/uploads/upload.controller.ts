import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
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

const ALLOWED_VIDEO_MIMES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
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

// Los contenedores de video (`mp4`, `mov`) usan el box `ftyp` en el byte 4. El
// `brand` (bytes 8-12) distingue el formato real: `isom`/`mp42`/`avc1` para MP4,
// `qt  ` para QuickTime. Sin esta comprobación, un archivo renombrado con
// extensión .mp4 pasaría el filtro de mimetype del navegador.
const VIDEO_MAGIC_BYTES: Record<string, Array<(buf: Buffer) => boolean>> = {
  'video/mp4': [
    (buf) =>
      buf.subarray(4, 8).equals(Buffer.from('ftyp')) &&
      ['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'dash'].includes(
        buf.subarray(8, 12).toString('latin1'),
      ),
  ],
  'video/quicktime': [
    (buf) =>
      buf.subarray(4, 8).equals(Buffer.from('ftyp')) &&
      buf.subarray(8, 12).toString('latin1') === 'qt  ',
  ],
  'video/webm': [
    (buf) => buf.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])),
  ],
};

function verifyMagicBytes(buffer: Buffer, mimetype: string): boolean {
  const checks = MAGIC_BYTES[mimetype] ?? VIDEO_MAGIC_BYTES[mimetype];
  if (!checks) return false;
  return checks.some((check) => check(buffer));
}

// Un clip de banner no necesita más. Acota lo que se mantiene en el heap con
// `memoryStorage`: sin este techo, un solo admin podría subir un archivo enorme
// y tumbar el proceso.
const MAX_VIDEO_BYTES = 25_000_000;

@Controller('uploads')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  // `memoryStorage` mantiene los 5 MB en el heap del proceso durante toda la
  // subida. Con el limite global, 100 peticiones de 5 MB son 500 MB en vuelo
  // desde una sola sesion. Es admin-only, asi que esto no es la defensa
  // principal, pero acota el daño de una sesión de admin comprometida.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 5_000_000,
      },
      fileFilter: (_req, file, cb) => {
        if (
          ALLOWED_MIMES.includes(
            file.mimetype as (typeof ALLOWED_MIMES)[number],
          )
        ) {
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

  @Post('video')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  // Un video de 25 MB se queda entero en el heap durante la subida. El limite de
  // peticiones por minuto acota cuantos pueden estar en vuelo a la vez.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: MAX_VIDEO_BYTES,
      },
      fileFilter: (_req, file, cb) => {
        if (
          ALLOWED_VIDEO_MIMES.includes(
            file.mimetype as (typeof ALLOWED_VIDEO_MIMES)[number],
          )
        ) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              `Tipo de archivo no permitido: ${file.mimetype}. Solo se aceptan videos: ${ALLOWED_VIDEO_MIMES.join(', ')}`,
            ),
            false,
          );
        }
      },
    }),
  )
  async uploadVideo(@UploadedFile() file: UploadedImageFile) {
    if (!file) {
      throw new BadRequestException('No se recibió ningún archivo.');
    }

    if (!verifyMagicBytes(file.buffer, file.mimetype)) {
      throw new BadRequestException(
        'El contenido del archivo no coincide con su tipo declarado.',
      );
    }

    const url = await this.uploadService.uploadFile(file, 'video');
    return { url };
  }
}
