/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { WooCommerceService } from './woocommerce.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DropiTrackingService } from '../dropi/dropi.tracking';

const FAKE_ORDER: any = {
  id: 'order_cuid_1',
  numericId: 1001,
  userId: 'user_1',
  status: 'PAID',
  total: 25000,
  createdAt: new Date('2026-09-15T00:00:00Z'),
  updatedAt: new Date('2026-09-15T00:00:00Z'),
  notes: 'Entregar tarde',
  shippingName: 'Juan Pérez',
  shippingPhone: '3001234567',
  shippingAddress: 'Cra 10 #20-30',
  shippingCity: 'Bogotá',
  shippingState: 'Cundinamarca',
  shippingZip: '110111',
  shippingEmail: 'juan@test.co',
  items: [
    {
      id: 'item_1',
      quantity: 2,
      price: 12500,
      product: {
        id: 'prod_1',
        name: 'Camiseta',
        dropiProductId: '123',
      },
    },
  ],
  tracking: {
    dropiGuideId: 'GUIDE-999',
    carrier: 'Interrapidísimo',
    trackingUrl: 'https://track.example/1',
    guidePdfUrl: 'https://docs.example/1',
  },
};

describe('WooCommerceService', () => {
  let service: WooCommerceService;
  let prisma: any;
  let tracking: any;

  beforeEach(async () => {
    prisma = {
      order: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ ...FAKE_ORDER, ...data }),
          ),
      },
    };
    tracking = {
      upsertTracking: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WooCommerceService,
        { provide: PrismaService, useValue: prisma },
        { provide: DropiTrackingService, useValue: tracking },
      ],
    }).compile();

    service = module.get<WooCommerceService>(WooCommerceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('mapea un pedido interno al formato WooCommerce', () => {
    const wc = service.toWooCommerceOrder(FAKE_ORDER);

    expect(wc.id).toBe(1001);
    expect(wc.status).toBe('processing');
    expect(wc.currency).toBe('COP');
    expect(wc.total).toBe('25000.00');
    expect(wc.billing.city).toBe('Bogotá');
    expect(wc.line_items).toHaveLength(1);
    expect(wc.line_items[0]).toMatchObject({
      name: 'Camiseta',
      quantity: 2,
      product_id: 123,
    });
    expect(
      wc.meta_data.find((m: any) => m.key === 'dropi_guide_id')?.value,
    ).toBe('GUIDE-999');
  });

  it('rechaza ids no numéricos en getOrderByNumericId', async () => {
    prisma.order.findUnique.mockResolvedValue(null);
    await expect(service.getOrderByNumericId(999)).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.order.findUnique).toHaveBeenCalledWith({
      where: { numericId: 999 },
      include: expect.anything(),
    });
  });

  it('aplica transiciones válidas desde webhook Dropi', async () => {
    const body = {
      status: 'completed',
      meta_data: [
        { key: 'Número guía', value: 'GUIDE-777' },
        { key: 'transportadora', value: 'Servientrega' },
      ],
    };
    prisma.order.findUnique.mockResolvedValueOnce(FAKE_ORDER);
    prisma.order.findUnique.mockResolvedValueOnce({
      ...FAKE_ORDER,
      status: 'SHIPPED',
    });

    const wc = await service.applyDropiUpdate(1001, body);

    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: FAKE_ORDER.id },
      data: { status: 'SHIPPED' },
    });
    expect(tracking.upsertTracking).toHaveBeenCalledWith(FAKE_ORDER.id, {
      dropiOrderId: 'WC-1001',
      dropiGuideId: 'GUIDE-777',
      carrier: 'Servientrega',
      status: 'SHIPPED',
      lastEvent: 'GUIDE-777',
      rawResponse: body,
    });
    expect(wc.status).toBe('completed');
  });

  it('conserva el estado si la transición no es válida', async () => {
    const pendingOrder = { ...FAKE_ORDER, status: 'PENDING' };
    prisma.order.findUnique.mockResolvedValueOnce(pendingOrder);
    prisma.order.findUnique.mockResolvedValueOnce(pendingOrder);

    await service.applyDropiUpdate(1001, { status: 'completed' });

    expect(prisma.order.update).not.toHaveBeenCalled();
  });
});
