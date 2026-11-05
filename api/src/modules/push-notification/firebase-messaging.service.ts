import { Injectable, Logger } from '@nestjs/common';
import { GoogleAuth } from 'google-auth-library';

/**
 * Resultado del envío de una notificación FCM.
 */
export type FcmSendResult = {
  success: boolean;
  /** true solo cuando Firebase confirma que el token es UNREGISTERED */
  invalidToken: boolean;
  error?: string;
  /** Código de error de Firebase (ej. "UNREGISTERED", "INTERNAL", ...) */
  firebaseErrorCode?: string;
};

/**
 * Extrae el código de error de Firebase desde el cuerpo de respuesta.
 * Solo UNREGISTERED (y variantes relacionadas con el token) indica que el
 * dispositivo ya no es válido y debe eliminarse. Otros errores 400 (parámetros
 * inválidos, cuota excedida, etc.) no significan que el token sea inválido.
 */
function extractFirebaseErrorCode(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body);
    const error = parsed?.error;
    if (error && typeof error === 'object') {
      return error.code as string;
    }
    if (typeof error === 'string') {
      return error;
    }
  } catch {
    // Cuerpo no es JSON: no se puede extraer código de error.
  }
  return undefined;
}

/**
 * Determina si un código de error de Firebase indica que el token es inválido.
 * Solo se eliminan dispositivos cuando Firebase responde explícitamente que el
 * token está UNREGISTERED (o variantes similares). Otros errores 400/500 no
 * provocan eliminación del token.
 */
function isInvalidTokenError(code?: string): boolean {
  if (!code) return false;
  const c = code.toUpperCase();
  return c === 'UNREGISTERED' || c === 'UNREGISTERED_TOKEN';
}

/**
 * Envía notificaciones mediante Firebase Cloud Messaging HTTP v1 API.
 *
 * Las credenciales privadas se leen de la variable de entorno
 * `FIREBASE_SERVICE_ACCOUNT_JSON` (JSON del service account). Nunca se guardan
 * en el repositorio ni se envían al cliente.
 *
 * Si Firebase no está configurado, todas las operaciones devuelven
 * `success: false` sin lanzar excepción: una caída de Firebase nunca debe
 * interrumpir el checkout, una actualización de estado o una cancelación.
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
          'no se enviarán. Configura la variable para activarlas.',
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
        `FIREBASE_SERVICE_ACCOUNT_JSON inválido: ${(err as Error).message}`,
      );
    }
  }

  /** true si Firebase está configurado y listo para enviar. */
  get isConfigured(): boolean {
    return this.configured;
  }

  /**
   * Envía una notificación a un token FCM concreto.
   *
   * Todos los valores de `data` se envían como strings (FCM los requiere así).
   *
   * @returns `{ success, invalidToken, error?, firebaseErrorCode? }`.
   * `invalidToken: true` solo cuando Firebase responde UNREGISTERED.
   */
  async sendToToken(
    token: string,
    title: string,
    body: string,
    data?: Record<string, string | number | boolean | null>,
  ): Promise<FcmSendResult> {
    if (!this.configured || !this.googleAuth || !this.projectId) {
      return {
        success: false,
        invalidToken: false,
        error: 'Firebase no configurado',
      };
    }

    // Normalizar todos los valores de data a string (FCM los requiere así).
    const stringData: Record<string, string> = {};
    if (data) {
      for (const [key, value] of Object.entries(data)) {
        stringData[key] = value == null ? '' : String(value);
      }
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
          data: stringData,
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
        const firebaseErrorCode = extractFirebaseErrorCode(responseBody);
        const invalidToken = isInvalidTokenError(firebaseErrorCode);

        if (invalidToken) {
          this.logger.warn(
            `Token FCM UNREGISTERED (${response.status}): ${responseBody}`,
          );
        } else {
          this.logger.warn(
            `Token FCM error ${response.status} (no es UNREGISTERED, no se elimina): ${responseBody}`,
          );
        }
        return {
          success: false,
          invalidToken,
          error: responseBody,
          firebaseErrorCode,
        };
      }

      if (!response.ok) {
        this.logger.error(
          `Error FCM ${response.status}: ${responseBody}`,
        );
        return {
          success: false,
          invalidToken: false,
          error: responseBody,
        };
      }

      this.logger.log(
        `Notificación FCM enviada a ${token.substring(0, 12)}...`,
      );
      return { success: true, invalidToken: false };
    } catch (err) {
      this.logger.error(
        `Error enviando notificación FCM: ${(err as Error).message}`,
      );
      return {
        success: false,
        invalidToken: false,
        error: (err as Error).message,
      };
    }
  }
}
