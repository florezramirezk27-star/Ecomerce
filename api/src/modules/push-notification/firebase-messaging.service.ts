import { Injectable, Logger } from '@nestjs/common';
import { GoogleAuth } from 'google-auth-library';

/**
 * Resultado del envío de una notificación FCM.
 */
export type FcmSendResult = {
  success: boolean;
  /** true solo cuando Firebase confirma que el token es UNREGISTERED */
  invalidToken: boolean;
  /** true si el error es temporal y se debe reintentar */
  retryable: boolean;
  /** Segundos de espera indicados por Firebase (header Retry-After), si lo hay */
  retryAfterSeconds?: number;
  error?: string;
  /** Código de error de Firebase (ej. "UNREGISTERED", "INTERNAL", ...) */
  firebaseErrorCode?: string;
  /** Código de error FCM específico desde details[].errorCode (respuesta HTTP v1) */
  fcmErrorCode?: string;
};

/**
 * Códigos de error FCM que indican que el token es inválido y debe eliminarse.
 * Solo UNREGISTERED (y variantes) significan que el dispositivo ya no existe.
 */
const TOKEN_INVALID_FCM_ERROR_CODES = new Set([
  'UNREGISTERED',
  'UNREGISTERED_TOKEN',
]);

/**
 * Códigos de error FCM permanentes: no se debe reintentar con el mismo payload,
 * pero no significan que el token sea inválido (no se elimina).
 */
const PERMANENT_FCM_ERROR_CODES = new Set([
  'INVALID_ARGUMENT',
  'PERMISSION_DENIED',
]);

/**
 * Códigos de error FCM temporales: se debe reintentar con backoff.
 */
const TEMPORARY_FCM_ERROR_CODES = new Set([
  'INTERNAL',
  'UNAVAILABLE',
  'QUOTA_EXCEEDED',
  'DEVICE_MESSAGE_RATE_EXCEEDED',
  'TOPICS_MESSAGE_RATE_EXCEEDED',
]);

/**
 * Extrae el código de error de Firebase desde el cuerpo de respuesta HTTP v1.
 *
 * La respuesta real de FCM HTTP v1 tiene esta estructura:
 * ```json
 * {
 *   "error": {
 *     "code": 404,
 *     "status": "NOT_FOUND",
 *     "message": "Requested entity was not found.",
 *     "details": [
 *       {
 *         "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError",
 *         "errorCode": "UNREGISTERED"
 *       }
 *     ]
 *   }
 * }
 * ```
 *
 * Busca `error.details[].errorCode` (código FCM específico) y cae a
 * `error.code` (código HTTP) como respaldo.
 */
function extractFirebaseErrorCode(body: string): { fcmErrorCode?: string; httpCode?: string } {
  try {
    const parsed = JSON.parse(body);
    const error = parsed?.error;
    if (error && typeof error === 'object') {
      // 1. Buscar en details[].errorCode (estructura real de FCM HTTP v1)
      const details = error.details;
      if (Array.isArray(details)) {
        for (const detail of details) {
          if (detail && typeof detail === 'object' && detail.errorCode) {
            return { fcmErrorCode: String(detail.errorCode), httpCode: String(error.code) };
          }
        }
      }
      // 2. Respaldo: error.code como string
      if (error.code) {
        return { httpCode: String(error.code) };
      }
    }
    if (typeof error === 'string') {
      return { httpCode: error };
    }
  } catch {
    // Cuerpo no es JSON: no se puede extraer código de error.
  }
  return {};
}

/**
 * Determina si un código de error de Firebase indica que el token es inválido.
 * Solo se eliminan dispositivos cuando Firebase responde explícitamente que el
 * token está UNREGISTERED (o variantes similares). Otros errores 400/500 no
 * provocan eliminación del token.
 */
function isInvalidTokenError(fcmErrorCode?: string, httpCode?: string): boolean {
  if (fcmErrorCode) {
    const c = fcmErrorCode.toUpperCase();
    if (TOKEN_INVALID_FCM_ERROR_CODES.has(c)) return true;
  }
  if (httpCode) {
    const c = httpCode.toUpperCase();
    if (c === 'UNREGISTERED' || c === 'UNREGISTERED_TOKEN') return true;
  }
  return false;
}

/**
 * Determina si un error es temporal (reintentable) basado en el código FCM.
 */
function isRetryableError(fcmErrorCode?: string, httpCode?: string): boolean {
  if (fcmErrorCode) {
    const c = fcmErrorCode.toUpperCase();
    if (TEMPORARY_FCM_ERROR_CODES.has(c)) return true;
    // Si es un código FCM conocido y no es permanente, es temporal
    if (PERMANENT_FCM_ERROR_CODES.has(c)) return false;
  }
  // Códigos HTTP 5xx y 429 son temporales
  if (httpCode) {
    const n = parseInt(httpCode, 10);
    if (!isNaN(n)) {
      if (n >= 500 || n === 429) return true;
    }
  }
  return false;
}

/**
 * Extrae el valor del header Retry-After de la respuesta de Firebase.
 */
function extractRetryAfter(headers: { get?: (name: string) => string | null }): number | undefined {
  try {
    const retryAfter = headers.get?.('Retry-After');
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10);
      if (!isNaN(seconds) && seconds > 0) {
        return seconds;
      }
    }
  } catch {
    // Ignorar errores de parseo
  }
  return undefined;
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
   * @returns `{ success, invalidToken, retryable, retryAfterSeconds?, error?, firebaseErrorCode?, fcmErrorCode? }`.
   * `invalidToken: true` solo cuando Firebase responde UNREGISTERED.
   * `retryable: true` cuando el error es temporal y se debe reintentar.
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
        retryable: false,
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

      // Extraer información de error desde la respuesta HTTP v1 de Firebase.
      const errorInfo = extractFirebaseErrorCode(responseBody);
      const retryAfter = extractRetryAfter(response.headers as unknown as { get?: (name: string) => string | null });

      const firebaseErrorCode = errorInfo.fcmErrorCode || errorInfo.httpCode;
      const invalidToken = isInvalidTokenError(errorInfo.fcmErrorCode, errorInfo.httpCode);
      const retryable = isRetryableError(errorInfo.fcmErrorCode, errorInfo.httpCode);

      if (response.status === 404 || response.status === 400) {
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
          retryable,
          retryAfterSeconds: retryAfter,
          error: responseBody,
          firebaseErrorCode,
          fcmErrorCode: errorInfo.fcmErrorCode,
        };
      }

      if (!response.ok) {
        this.logger.error(
          `Error FCM ${response.status}: ${responseBody}`,
        );
        return {
          success: false,
          invalidToken: false,
          retryable,
          retryAfterSeconds: retryAfter,
          error: responseBody,
          firebaseErrorCode,
          fcmErrorCode: errorInfo.fcmErrorCode,
        };
      }

      this.logger.log(
        `Notificación FCM enviada a ${token.substring(0, 12)}...`,
      );
      return { success: true, invalidToken: false, retryable: false };
    } catch (err) {
      this.logger.error(
        `Error enviando notificación FCM: ${(err as Error).message}`,
      );
      return {
        success: false,
        invalidToken: false,
        retryable: true, // Errores de red son temporales
        error: (err as Error).message,
      };
    }
  }
}
