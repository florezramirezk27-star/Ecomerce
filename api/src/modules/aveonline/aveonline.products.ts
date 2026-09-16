import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AveonlineClient } from './aveonline.client';
import { AveonlineAuthService } from './aveonline.auth';
import { AveonlineProvider } from './aveonline.types';

@Injectable()
export class AveonlineProductsService {
  private readonly logger = new Logger(AveonlineProductsService.name);

  constructor(
    private readonly client: AveonlineClient,
    private readonly auth: AveonlineAuthService,
    private readonly prisma: PrismaService,
  ) {}

  async fetchProviders(): Promise<AveonlineProvider[]> {
    const token = await this.auth.ensureConnected();
    const empresa = this.auth.getEmpresa();

    if (!empresa) {
      throw new Error(
        'No se encontró el número de empresa. Configura AVEONLINE_EMPRESA o vuelve a autenticar.',
      );
    }

    const { statusCode, data } = await this.client.request(
      '/avestock/api/fetchProveedoresDrops.php',
      'POST',
      { tipo: 'authave', empresa },
      token,
    );

    const parsed = this.safeParse(data);

    if (statusCode !== 200 || parsed?.status !== 'ok') {
      throw new Error(
        `Listar proveedores falló (${statusCode}): ${this.truncate(data)}`,
      );
    }

    const items: any[] =
      parsed?.items ?? parsed?.proveedores ?? parsed?.data ?? [];

    return Array.isArray(items) ? items : [];
  }

  private safeParse(data: string): any {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  private truncate(data: string, max = 400): string {
    return data.length > max ? `${data.substring(0, max)}...` : data;
  }
}
