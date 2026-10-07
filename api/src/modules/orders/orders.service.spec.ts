import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { DropiService } from '../dropi/dropi.service';
import type { CheckoutDto } from './dto/checkout.dto';

/**
 * Lo que devuelve `checkout`. Se declara aqui porque mientras el cliente de
 * Prisma se resuelve como `any` en el contexto de ESLint, el tipo literal de
 * `checkout` se pierde y cada `res.status` caeria en `no-unsafe-member-access`.
 */
type CheckoutRes = {
  status: string;
  dropi: {
    success: boolean | null;
    message: string;
    orderId: string | null;
    rechazo: boolean | null;
  };
};

describe('OrdersService', () => {
  let service: OrdersService;

  // Mocks a nivel de modulo, no de test: se inyectan por `useValue` para no
  // tener que castear el servicio a `any` y llegar a sus dependencias privadas.
  const userFindUnique = jest.fn();
  const orderFindFirst = jest.fn();
  const orderFindUnique = jest.fn();
  const orderUpdate = jest.fn();
  const cartFindUnique = jest.fn();
  const trackingUpsert = jest.fn();
  const trackingFindUnique = jest.fn();
  const transactionMock = jest.fn();

  // Lo que ve `prisma.$transaction(async (tx) => ...)`.
  const txMock = {
    product: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    order: {
      create: jest.fn(),
      update: jest.fn(),
    },
    cartItem: {
      deleteMany: jest.fn(),
    },
  };

  const mailMocks = {
    sendOrderConfirmationEmail: jest.fn(),
    sendOrderCancellationEmail: jest.fn(),
    sendOrderStatusEmail: jest.fn(),
    sendAdminOrderNotification: jest.fn(),
    sendAdminDropiFailureAlert: jest.fn(),
  };

  const dropiCreateOrder = jest.fn();
  const dropiValidateStock = jest.fn();
  const dropiCancelOrder = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();

    userFindUnique.mockResolvedValue(null);
    orderFindFirst.mockResolvedValue(null);
    orderFindUnique.mockResolvedValue(null);
    cartFindUnique.mockResolvedValue(null);
    orderUpdate.mockResolvedValue({ status: 'PAID' });
    trackingUpsert.mockResolvedValue({});
    trackingFindUnique.mockResolvedValue(null);
    transactionMock.mockImplementation((fn: (tx: typeof txMock) => unknown) =>
      fn(txMock),
    );
    txMock.product.findMany.mockResolvedValue([]);
    txMock.product.updateMany.mockResolvedValue({ count: 1 });
    txMock.product.update.mockResolvedValue({});
    txMock.order.create.mockResolvedValue({ id: 'ord-1', status: 'PENDING' });
    txMock.order.update.mockResolvedValue({ status: 'CANCELLED' });
    txMock.cartItem.deleteMany.mockResolvedValue({ count: 1 });

    for (const fn of Object.values(mailMocks)) {
      fn.mockResolvedValue(true);
    }

    dropiCreateOrder.mockResolvedValue({ success: true, message: 'ok' });
    dropiValidateStock.mockResolvedValue({ ok: true, insufficient: [] });
    dropiCancelOrder.mockResolvedValue({ success: true });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: PrismaService,
          useValue: {
            user: { findUnique: userFindUnique },
            order: {
              findFirst: orderFindFirst,
              findUnique: orderFindUnique,
              update: orderUpdate,
            },
            cart: { findUnique: cartFindUnique },
            orderTracking: {
              upsert: trackingUpsert,
              findUnique: trackingFindUnique,
            },
            $transaction: transactionMock,
          },
        },
        {
          provide: MailService,
          useValue: mailMocks,
        },
        {
          provide: DropiService,
          useValue: {
            createOrder: dropiCreateOrder,
            validateStock: dropiValidateStock,
            cancelOrder: dropiCancelOrder,
          },
        },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('scoping de la clave de idempotencia', () => {
    const user = { id: 'user-1', name: 'Ana', email: 'ana@test.com' };

    // El camino probado no llega a leer los datos de envio (el carrito vacio
    // corta antes), pero el DTO se construye completo para no castearlo.
    const dto: CheckoutDto = {
      idempotencyKey: 'clave-de-otro-usuario',
      shippingName: 'Ana Ruiz',
      shippingPhone: '3001234567',
      shippingAddress: 'Calle 1 #2-3',
      shippingCity: 'Bogota',
      shippingState: 'Cundinamarca',
    };

    beforeEach(() => {
      userFindUnique.mockResolvedValue(user);
    });

    it('acota la busqueda de idempotencia por userId', async () => {
      await expect(service.checkout(user.id, dto)).rejects.toThrow();

      // `findFirst` es el que lleva el filtro de propietario. Si alguien
      // vuelve a `findUnique` sin `userId`, este test falla.
      expect(orderFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { idempotencyKey: dto.idempotencyKey, userId: user.id },
        }),
      );
      expect(orderFindUnique).not.toHaveBeenCalled();
    });

    it('no devuelve la orden de otro usuario aunque la clave coincida', async () => {
      // La base de datos tiene la orden, pero pertenece a otra persona: el
      // filtro por userId hace que no aparezca y el flujo siga hacia el carrito,
      // que en este caso esta vacio.
      await expect(service.checkout(user.id, dto)).rejects.toThrow(
        'Tu carrito está vacío',
      );
      expect(orderFindFirst).toHaveBeenCalledTimes(1);
    });
  });

  describe('checkout: el estado que queda segun lo que responda Dropi', () => {
    const user = { id: 'user-1', name: 'Ana', email: 'ana@test.com' };

    const producto = {
      id: 'prod-1',
      name: 'Reloj',
      price: 100000,
      stock: 5,
      active: true,
      dropiProductId: 1734566,
    };

    const orderCreada = {
      id: 'ord-1',
      userId: 'user-1',
      total: 100000,
      status: 'PENDING',
      items: [{ id: 'oi-1', productId: 'prod-1', quantity: 1, price: 100000 }],
    };

    // Misma orden, pero con lo que updateStatus necesita para cancelarla.
    const ordenCompleta = {
      ...orderCreada,
      shippingEmail: 'ana@test.com',
      user,
      items: orderCreada.items.map((i) => ({ ...i, product: producto })),
    };

    const dto: CheckoutDto = {
      shippingName: 'Ana Ruiz',
      shippingPhone: '3001234567',
      shippingAddress: 'Calle 1 #2-3',
      shippingCity: 'Bogota',
      shippingState: 'Cundinamarca',
      shippingEmail: 'ana@test.com',
    };

    beforeEach(() => {
      userFindUnique.mockResolvedValue(user);
      cartFindUnique.mockResolvedValue({
        id: 'cart-1',
        userId: user.id,
        items: [
          { id: 'ci-1', productId: 'prod-1', quantity: 1, product: producto },
        ],
      });
      txMock.product.findMany.mockResolvedValue([producto]);
      txMock.order.create.mockResolvedValue(orderCreada);
      // `aplicarDecisionDropi` y luego `updateStatus` leen la misma orden.
      orderFindUnique.mockResolvedValue(ordenCompleta);
      trackingFindUnique.mockResolvedValue({
        dropiOrderId: null,
        status: 'ERROR',
      });
    });

    it('pasa a Confirmado cuando Dropi acepta el pedido', async () => {
      dropiCreateOrder.mockResolvedValue({
        success: true,
        message: 'Dropi OK: 92321466',
        results: [
          {
            dropiOrderId: '92321466',
            dropiGuideId: null,
            carrier: 'Dropi',
            status: 'CREATED',
            rawResponse: {},
          },
        ],
        rechazo: false,
      });

      const res = (await service.checkout(user.id, dto)) as CheckoutRes;

      expect(res.status).toBe('PAID');
      expect(orderUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'PAID' } }),
      );
      // El pedido si sale de PENDING, que era el error original.
      expect(res.dropi.success).toBe(true);
      expect(mailMocks.sendOrderConfirmationEmail).toHaveBeenCalled();
      expect(mailMocks.sendOrderCancellationEmail).not.toHaveBeenCalled();
    });

    it('cancela y devuelve el stock cuando Dropi rechaza el pedido', async () => {
      const motivo = 'No se puede crear una orden menor a $45.000 COP.';
      dropiCreateOrder.mockResolvedValue({
        success: false,
        message: `Dropi falló: ${motivo}`,
        results: [
          {
            dropiOrderId: null,
            dropiGuideId: null,
            carrier: null,
            status: motivo,
            rawResponse: { status_code: 400 },
          },
        ],
        rechazo: true,
      });

      const res = (await service.checkout(user.id, dto)) as CheckoutRes;

      expect(res.status).toBe('CANCELLED');
      expect(res.dropi.rechazo).toBe(true);
      // El stock descontado en el checkout vuelve al producto.
      expect(txMock.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prod-1' },
          data: { stock: { increment: 1 } },
        }),
      );
      // Al cliente no le llega "lo recibimos" si lo que recibe es la
      // cancelación, y esa sí lleva el motivo.
      expect(mailMocks.sendOrderConfirmationEmail).not.toHaveBeenCalled();
      expect(mailMocks.sendOrderCancellationEmail).toHaveBeenCalledWith(
        'ana@test.com',
        'Ana',
        'ord-1',
        expect.any(Array),
        100000,
        `Dropi falló: ${motivo}`,
      );
    });

    it('se queda en Pendiente si Dropi falla por lo tecnico', async () => {
      dropiCreateOrder.mockResolvedValue({
        success: false,
        message: 'Dropi error: timeout',
        results: [
          {
            dropiOrderId: null,
            dropiGuideId: null,
            carrier: null,
            status: 'error',
            rawResponse: { error: 'timeout' },
          },
        ],
        // No es un "no" de Dropi: no se cancela, se deja para reprocesar.
        rechazo: false,
      });

      const res = (await service.checkout(user.id, dto)) as CheckoutRes;

      expect(res.status).toBe('PENDING');
      expect(res.dropi.success).toBe(false);
      expect(res.dropi.rechazo).toBe(false);
      expect(txMock.product.update).not.toHaveBeenCalled();
      expect(mailMocks.sendOrderCancellationEmail).not.toHaveBeenCalled();
      expect(mailMocks.sendOrderConfirmationEmail).toHaveBeenCalled();
    });

    it('no toca el estado cuando el pedido no tiene productos de proveedor', async () => {
      const sinDropi = { ...producto, dropiProductId: null };
      cartFindUnique.mockResolvedValue({
        id: 'cart-1',
        userId: user.id,
        items: [
          {
            id: 'ci-1',
            productId: 'prod-1',
            quantity: 1,
            product: sinDropi,
          },
        ],
      });
      txMock.product.findMany.mockResolvedValue([sinDropi]);

      const res = (await service.checkout(user.id, dto)) as CheckoutRes;

      expect(res.status).toBe('PENDING');
      expect(res.dropi.success).toBeNull();
      expect(dropiCreateOrder).not.toHaveBeenCalled();
    });
  });
});
