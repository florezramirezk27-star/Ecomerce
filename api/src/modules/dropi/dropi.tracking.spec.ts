import { DropiTrackingService } from './dropi.tracking';
import { DropiClient } from './dropi.client';
import { DropiAuthService } from './dropi.auth';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

/**
 * Regresión del bug que dejaba todo el mundo en "Pendiente": Dropi responde en
 * español y ademas el pedido recien creado no tiene guia de envio, de modo que
 * `trackByOrderId` devolvia null y `syncOrderStatus` nunca corria.
 */
describe('DropiTrackingService', () => {
  const prisma = {
    orderTracking: {
      findUnique: jest.fn<Promise<unknown>, unknown[]>(),
      upsert: jest.fn<Promise<unknown>, unknown[]>(),
    },
    order: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const client = { request: jest.fn() };
  const auth = {
    getToken: jest.fn().mockResolvedValue('tok'),
    invalidateToken: jest.fn(),
  };

  let service: DropiTrackingService;

  beforeEach(() => {
    jest.clearAllMocks();
    auth.getToken.mockResolvedValue('tok');

    prisma.orderTracking.findUnique.mockResolvedValue(null);
    prisma.orderTracking.upsert.mockResolvedValue({});
    prisma.order.update.mockResolvedValue({});

    service = new DropiTrackingService(
      client as unknown as DropiClient,
      auth as unknown as DropiAuthService,
      prisma as unknown as PrismaService,
      {} as unknown as MailService,
    );
  });

  describe('translateStatus', () => {
    it('entiende los estados en español que devuelve Dropi', () => {
      expect(service.translateStatus('CANCELADO')).toBe('CANCELLED');
      expect(service.translateStatus('cancelado')).toBe('CANCELLED');
      expect(service.translateStatus('ACEPTADO')).toBe('PAID');
      expect(service.translateStatus('En tránsito')).toBe('SHIPPED');
      expect(service.translateStatus('en proceso')).toBe('PAID');
      expect(service.translateStatus('ENTREGADO')).toBe('DELIVERED');
      expect(service.translateStatus('PENDIENTE')).toBe('PENDING');
    });

    it('sigue entendiendo los estados en ingles', () => {
      expect(service.translateStatus('IN_TRANSIT')).toBe('SHIPPED');
      expect(service.translateStatus('CONFIRMED')).toBe('PAID');
      expect(service.translateStatus('DELIVERED')).toBe('DELIVERED');
    });

    it('no mueve el pedido cuando no sabe que significa', () => {
      expect(service.translateStatus(null)).toBe('PENDING');
      expect(service.translateStatus('')).toBe('PENDING');
      expect(service.translateStatus('ALGO_QUE_NO_CONOZCO')).toBe('PENDING');
    });
  });

  describe('trackByOrderId', () => {
    it('devuelve null sin llamar a Dropi si el pedido no tiene tracking', async () => {
      prisma.orderTracking.findUnique.mockResolvedValue(null);

      await expect(service.trackByOrderId('ord-1')).resolves.toBeNull();
      expect(client.request).not.toHaveBeenCalled();
    });

    it('consulta Dropi por el id del pedido cuando todavía no hay guía', async () => {
      prisma.orderTracking.findUnique.mockResolvedValue({
        dropiOrderId: '91295945',
        dropiGuideId: null,
      });
      client.request.mockResolvedValue({
        statusCode: 200,
        data: JSON.stringify({
          objects: {
            id: 91295945,
            status: 'CANCELADO',
            shipping_guide: null,
            shipping_company: 'Dropi',
          },
        }),
      });

      const data = await service.trackByOrderId('ord-1');

      expect(client.request).toHaveBeenCalledWith(
        '/api/orders/myorders/91295945',
        'GET',
        undefined,
        'tok',
      );
      expect(data?.status).toBe('CANCELADO');
      expect(data?.carrier).toBe('Dropi');
    });

    it('entrega la guía cuando Dropi ya la tiene, para no volver a preguntar', async () => {
      prisma.orderTracking.findUnique.mockResolvedValue({
        dropiOrderId: '91295945',
        dropiGuideId: null,
      });
      client.request.mockResolvedValue({
        statusCode: 200,
        data: JSON.stringify({
          objects: {
            id: 91295945,
            status: 'ACEPTADO',
            shipping_guide: 'GUIDE-2026',
            shipping_company: 'Coordinadora',
          },
        }),
      });

      const data = await service.trackByOrderId('ord-1');

      expect(data?.guide).toBe('GUIDE-2026');
      expect(data?.carrier).toBe('Coordinadora');
    });

    it('reintenta una vez si el token expiró', async () => {
      prisma.orderTracking.findUnique.mockResolvedValue({
        dropiOrderId: '91295945',
        dropiGuideId: null,
      });
      client.request
        .mockResolvedValueOnce({ statusCode: 401, data: '' })
        .mockResolvedValueOnce({
          statusCode: 200,
          data: JSON.stringify({ objects: { status: 'EN_TRÁNSITO' } }),
        });

      const data = await service.trackByOrderId('ord-1');

      expect(auth.invalidateToken).toHaveBeenCalledTimes(1);
      expect(client.request).toHaveBeenCalledTimes(2);
      expect(data?.status).toBe('EN_TRÁNSITO');
    });

    it('devuelve null si Dropi ya no tiene la orden', async () => {
      prisma.orderTracking.findUnique.mockResolvedValue({
        dropiOrderId: '91295945',
        dropiGuideId: null,
      });
      client.request.mockResolvedValue({ statusCode: 404, data: '' });

      await expect(service.trackByOrderId('ord-1')).resolves.toBeNull();
    });
  });

  describe('syncOrderStatus', () => {
    const orden = (status: string) => ({
      id: 'ord-1',
      status,
      items: [],
      user: { email: 'cliente@test.com', name: 'Ana' },
      tracking: { dropiOrderId: '91295945', dropiGuideId: null },
    });

    it('saca el pedido de PENDING cuando Dropi ya lo envió', async () => {
      prisma.order.findUnique.mockResolvedValue(orden('PENDING'));
      prisma.orderTracking.findUnique.mockResolvedValue({
        dropiOrderId: '91295945',
        dropiGuideId: null,
      });
      client.request.mockResolvedValue({
        statusCode: 200,
        data: JSON.stringify({
          objects: {
            status: 'ENVIADO',
            shipping_guide: 'GUIDE-2026',
            shipping_company: 'Dropi',
          },
        }),
      });

      const result = await service.syncOrderStatus('ord-1');

      expect(result.synced).toBe(true);
      expect(result.newStatus).toBe('SHIPPED');
      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ord-1' },
          data: { status: 'SHIPPED' },
        }),
      );
      // La guía se guarda: a partir de ahi se puede consultar por guía.
      const upsertado = prisma.orderTracking.upsert.mock.calls[0][0] as {
        where: { orderId: string };
        update: { dropiGuideId?: string | null };
        create: { dropiGuideId?: string | null };
      };
      expect(upsertado.where).toEqual({ orderId: 'ord-1' });
      expect(upsertado.update.dropiGuideId).toBe('GUIDE-2026');
      expect(upsertado.create.dropiGuideId).toBe('GUIDE-2026');
    });

    it('no mueve nada mientras Dropi siga en PENDIENTE', async () => {
      prisma.order.findUnique.mockResolvedValue(orden('PENDING'));
      prisma.orderTracking.findUnique.mockResolvedValue({
        dropiOrderId: '91295945',
        dropiGuideId: null,
      });
      client.request.mockResolvedValue({
        statusCode: 200,
        data: JSON.stringify({ objects: { status: 'PENDIENTE' } }),
      });

      const result = await service.syncOrderStatus('ord-1');

      expect(result.synced).toBe(false);
      expect(result.newStatus).toBe('PENDING');
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('no retrocede un pedido ya entregado', async () => {
      prisma.order.findUnique.mockResolvedValue(orden('DELIVERED'));
      prisma.orderTracking.findUnique.mockResolvedValue({
        dropiOrderId: '91295945',
        dropiGuideId: null,
      });
      client.request.mockResolvedValue({
        statusCode: 200,
        data: JSON.stringify({ objects: { status: 'ENTREGADO' } }),
      });

      const result = await service.syncOrderStatus('ord-1');

      expect(result.synced).toBe(false);
      expect(prisma.order.update).not.toHaveBeenCalled();
    });
  });
});
