import { DropiOrdersService } from './dropi.orders';
import { DropiClient } from './dropi.client';
import { DropiAuthService } from './dropi.auth';
import { DropiProductsService } from './dropi.products';

const ITEM = {
  dropiProductId: 1734566,
  quantity: 1,
  price: 269000,
  name: 'Reloj Naviforce',
};

const SHIPPING = {
  name: 'Karen Gomez',
  phone: '3156526081',
  email: 'cliente@example.com',
  address: 'Cll 30 #40-45',
  city: 'Bucaramanga',
  state: 'SANTANDER',
};

function httpResponse(statusCode: number, data: unknown) {
  return { statusCode, data: JSON.stringify(data) };
}

const SUCURSAL_ERROR = httpResponse(400, {
  is_successful: false,
  status_code: 400,
  status_reason: 'la bodega no tiene sucursal id',
  data: null,
});

const CREATED = httpResponse(200, {
  is_succesfull: true,
  status_reason: 'El registro ha sido creado con exito!',
  data: { orderId: { id: 90660000 } },
});

const NO_STOCK_ERROR = httpResponse(400, {
  is_successful: false,
  status_code: 400,
  status_reason: 'el producto no tiene stock disponible',
  data: null,
});

/**
 * Monta el servicio con dobles. `responses` se consume en orden: cada llamada
 * a Dropi toma el siguiente elemento y, si se acaba, el ultimo (que es lo que
 * hace un `mockResolvedValue` normal, no un `once` por test).
 */
function makeService(opts: {
  warehouseIds: number[];
  suggestedPrice?: number;
  responses: Array<{ statusCode: number; data: string } | Error>;
}) {
  const posted: any[] = [];
  let call = 0;

  const request = jest.fn((_path: string, _method: string, body: any) => {
    posted.push(body);
    const next =
      opts.responses[Math.min(call, opts.responses.length - 1)];
    call++;
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve(next);
  });

  const client = { request } as unknown as DropiClient;
  const auth = {
    getToken: jest.fn().mockResolvedValue('tok'),
    invalidateToken: jest.fn(),
  } as unknown as DropiAuthService;
  const products = {
    resolveDropshipperContext: jest.fn().mockResolvedValue({
      supplierId: 12108,
      warehouseId: opts.warehouseIds[0],
      warehouseIds: opts.warehouseIds,
      salePrice: 175900,
      suggestedPrice: opts.suggestedPrice ?? 0,
    }),
  } as unknown as DropiProductsService;

  return {
    service: new DropiOrdersService(client, auth, products),
    posted,
  };
}

const usedWarehouses = (posted: any[]) =>
  posted.map((b) => b.warehouses_selected_id);

describe('DropiOrdersService: eleccion y reintento de bodega', () => {
  const OLD_ENV = { ...process.env };

  beforeEach(() => {
    process.env.DROPI_USER_ID = '660824';
    process.env.DROPI_SUPPLIER_ID = '29151';
    process.env.DROPI_WAREHOUSE_ID = '3577';
    process.env.DROPI_DISTRIBUTION_COMPANY_ID = '3';
    process.env.DROPI_SHIPPING_AMOUNT = '41295';
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  const checkout = (service: DropiOrdersService, price = ITEM.price) =>
    service.createOrder({
      items: [{ ...ITEM, price }],
      shipping: SHIPPING as any,
    });

  it('usa la bodega del proveedor cuando la primera es valida', async () => {
    const { service, posted } = makeService({
      warehouseIds: [19860],
      responses: [CREATED],
    });

    const result = await checkout(service);

    expect(result.success).toBe(true);
    expect(result.results[0].dropiOrderId).toBe('90660000');
    expect(usedWarehouses(posted)).toEqual([19860]);
  });

  it('reintenta con la siguiente bodega cuando Dropi culpa a la bodega', async () => {
    const { service, posted } = makeService({
      warehouseIds: [2015, 2020],
      responses: [SUCURSAL_ERROR, CREATED],
    });

    const result = await checkout(service);

    expect(result.success).toBe(true);
    expect(result.results[0].dropiOrderId).toBe('90660000');
    expect(usedWarehouses(posted)).toEqual([2015, 2020]);
  });

  it('cae en DROPI_WAREHOUSE_ID como ultima bodega, antes de rendirse', async () => {
    const { service, posted } = makeService({
      warehouseIds: [2015],
      responses: [SUCURSAL_ERROR, CREATED],
    });

    const result = await checkout(service);

    expect(result.success).toBe(true);
    expect(usedWarehouses(posted)).toEqual([2015, 3577]);
  });

  it('reporta el fallo cuando ninguna bodega sirve', async () => {
    const { service, posted } = makeService({
      warehouseIds: [2015],
      responses: [SUCURSAL_ERROR],
    });

    const result = await checkout(service);

    expect(result.success).toBe(false);
    expect(result.results[0].dropiOrderId).toBeNull();
    expect(result.results[0].status).toContain('sucursal');
    // La del proveedor y el respaldo de .env: no mas intentos.
    expect(usedWarehouses(posted)).toEqual([2015, 3577]);
  });

  it('no reintenta si el fallo no es de bodega: evita ordenes duplicadas', async () => {
    const { service, posted } = makeService({
      warehouseIds: [2015, 2020],
      responses: [NO_STOCK_ERROR],
    });

    const result = await checkout(service);

    expect(result.success).toBe(false);
    expect(posted).toHaveLength(1);
  });

  it('no reintenta ante un error de red: la orden pudo haberse creado', async () => {
    const { service, posted } = makeService({
      warehouseIds: [2015, 2020],
      responses: [new Error('timeout')],
    });

    const result = await checkout(service);

    expect(result.success).toBe(false);
    expect(result.results[0].status).toBe('error');
    // Un solo intento, sin pasar a la segunda bodega: reintentar tras un
    // error de red crearia una segunda orden real en Dropi.
    expect(usedWarehouses(posted)).toEqual([2015]);
  });

  it('rechaza sin llamar a Dropi cuando el precio esta bajo el sugerido', async () => {
    const { service, posted } = makeService({
      warehouseIds: [2015],
      suggestedPrice: 219900,
      responses: [CREATED],
    });

    const result = await checkout(service, 175900);

    expect(result.success).toBe(false);
    expect(result.results[0].status).toContain('219900');
    expect(posted).toHaveLength(0);
  });
});
