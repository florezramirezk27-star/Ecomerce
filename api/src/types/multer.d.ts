/**
 * Declaración mínima de `multer`.
 *
 * El paquete no publica tipos y `@types/multer` no está instalado en este
 * monorepo, así que `import { memoryStorage } from 'multer'` se resolvía como
 * un error de tipo (tsc TS7016) y ESLint lo veía como una llamada de tipo no
 * resoluble. Se declara solo lo que usa la API: el storage en memoria.
 *
 * Si algún día se instala `@types/multer`, borrar este archivo.
 */
declare module 'multer' {
  import type { Request } from 'express';

  /** Archivo que multer deja en memoria (5 MB máximo por subida). */
  export interface MulterMemoryFile {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
  }

  /** Contrato que exige `MulterOptions.storage` de `@nestjs/platform-express`. */
  export interface StorageEngine {
    _handleFile(
      req: Request,
      file: MulterMemoryFile,
      cb: (error?: Error | null, info?: Record<string, unknown>) => void,
    ): void;
    _removeFile(
      req: Request,
      file: MulterMemoryFile,
      cb: (error?: Error | null) => void,
    ): void;
  }

  export function memoryStorage(): StorageEngine;
}
