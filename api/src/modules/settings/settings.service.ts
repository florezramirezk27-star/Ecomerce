import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

interface Settings {
  logo: string | null;
}

@Injectable()
export class SettingsService {
  private readonly filePath: string;

  constructor() {
    this.filePath = path.resolve(__dirname, '../../../settings.json');
    this.ensureFile();
  }

  private ensureFile() {
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify({ logo: null }), 'utf-8');
    }
  }

  private read(): Settings {
    try {
      return JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as Settings;
    } catch {
      return { logo: null };
    }
  }

  /**
   * Escribe de forma atomica: primero un temporal y despues un `rename`.
   *
   * `writeFileSync` trunca el destino antes de escribir, asi que si el proceso
   * muere a mitad (OOM, un rolling update) queda un `settings.json` truncado.
   * El `rename` es atomico en el mismo sistema de ficheros, asi que un lector
   * concurrente ve el archivo viejo completo o el nuevo completo, nunca un
   * estado intermedio.
   *
   * No cambia la ruta: el temporal vive en el mismo directorio que el destino,
   * que es lo que hace el `rename` atomico (otro disco o sistema de ficheros no
   * lo garantiza).
   */
  private write(data: Settings) {
    const tmpPath = `${this.filePath}.${process.pid}.tmp`;

    try {
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmpPath, this.filePath);
    } catch (error) {
      // Sin esta limpieza, un fallo deja temporales por cada intento fallido.
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        // El temporal no llego a crearse: no hay nada que borrar.
      }
      throw error;
    }
  }

  getLogo(): string | null {
    return this.read().logo;
  }

  setLogo(url: string) {
    const data = this.read();
    data.logo = url;
    this.write(data);
  }

  removeLogo() {
    const data = this.read();
    data.logo = null;
    this.write(data);
  }
}
