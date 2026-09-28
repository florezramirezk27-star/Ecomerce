import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { DropiService } from '../dropi/dropi.service';
import type { CheckoutDto } from './dto/checkout.dto';

describe('OrdersService', () => {
  let service: OrdersService;

  // Mocks a nivel de modulo, no de test: se inyectan por `useValue` para no
  // tener que castear el servicio a `any` y llegar a sus dependencias privadas.
  const userFindUnique = jest.fn();
  const orderFindFirst = jest.fn();
  const orderFindUnique = jest.fn();
  const cartFindUnique = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();

    userFindUnique.mockResolvedValue(null);
    orderFindFirst.mockResolvedValue(null);
    orderFindUnique.mockResolvedValue(null);
    cartFindUnique.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: PrismaService,
          useValue: {
            user: { findUnique: userFindUnique },
            order: { findFirst: orderFindFirst, findUnique: orderFindUnique },
            cart: { findUnique: cartFindUnique },
          },
        },
        {
          provide: MailService,
          useValue: {},
        },
        {
          provide: DropiService,
          useValue: {
            createOrder: jest
              .fn()
              .mockResolvedValue({ success: true, message: 'ok' }),
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
});
