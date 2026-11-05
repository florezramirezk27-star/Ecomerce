import { Injectable, Logger } from '@nestjs/common';
import { GoogleAuth } from 'google-auth-library';

type PushResult = 'sent' | 'unregistered' | 'disabled';

interface FirebaseServiceAccount {
  project_id?: string;
  client_email?: string;
  private_key?: string;
}

@Injectable()
export class FcmPushService {
  private readonly logger = new Logger(FcmPushService.name);
  private auth?: GoogleAuth;
  private projectId?: string;
  private warnedDisabled = false;

  private getClient(): { auth: GoogleAuth; projectId: string } | null {
    if (this.auth && this.projectId) {
      return { auth: this.auth, projectId: this.projectId };
    }

    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) return null;

    let account: FirebaseServiceAccount;
    try {
      account = JSON.parse(raw) as FirebaseServiceAccount;
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON no contiene JSON válido');
    }

    const projectId = account.project_id?.trim();
    const clientEmail = account.client_email?.trim();
    const privateKey = account.private_key?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error(
        'La cuenta de servicio de Firebase debe incluir project_id, client_email y private_key',
      );
    }

    this.projectId = projectId;
    this.auth = new GoogleAuth({
      credentials: {
        type: 'service_account',
        project_id: projectId,
        client_email: clientEmail,
        private_key: privateKey,
      },
      scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
    });

    return { auth: this.auth, projectId };
  }

  isConfigured(): boolean {
    return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }

  async sendToDevice(input: {
    token: string;
    title: string;
    body: string;
    data: Record<string, string>;
  }): Promise<PushResult> {
    const client = this.getClient();
    if (!client) {
      if (!this.warnedDisabled) {
        this.warnedDisabled = true;
        this.logger.warn(
          'Push FCM desactivado: configura FIREBASE_SERVICE_ACCOUNT_JSON para enviar notificaciones al celular',
        );
      }
      return 'disabled';
    }

    const googleClient = await client.auth.getClient();
    const tokenResult = await googleClient.getAccessToken();
    const accessToken =
      typeof tokenResult === 'string' ? tokenResult : tokenResult.token;

    if (!accessToken) {
      throw new Error('Google Auth no devolvió un access token para FCM');
    }

    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${client.projectId}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token: input.token,
            notification: {
              title: input.title,
              body: input.body,
            },
            data: input.data,
            android: {
              priority: 'HIGH',
              notification: {
                channel_id: 'kronio_orders',
                sound: 'default',
              },
            },
            apns: {
              payload: {
                aps: { sound: 'default' },
              },
            },
          },
        }),
      },
    );

    if (response.ok) return 'sent';

    const errorBody = await response.text();
    if (
      response.status === 404 ||
      errorBody.includes('UNREGISTERED') ||
      errorBody.includes('registration-token-not-registered')
    ) {
      return 'unregistered';
    }

    // No se incluye token, credenciales ni el cuerpo completo en el log.
    throw new Error(
      `FCM respondió HTTP ${response.status}: ${errorBody.slice(0, 400)}`,
    );
  }
}
