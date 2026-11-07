import { Injectable, Logger } from '@nestjs/common';
import { GoogleAuth, JWTInput } from 'google-auth-library';

/**
 * Tiempo máximo de una petición HTTP a FCM. Debe ser bastante menor que
 * `LOCK_TTL_MS` del worker para que una instancia activa pueda renovar su
 * lease antes de que expire.
 */
export const FCM_REQUEST_TIMEOUT_MS = 20_000;

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
  'SENDER_ID_MISMATCH',
  'MISMATCH_SENDER_ID',
  'INVALID_RECIPIENT',
  'THIRD_PARTY_AUTH_ERROR',
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
  'UNSPECIFIED_ERROR',
  'RESOURCE_EXHAUSTED',
  'ABORTED',
  'DEADLINE_EXCEEDED',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Convierte un código de error JSON a string solo si es un escalar válido. */
function stringifyCode(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

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
 * `error.code` (código HTTP/gRPC) como respaldo.
 */
function extractFirebaseErrorCode(body: string): {
  fcmErrorCode?: string;
  httpCode?: string;
} {
  try {
    const parsed: unknown = JSON.parse(body);
    if (!isRecord(parsed)) return {};

    const error = parsed.error;
    if (isRecord(error)) {
      // 1. Buscar en details[].errorCode (estructura real de FCM HTTP v1)
      const details = error.details;
      if (Array.isArray(details)) {
        for (const detail of details) {
          const fcmErrorCode = isRecord(detail)
            ? stringifyCode(detail.errorCode)
            : undefined;
          if (fcmErrorCode) {
            return {
              fcmErrorCode,
              httpCode: stringifyCode(error.code),
            };
          }
        }
      }
      // 2. Respaldo: error.code como string
      const httpCode = stringifyCode(error.code);
      if (httpCode) {
        return { httpCode };
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
function isInvalidTokenError(
  fcmErrorCode?: string,
  httpCode?: string,
): boolean {
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
 * Determina si un error es temporal (reintentable) basado en el código FCM y
 * en el status HTTP real de la respuesta.
 *
 * Importante: un 4xx desconocido no se reintenta indefinidamente. Solo se
 * reintentan 408, 425, 429, 5xx y los códigos FCM listados como temporales.
 */
function isRetryableError(fcmErrorCode?: string, httpStatus?: string): boolean {
  if (fcmErrorCode) {
    const c = fcmErrorCode.toUpperCase();
    if (TEMPORARY_FCM_ERROR_CODES.has(c)) return true;
    if (TOKEN_INVALID_FCM_ERROR_CODES.has(c)) return false;
    if (PERMANENT_FCM_ERROR_CODES.has(c)) return false;
  }

  if (httpStatus) {
    const n = parseInt(httpStatus, 10);
    if (!isNaN(n)) {
      if (n === 408 || n === 425 || n === 429 || n >= 500) return true;
      if (n >= 400 && n < 500) return false;
    }
  }

  // Código FCM desconocido sin status HTTP reconocible: no se reintenta
  // indefinidamente con el mismo contenido.
  return false;
}

/**
 * Convierte el valor del header Retry-After a segundos.
 *
 * Soporta las dos formas del RFC 9110:
 * - delta-seconds: `Retry-After: 120`
 * - HTTP-date: `Retry-After: Wed, 21 Oct 2015 07:28:00 GMT`
 */
export function parseRetryAfterHeader(
  value: string | null | undefined,
  nowMs: number = Date.now(),
): number | undefined {
  if (!value) return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  // delta-seconds (solo dígitos; evita que "120abc" se acepte a medias).
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) && seconds > 0
      ? Math.ceil(seconds)
      : undefined;
  }

  // HTTP-date. Date.parse acepta el formato IMF-fixdate de RFC 9110.
  const timestamp = Date.parse(trimmed);
  if (!Number.isNaN(timestamp)) {
    const seconds = Math.ceil((timestamp - nowMs) / 1000);
    return seconds > 0 ? seconds : undefined;
  }

  return undefined;
}

/**
 * Extrae el valor del header Retry-After de la respuesta de Firebase.
 * Acepta tanto `Headers` como objetos con `get()` (mocks y adaptadores).
 */
export function extractRetryAfter(
  headers: { get?: (name: string) => string | null } | undefined,
  nowMs: number = Date.now(),
): number | undefined {
  try {
    const retryAfter = headers?.get?.('Retry-After');
    return parseRetryAfterHeader(retryAfter, nowMs);
  } catch {
    // Ignorar errores de parseo o headers no disponibles.
    return undefined;
  }
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
      const parsed: unknown = JSON.parse(raw);
      if (
        !isRecord(parsed) ||
        typeof parsed.project_id !== 'string' ||
        parsed.project_id.length === 0
      ) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON no contiene project_id');
      }

      const serviceAccount = parsed as JWTInput;
      this.projectId = parsed.project_id;
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
        // Un despliegue puede arrancar antes de que la variable esté bien
        // configurada; se permite reintentar en vez de enterrar el evento.
        retryable: true,
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

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      FCM_REQUEST_TIMEOUT_MS,
    );

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
          signal: controller.signal,
        },
      );

      const responseBody = await response.text();

      // Extraer información de error desde la respuesta HTTP v1 de Firebase.
      const errorInfo = extractFirebaseErrorCode(responseBody);
      const retryAfter = extractRetryAfter(response.headers);

      const firebaseErrorCode = errorInfo.fcmErrorCode || errorInfo.httpCode;
      const invalidToken = isInvalidTokenError(
        errorInfo.fcmErrorCode,
        errorInfo.httpCode,
      );
      // Clasificar con el status HTTP real: un cuerpo no-JSON en un 500
      // también es un error temporal.
      const retryable = isRetryableError(
        errorInfo.fcmErrorCode,
        String(response.status),
      );

      if (!response.ok) {
        if (invalidToken) {
          this.logger.warn(
            `Token FCM UNREGISTERED (${response.status}): ${responseBody}`,
          );
        } else if (retryable) {
          this.logger.warn(
            `Error FCM temporal ${response.status}: ${responseBody}`,
          );
        } else {
          this.logger.warn(
            `Error FCM permanente ${response.status} (no se elimina el token): ${responseBody}`,
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

      this.logger.log(
        `Notificación FCM enviada a ${token.substring(0, 12)}...`,
      );
      return { success: true, invalidToken: false, retryable: false };
    } catch (err) {
      const message = (err as Error).message;
      const timedOut =
        (err as Error).name === 'AbortError' ||
        message.toLowerCase().includes('aborted');

      this.logger.error(
        timedOut
          ? `Timeout de ${FCM_REQUEST_TIMEOUT_MS}ms enviando notificación FCM`
          : `Error enviando notificación FCM: ${message}`,
      );

      return {
        success: false,
        invalidToken: false,
        // Errores de red y timeouts son temporales.
        retryable: true,
        error: timedOut
          ? `Timeout de FCM (${FCM_REQUEST_TIMEOUT_MS}ms)`
          : message,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
