import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AveonlineClient } from './aveonline.client';

@Injectable()
export class AveonlineAuthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AveonlineAuthService.name);
  private activeToken = '';
  private email: string;
  private password: string;
  private empresa: string;
  private isLoggingIn = false;
  private reloginTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly client: AveonlineClient,
    private readonly configService: ConfigService,
  ) {
    this.email = this.configService.get<string>('AVEONLINE_USER') ?? '';
    this.password = this.configService.get<string>('AVEONLINE_PASS') ?? '';
    this.empresa = this.configService.get<string>('AVEONLINE_EMPRESA') ?? '';
  }

  async onModuleInit() {
    if (!this.email || !this.password) {
      this.logger.warn(
        'Aveonline no usado: AVEONLINE_USER/AVEONLINE_PASS vacíos, login automático omitido',
      );
      return;
    }
    await this.login();
  }

  onModuleDestroy() {
    this.stopAutoRelogin();
  }

  async login(): Promise<void> {
    if (!this.email || !this.password) {
      this.logger.warn(
        'Aveonline sin credenciales configuradas; login omitido',
      );
      return;
    }
    if (this.isLoggingIn) return;
    this.isLoggingIn = true;

    try {
      const { statusCode, data } = await this.client.request(
        '/api/auth/v3.0/index.php',
        'POST',
        {
          tipo: 'AuthProduct',
          user: this.email,
          password: this.password,
          tokenTime: 24,
        },
      );

      if (statusCode !== 200) {
        throw new Error(
          `Auth V3 failed with status ${statusCode}: ${this.truncate(data)}`,
        );
      }

      const parsed = JSON.parse(data) as {
        status?: string;
        token?: string;
        data?: {
          token?: string;
          idEnterprise?: number | string;
          empresa?: number | string;
        };
      };

      const token = parsed.data?.token ?? parsed.token ?? null;
      if (parsed.status !== 'ok' || !token) {
        throw new Error(`Auth V3 rejected: ${this.truncate(data)}`);
      }

      this.activeToken = token;

      const idEnterprise =
        parsed.data?.idEnterprise ?? parsed.data?.empresa ?? null;
      if (idEnterprise) {
        this.empresa = String(idEnterprise);
      }

      this.scheduleRefresh(token);
      this.logger.log(
        `Aveonline V3 login successful (empresa: ${this.empresa})`,
      );
    } catch (error: any) {
      this.logger.error(
        `Aveonline V3 login failed: ${error.message ?? JSON.stringify(error)}`,
      );
      this.activeToken = '';
    } finally {
      this.isLoggingIn = false;
    }
  }

  async ensureConnected(): Promise<string> {
    if (!this.activeToken) {
      await this.login();
    }
    if (!this.activeToken) {
      throw new Error(
        'Aveonline no conectado: la cuenta aún no está habilitada para la API V3 (AuthProduct). Activa el módulo API de AveCRM en guias.aveonline.co/panel o solicítalo a Aveonline.',
      );
    }
    return this.activeToken;
  }

  getToken(): string {
    return this.activeToken;
  }

  invalidateToken() {
    this.activeToken = '';
  }

  getEmpresa(): string {
    return this.empresa;
  }

  getStatus(): {
    connected: boolean;
    mode: string;
    user: string;
    empresa: string;
  } {
    return {
      connected: !!this.activeToken,
      mode: 'v3',
      user: this.email,
      empresa: this.empresa,
    };
  }

  private scheduleRefresh(token: string) {
    const expSeconds = this.decodeExp(token);
    const margin = 600;
    let ttlMs: number | null = null;

    if (expSeconds) {
      const ttlSeconds = expSeconds - Date.now() / 1000 - margin;
      if (ttlSeconds > 60) {
        ttlMs = ttlSeconds * 1000;
      }
    }

    this.stopAutoRelogin();

    if (ttlMs) {
      this.reloginTimer = setTimeout(() => {
        this.activeToken = '';
        void this.login();
      }, ttlMs);
    }
  }

  private decodeExp(token: string): number | null {
    try {
      const payload = token.split('.')[1];
      if (!payload) return null;
      const json = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      ) as { exp?: number };
      return typeof json.exp === 'number' ? json.exp : null;
    } catch {
      return null;
    }
  }

  private stopAutoRelogin() {
    if (this.reloginTimer) {
      clearTimeout(this.reloginTimer);
      this.reloginTimer = null;
    }
  }

  private truncate(data: string, max = 400): string {
    return data.length > max ? `${data.substring(0, max)}...` : data;
  }
}
