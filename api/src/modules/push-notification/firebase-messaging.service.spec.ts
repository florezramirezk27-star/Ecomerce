import { FirebaseMessagingService } from './firebase-messaging.service';
import type { FcmSendResult } from './firebase-messaging.service';
import { GoogleAuth } from 'google-auth-library';

// Mock de GoogleAuth para evitar errores de clave privada real en tests
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

  describe('sin configuracion de Firebase', () => {
    beforeEach(() => {
      delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      service = new FirebaseMessagingService();
    });

    it('no esta configurado', () => {
      expect(service.isConfigured).toBe(false);
    });

    it('sendToToken devuelve fallo sin lanzar excepcion', async () => {
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

  describe('con configuracion de Firebase', () => {
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

    it('esta configurado', () => {
      expect(service.isConfigured).toBe(true);
    });

    it('envia notificacion y devuelve exito', async () => {
      const result = await service.sendToToken(
        'fcm-token-123',
        'Nuevo pedido',
        'Has recibido un nuevo pedido #42.',
        { type: 'ORDER_CREATED', orderId: 'ord-1', numericId: '42' },
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

    it('marca token invalido cuando Firebase responde 404', async () => {
      fetchMock.mockResolvedValue({
        status: 404,
        ok: false,
        text: jest.fn().mockResolvedValue('{ "error": { code: 404, message: "Registration token not registered" } }'),
      });

      const result = await service.sendToToken('invalid-token', 'Título', 'Cuerpo');

      expect(result.success).toBe(false);
      expect(result.invalidToken).toBe(true);
    });

    it('maneja errores de red sin lanzar excepcion', async () => {
      fetchMock.mockRejectedValue(new Error('Network error'));

      const result = await service.sendToToken('token-123', 'Título', 'Cuerpo');

      expect(result.success).toBe(false);
      expect(result.invalidToken).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });
});
