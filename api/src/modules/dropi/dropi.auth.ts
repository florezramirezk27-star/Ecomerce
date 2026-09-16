import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import https from 'https';
import { DropiClient } from './dropi.client';
import { totp } from './totp';
import { DropiHttpResponse } from './dropi.types';

const BFF_HOST = 'api-v2.dropi.co';

interface BffAuthData {
  isSuccess?: boolean;
  message?: string;
  token?: string;
}

interface BffAuthResponse {
  is_succesfull?: boolean;
  status_code?: number;
  status_reason?: string;
  data?: BffAuthData;
}

@Injectable()
export class DropiAuthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DropiAuthService.name);
  private activeToken = '';
  private email: string;
  private password: string;
  private apiToken: string;
  private whiteBrandId: number;
  private twoFactorSecret: string;
  private isLoggingIn = false;
  private reloginInterval: NodeJS.Timeout | null = null;
  private apiTokenFailed = false;

  constructor(
    private readonly client: DropiClient,
    private readonly configService: ConfigService,
  ) {
    this.apiToken = this.configService.get<string>('DROPI_API_TOKEN') ?? '';
    this.email = this.configService.get<string>('DROPI_EMAIL') ?? '';
    this.password = this.configService.get<string>('DROPI_PASSWORD') ?? '';
    this.whiteBrandId =
      Number(this.configService.get<string>('DROPI_WHITE_BRAND_ID') ?? 1) || 1;
    this.twoFactorSecret =
      this.configService.get<string>('DROPI_2FA_SECRET')?.trim() ?? '';
  }

  async onModuleInit() {
    if (this.apiToken) {
      this.activeToken = this.apiToken;
      this.logger.log('Dropi autenticado con API token del panel');
      return;
    }
    await this.login();
    this.startAutoRelogin();
  }

  onModuleDestroy() {
    this.stopAutoRelogin();
  }

  private startAutoRelogin() {
    const interval = 45 * 60 * 1000;
    this.reloginInterval = setInterval(() => {
      if (!this.activeToken) {
        this.logger.log('Auto-relogin triggered: token missing');
        void this.reloginOnInterval();
      }
    }, interval);
  }

  private async reloginOnInterval() {
    try {
      await this.login();
    } catch (error) {
      this.logger.error(
        `Auto-relogin error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private stopAutoRelogin() {
    if (this.reloginInterval) {
      clearInterval(this.reloginInterval);
      this.reloginInterval = null;
    }
  }

  private async getIpAddress(): Promise<string> {
    try {
      return await new Promise<string>((resolve) => {
        const req = https.get(
          {
            hostname: 'api.ipify.org',
            path: '/?format=json',
            timeout: 5000,
          },
          (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
              try {
                const parsed = JSON.parse(data) as { ip?: string };
                resolve(parsed.ip ?? '');
              } catch {
                resolve('');
              }
            });
          },
        );
        req.on('timeout', () => {
          req.destroy();
          resolve('');
        });
        req.on('error', () => resolve(''));
      });
    } catch {
      return '';
    }
  }

  private async requestBffLogin(
    body: Record<string, unknown>,
  ): Promise<DropiHttpResponse> {
    return this.client.request(
      '/bff/auth/core/login',
      'POST',
      body,
      undefined,
      BFF_HOST,
    );
  }

  async login(): Promise<void> {
    if (this.isLoggingIn) return;
    this.isLoggingIn = true;

    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        const ipAddress = await this.getIpAddress();
        const body: Record<string, unknown> = {
          email: this.email,
          password: this.password,
          white_brand_id: this.whiteBrandId,
          ipAddress,
        };

        const { statusCode, data } = await this.requestBffLogin(body);
        if (statusCode !== 200) {
          throw new Error(`Login failed with status ${statusCode}: ${data}`);
        }

        let parsed: BffAuthResponse = JSON.parse(data) as BffAuthResponse;
        const reason = parsed.status_reason ?? parsed.data?.message ?? '';

        if (reason === '2fa') {
          if (!this.twoFactorSecret) {
            throw new Error('2FA requerida: agrega DROPI_2FA_SECRET al .env');
          }

          const code = totp(this.twoFactorSecret);
          this.logger.log('2FA detectada: generando código TOTP');

          const second = await this.requestBffLogin({
            ...body,
            otp: code,
            with_cdc: false,
          });
          if (second.statusCode !== 200) {
            throw new Error(
              `2FA login failed with status ${second.statusCode}: ${second.data}`,
            );
          }
          parsed = JSON.parse(second.data) as BffAuthResponse;
        }

        if (!parsed?.data?.token) {
          throw new Error(
            `Login rejected: ${parsed?.data?.message || parsed?.status_reason || 'no token'}`,
          );
        }

        this.activeToken = parsed.data.token;
        this.logger.log('Dropi login successful, token acquired');
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        retryCount++;
        this.logger.error(
          `Dropi login attempt ${retryCount} failed: ${message}`,
        );

        if (retryCount < maxRetries) {
          const delay = Math.pow(2, retryCount) * 1000;
          this.logger.log(`Retrying login in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          this.logger.error('Dropi login failed after all retries');
          this.activeToken = '';
        }
      } finally {
        this.isLoggingIn = false;
      }
    }
  }

  async getToken(): Promise<string> {
    if (this.activeToken) return this.activeToken;
    if (this.apiToken && !this.apiTokenFailed) return this.apiToken;
    await this.login();
    return this.activeToken;
  }

  invalidateToken() {
    if (this.apiToken) {
      this.apiTokenFailed = true;
      this.logger.warn(
        'Dropi: API token del panel rechazado — se usará login BFF (email/contraseña + 2FA) para renovar',
      );
    }
    this.activeToken = '';
  }

  getStatus(): { connected: boolean; email: string } {
    return {
      connected:
        !!this.activeToken || (!!this.apiToken && !this.apiTokenFailed),
      email: this.email,
    };
  }

  getOfficialToken(): string | null {
    return this.apiToken && this.apiToken.length > 0 ? this.apiToken : null;
  }
}
