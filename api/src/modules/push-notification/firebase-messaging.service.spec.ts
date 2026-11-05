import { FirebaseMessagingService } from './firebase-messaging.service';
import type { FcmSendResult } from './firebase-messaging.service';
import { GoogleAuth } from 'google-auth-library';

jest.mock('google-auth-library', () => ({
  GoogleAuth: jest.fn().mockImplementation(() => ({
    getAccessToken: jest.fn().mockResolvedValue('mock-access-token'),
  })),
}));

describe('FirebaseMessagingService', () => {
  let service: FirebaseMessagingService;

  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as any).fetch = fetchMock;
  });

  afterEach(() => {
    delete (globalThis as any).fetch;
  });

  describe('sin configuración de Firebase', () => {
    beforeEach(() => {
      delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      service = new FirebaseMessagingService();
    });

    it('no está configurado', () => {
      expect(service.isConfigured).toBe(false);
    });

    it('sendToToken devuelve fallo sin lanzar excepción', async () => {
      const result: FcmSendResult = await service.sendToToken(
        'token-123',
        'Título',
        'Cuerpo',
      );

      expect(result.success).toBe(false);
      expect(result.invalidToken).toBe(false);
      expect(result.error).toContain('Firebase no configurado');
    });
  });

  describe('con configuración de Firebase', () => {
    const serviceAccount = {
      type: 'service_account',
      project_id: 'kronio-market',
      private_key: '-----BEGIN PRIVATE KEY-----\nMOCK\n-----END PRIVATE KEY-----\n',
      client_email: 'firebase-adminsdk-mock@kronio-market.iam.gserviceaccount.com',
    };

    beforeEach(() => {
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify(serviceAccount);
      fetchMock.mockResolvedValue({
        status: 200,
        ok: true,
        text: jest.fn().mockResolvedValue('{ "name": "projects/.../messages/123" }'),
      });

      service = new FirebaseMessagingService();
    });

    afterEach(() => {
      delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    });

    it('está configurado', () => {
      expect(service.isConfigured).toBe(true);
    });

    it('envía notificación y devuelve éxito', async () => {
      const result = await service.sendToToken(
        'fcm-token-123',
        'Nuevo pedido',
        'Has recibido un nuevo pedido #42.',
        { type: 'ORDER_CREATED', orderId: 'ord-1', numericId: 42 },
      );

      expect(result.success).toBe(true);
      expect(result.invalidToken).toBe(false);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://fcm.googleapis.com/v1/projects/kronio-market/messages:send',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-access-token',
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('envía todos los valores de data como strings (numericId convertido)', async () => {
      await service.sendToToken(
        'fcm-token-123',
        'Título',
        'Cuerpo',
        { numericId: 42, orderId: 'ord-1', active: true },
      );

      const callArgs = fetchMock.mock.calls[0][1] as RequestInit;
      const body = JSON.parse(callArgs.body as string);
      const data = body.message.data;

      // Todos los valores deben ser strings
      expect(typeof data.numericId).toBe('string');
      expect(data.numericId).toBe('42');
      expect(typeof data.orderId).toBe('string');
      expect(data.orderId).toBe('ord-1');
      expect(typeof data.active).toBe('string');
      expect(data.active).toBe('true');
    });

    it('marca token como inválido solo cuando Firebase responde UNREGISTERED (404)', async () => {
      fetchMock.mockResolvedValue({
        status: 404,
        ok: false,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            error: {
              code: 'UNREGISTERED',
              message: 'Registration token not registered',
            },
          }),
        ),
      });

      const result = await service.sendToToken('invalid-token', 'Título', 'Cuerpo');

      expect(result.success).toBe(false);
      expect(result.invalidToken).toBe(true);
      expect(result.firebaseErrorCode).toBe('UNREGISTERED');
    });

    it('NO marca token como inválido cuando Firebase responde error 400 genérico (no UNREGISTERED)', async () => {
      fetchMock.mockResolvedValue({
        status: 400,
        ok: false,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            error: {
              code: 'INVALID_ARGUMENT',
              message: 'Invalid payload',
            },
          }),
        ),
      });

      const result = await service.sendToToken('token-123', 'Título', 'Cuerpo');

      expect(result.success).toBe(false);
      expect(result.invalidToken).toBe(false);
      expect(result.firebaseErrorCode).toBe('INVALID_ARGUMENT');
    });

    it('NO marca token como inválido cuando Firebase responde error 500', async () => {
      fetchMock.mockResolvedValue({
        status: 500,
        ok: false,
        text: jest.fn().mockResolvedValue('Internal error'),
      });

      const result = await service.sendToToken('token-123', 'Título', 'Cuerpo');

      expect(result.success).toBe(false);
      expect(result.invalidToken).toBe(false);
      expect(result.firebaseErrorCode).toBeUndefined();
    });

    it('maneja errores de red sin lanzar excepción', async () => {
      fetchMock.mockRejectedValue(new Error('Network error'));

      const result = await service.sendToToken('token-123', 'Título', 'Cuerpo');

      expect(result.success).toBe(false);
      expect(result.invalidToken).toBe(false);
      expect(result.error).toContain('Network error');
    });

    it('marca token como inválido con respuesta FCM HTTP v1 realista (details[].errorCode = UNREGISTERED)', async () => {
      fetchMock.mockResolvedValue({
        status: 404,
        ok: false,
        headers: new Map([['Retry-After', null]]),
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            error: {
              code: 404,
              status: 'NOT_FOUND',
              message: 'Requested entity was not found.',
              details: [
                {
                  '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError',
                  errorCode: 'UNREGISTERED',
                },
              ],
            },
          }),
        ),
      });

      const result = await service.sendToToken('invalid-token', 'Título', 'Cuerpo');

      expect(result.success).toBe(false);
      expect(result.invalidToken).toBe(true);
      expect(result.fcmErrorCode).toBe('UNREGISTERED');
      expect(result.firebaseErrorCode).toBe('UNREGISTERED');
    });

    it('NO marca token como inválido cuando FCM HTTP v1 devuelve errorCode diferente a UNREGISTERED', async () => {
      fetchMock.mockResolvedValue({
        status: 400,
        ok: false,
        headers: new Map([['Retry-After', null]]),
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            error: {
              code: 400,
              status: 'INVALID_ARGUMENT',
              message: 'Invalid payload',
              details: [
                {
                  '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError',
                  errorCode: 'INVALID_ARGUMENT',
                },
              ],
            },
          }),
        ),
      });

      const result = await service.sendToToken('token-123', 'Título', 'Cuerpo');

      expect(result.success).toBe(false);
      expect(result.invalidToken).toBe(false);
      expect(result.fcmErrorCode).toBe('INVALID_ARGUMENT');
      expect(result.firebaseErrorCode).toBe('INVALID_ARGUMENT');
    });

    it('extrae Retry-After header para errores temporales', async () => {
      const headers = new Map([['Retry-After', '60']]);
      fetchMock.mockResolvedValue({
        status: 503,
        ok: false,
        headers: {
          get: (name: string) => headers.get(name) ?? null,
        },
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            error: {
              code: 503,
              status: 'UNAVAILABLE',
              message: 'Service unavailable',
            },
          }),
        ),
      });

      const result = await service.sendToToken('token-123', 'Título', 'Cuerpo');

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(true);
      expect(result.retryAfterSeconds).toBe(60);
    });
  });
});
