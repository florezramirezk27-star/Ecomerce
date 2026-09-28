import { Test, TestingModule } from '@nestjs/testing';

import { TrackingTool } from './tracking.tool';
import { PrismaService } from '../../../prisma/prisma.service';
import { DropiService } from '../../dropi/dropi.service';

describe('TrackingTool', () => {
  let tool: TrackingTool;
  let orderFindFirst: jest.Mock;
  let trackingUpsert: jest.Mock;
  let getDropiProducts: jest.Mock;

  const orderId = 'cabc123def456ghi789jkl';
  const guideId = 'GUIA123';

  beforeEach(async () => {
    orderFindFirst = jest.fn();
    trackingUpsert = jest.fn();
    getDropiProducts = jest.fn().mockResolvedValue({
      isSuccess: true,
      objects: [
        {
          status: 'ENTREGADO',
          last_event: 'Entregado en destino',
          status_detail: 'ok',
        },
      ],
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrackingTool,
        {
          provide: PrismaService,
          useValue: {
            order: { findFirst: orderFindFirst },
            orderTracking: { upsert: trackingUpsert },
          },
        },
        {
          provide: DropiService,
          useValue: { getDropiProducts },
        },
      ],
    }).compile();

    tool = module.get<TrackingTool>(TrackingTool);
  });

  it('necesita guia u orderId', async () => {
    const result = await tool.execute({}, { sessionId: 's1', isAdmin: false });

    expect(result.success).toBe(false);
  });

  it('acota la busqueda por userId y no escribe si la orden no es del usuario', async () => {
    // La orden existe en la base pero pertenece a otra persona: findFirst con
    // el filtro de propietario devuelve null.
    orderFindFirst.mockResolvedValue(null);

    const result = await tool.execute(
      { orderId },
      { sessionId: 's1', userId: 'user-1', isAdmin: false },
    );

    expect(orderFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: orderId, userId: 'user-1' },
      }),
    );
    expect(result.success).toBe(false);
    expect(trackingUpsert).not.toHaveBeenCalled();
  });

  it('un invitado no puede rastrear la orden de otro', async () => {
    orderFindFirst.mockResolvedValue(null);

    const result = await tool.execute(
      { orderId },
      { sessionId: 's1', isAdmin: false },
    );

    expect(orderFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: orderId, userId: '__sin_usuario__' },
      }),
    );
    expect(result.success).toBe(false);
    expect(trackingUpsert).not.toHaveBeenCalled();
  });

  it('resuelve la guia y escribe cuando la orden es del usuario', async () => {
    orderFindFirst.mockResolvedValue({
      id: orderId,
      tracking: { dropiGuideId: guideId },
    });

    const result = await tool.execute(
      { orderId },
      { sessionId: 's1', userId: 'user-1', isAdmin: false },
    );

    expect(result.success).toBe(true);
    expect(getDropiProducts).toHaveBeenCalledWith({
      search_type: 'guide',
      keywords: guideId,
    });
    expect(trackingUpsert).toHaveBeenCalledTimes(1);
  });

  it('no escribe nada cuando el usuario solo aporta una guia suelta', async () => {
    const result = await tool.execute(
      { guideId },
      { sessionId: 's1', isAdmin: false },
    );

    expect(result.success).toBe(true);
    // Sin orderId verificado no se toca la base de datos.
    expect(orderFindFirst).not.toHaveBeenCalled();
    expect(trackingUpsert).not.toHaveBeenCalled();
  });

  it('un admin puede rastrear cualquier orden', async () => {
    orderFindFirst.mockResolvedValue({
      id: orderId,
      tracking: { dropiGuideId: guideId },
    });

    const result = await tool.execute(
      { orderId },
      { sessionId: 's1', userId: 'admin-1', isAdmin: true },
    );

    expect(orderFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: orderId, userId: undefined } }),
    );
    expect(result.success).toBe(true);
  });
});
