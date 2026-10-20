import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

/**
 * Ajustes de la tienda: logo y video del banner del inicio.
 *
 * Viven en la tabla `AppSetting` (clave-valor) y no en un archivo en disco
 * porque en un servicio sin disco persistente ese archivo se regeneraba en cada
 * deploy y se perdia lo que el admin hubiera subido.
 *
 * Las lecturas se sirven de una cache en memoria: el navbar y el hero piden el
 * logo y el video en cada carga de pagina, y golpear la base de datos cada vez
 * seria trabajo gratis. La cache se invalida al escribir desde el propio
 * proceso, que es donde se origina cualquier cambio.
 */
const LOGO_KEY = 'logo';
const HERO_VIDEO_KEY = 'heroVideo';

@Injectable()
export class SettingsService {
  private readonly cache = new Map<string, string | null>();

  constructor(private readonly prisma: PrismaService) {}

  private async read(key: string): Promise<string | null> {
    if (this.cache.has(key)) return this.cache.get(key) ?? null;

    const row = await this.prisma.appSetting.findUnique({ where: { key } });
    const value = row?.value ?? null;
    this.cache.set(key, value);
    return value;
  }

  private async write(key: string, value: string | null): Promise<void> {
    if (value === null) {
      // `deleteMany` y no `delete`: borrar una clave que ya no existe no debe
      // reventar con P2025.
      await this.prisma.appSetting.deleteMany({ where: { key } });
    } else {
      await this.prisma.appSetting.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
    }
    this.cache.set(key, value);
  }

  getLogo(): Promise<string | null> {
    return this.read(LOGO_KEY);
  }

  async setLogo(url: string): Promise<void> {
    await this.write(LOGO_KEY, url);
  }

  async removeLogo(): Promise<void> {
    await this.write(LOGO_KEY, null);
  }

  getHeroVideo(): Promise<string | null> {
    return this.read(HERO_VIDEO_KEY);
  }

  async setHeroVideo(url: string): Promise<void> {
    await this.write(HERO_VIDEO_KEY, url);
  }

  async removeHeroVideo(): Promise<void> {
    await this.write(HERO_VIDEO_KEY, null);
  }
}
