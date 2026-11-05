import { Injectable, Logger } from '@nestjs/common';
import { GoogleAuth } from 'google-auth-library';

/**
 * Resultado del envio de una notificacion FCM.
 */
export type FcmSendResult = {
  success: boolean;
  /** true cuando Firebase responde que el token es invalido/caducado */
  invalidToken: boolean;
  error?: string;
};

/**
 * Envía notificaciones mediante Firebase Cloud Messaging HTTP v1 API.
 *
 * Las credenciales privadas se leen de la variable de entorno
 * `FIREBASE_SERVICE_ACCOUNT_JSON` (JSON del service account). Nunca se guardan
 * en el repositorio ni se envian al cliente.
 *
 * Si Firebase no esta configurado, todas las operaciones devuelven
 * `success: false` sin lanzar excepcion: una caida de Firebase nunca debe
 * interrumpir el checkout, una actualizacion de estado o una cancelacion.
 */
@Injectable()
export class FirebaseMessagingService {
  private readonly logger = new Logger(FirebaseMessagingService.name);
  private readonly projectId?: string;
  private readonly googleAuth?: GoogleAuth;
  private readonly configured: boolean;

  constructor() {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) {
      this.configured = false;
      this.logger.warn(
        'FIREBASE_SERVICE_ACCOUNT_JSON no configurado: las notificaciones push ' +
          'no se enviaran. Configura la variable para activarlas.',
      );
      return;
    }

    try {
      const serviceAccount = JSON.parse(raw);
      this.projectId = serviceAccount.project_id;
      this.googleAuth = new GoogleAuth({
        credentials: serviceAccount,
        scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
      });
      this.configured = true;
      this.logger.log('Firebase Messaging configurado correctamente');
    } catch (err) {
      this.configured = false;
      this.logger.error(
        `FIREBASE_SERVICE_ACCOUNT_JSON invalido: ${(err as Error).message}`,
      );
    }
  }

  /** true si Firebase esta configurado y listo para enviar. */
  get isConfigured(): boolean {
    return this.configured;
  }

  /**
   * Envía una notificacion a un token FCM concreto.
   *
   * @returns `{ success, invalidToken, error? }`. `invalidToken: true` indica
   * que el token debe eliminarse de la base de datos.
   */
  async sendToToken(
    token: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<FcmSendResult> {
    if (!this.configured || !this.googleAuth || !this.projectId) {
      return { success: false, invalidToken: false, error: 'Firebase no configurado' };
    }

    try {
      const accessToken = await this.googleAuth.getAccessToken();
      const message = {
        message: {
          token,
          notification: {
            title,
            body,
          },
          data: data || {},
          android: {
            priority: 'high',
            notification: {
              sound: 'default',
              channelId: 'kronio_admin',
            },
          },
          apns: {
            payload: {
              aps: {
                sound: 'default',
              },
            },
          },
        },
      };

      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(message),
        },
      );

      const responseBody = await response.text();

      if (response.status === 404 || response.status === 400) {
        // Token invalido o caducado: marcar para eliminarlo.
        this.logger.warn(
          `Token FCM invalido (${response.status}): ${responseBody}`,
        );
        return { success: false, invalidToken: true, error: responseBody };
      }

      if (!response.ok) {
        this.logger.error(
          `Error FCM ${response.status}: ${responseBody}`,
        );
        return { success: false, invalidToken: false, error: responseBody };
      }

      this.logger.log(`Notificacion FCM enviada a ${token.substring(0, 12)}...`);
      return { success: true, invalidToken: false };
    } catch (err) {
      this.logger.error(
        `Error enviando notificacion FCM: ${(err as Error).message}`,
      );
      return { success: false, invalidToken: false, error: (err as Error).message };
    }
  }
}
