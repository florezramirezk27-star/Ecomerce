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

// El error que reporto el usuario: Dropi pide recotizar porque la bodega no
// pudo surtir la cantidad en ese momento. No crea la orden, asi que se puede
// probar la siguiente bodega.
const EXISTENCIAS_ERROR = httpResponse(400, {
  is_successful: false,
  status_code: 400,
  status_reason:
    'Intenta cotizar nuevamente tu pedido, al parecer las existencias han variado mientras cotizabas.',
  data: null,
});

/** Cuerpo de la orden enviada a Dropi (solo lo que mira el test). */
interface PostedOrderBody {
  warehouses_selected_id?: number;
  products?: Array<{ id?: number; variation_id?: number | null }>;
  distributionCompany?: { id?: number; name?: string };
  shipping_amount?: number;
  type_service?: string;
}

/**
 * Monta el servicio con dobles. `responses` se consume en orden: cada llamada
 * a Dropi toma el siguiente elemento y, si se acaba, el ultimo (que es lo que
 * hace un `mockResolvedValue` normal, no un `once` por test).
 */
function makeService(opts: {
  warehouseIds: number[];
  suggestedPrice?: number;
  variationId?: number | null;
  responses: Array<{ statusCode: number; data: string } | Error>;
}) {
  const posted: PostedOrderBody[] = [];
  let call = 0;

  const request = jest.fn(
    (_path: string, _method: string, body: PostedOrderBody) => {
      posted.push(body);
      const next = opts.responses[Math.min(call, opts.responses.length - 1)];
      call++;
      if (next instanceof Error) return Promise.reject(next);
      return Promise.resolve(next);
    },
  );

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
      variationId: opts.variationId ?? null,
      salePrice: 175900,
      suggestedPrice: opts.suggestedPrice ?? 0,
    }),
  } as unknown as DropiProductsService;

  return {
    service: new DropiOrdersService(client, auth, products),
    posted,
  };
}

const usedWarehouses = (posted: PostedOrderBody[]) =>
  posted.map((b) => b.warehouses_selected_id);

describe('DropiOrdersService: eleccion y reintento de bodega', () => {
  const OLD_ENV = { ...process.env };

  beforeEach(() => {
    process.env.DROPI_USER_ID = '660824';
    process.env.DROPI_SUPPLIER_ID = '29151';
    process.env.DROPI_WAREHOUSE_ID = '3577';
    process.env.DROPI_DISTRIBUTION_COMPANY_ID = '3';
    process.env.DROPI_SHIPPING_AMOUNT = '41295';
    // La seleccion automatica tiene su propio describe; aca se prueba el
    // comportamiento de bodegas con el carrier fijo, sin llamadas extra.
    process.env.DROPI_CARRIER_AUTO_SELECT = 'false';
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  const checkout = (service: DropiOrdersService, price = ITEM.price) =>
    service.createOrder({
      items: [{ ...ITEM, price }],
      shipping: SHIPPING,
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

  // Dropi cambio la grafia del flag (`is_succesfull` -> `is_successful`). Si no
  // se reconoce, una orden creada en Dropi se reporta como fallida y el pedido
  // queda en PENDING aunque el proveedor ya lo tenga.
  it('reconoce el exito con la grafia nueva is_successful', async () => {
    const { service, posted } = makeService({
      warehouseIds: [19860],
      responses: [
        httpResponse(200, {
          is_successful: true,
          status_code: 200,
          status_reason: 'El registro ha sido creado con exito!.',
          data: { orderId: { id: 90660000 } },
        }),
      ],
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

  it('reintenta con la siguiente bodega cuando las existencias variaron', async () => {
    const { service, posted } = makeService({
      warehouseIds: [2015, 2020],
      responses: [EXISTENCIAS_ERROR, CREATED],
    });

    const result = await checkout(service);

    expect(result.success).toBe(true);
    expect(result.results[0].dropiOrderId).toBe('90660000');
    expect(usedWarehouses(posted)).toEqual([2015, 2020]);
  });

  it('envia el variation_id resuelto para un producto VARIABLE', async () => {
    const { service, posted } = makeService({
      warehouseIds: [2015],
      variationId: 555,
      responses: [CREATED],
    });

    await checkout(service);

    expect(posted[0].products?.[0].variation_id).toBe(555);
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

/**
 * El pedido solo se cancela si Dropi dijo "no" de verdad. Si fue un fallo
 * tecnico (5xx, excepcion), el pedido tiene que seguir en PENDING para que el
 * admin pueda reprocesarlo: cancelarlo ahi seria perder la venta por un parpadeo
 * de Dropi.
 */
describe('DropiOrdersService: rechazo de negocio vs fallo tecnico', () => {
  const OLD_ENV = { ...process.env };

  beforeEach(() => {
    process.env.DROPI_USER_ID = '660824';
    process.env.DROPI_SUPPLIER_ID = '29151';
    process.env.DROPI_WAREHOUSE_ID = '3577';
    process.env.DROPI_DISTRIBUTION_COMPANY_ID = '3';
    process.env.DROPI_SHIPPING_AMOUNT = '41295';
    process.env.DROPI_CARRIER_AUTO_SELECT = 'false';
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  const checkout = (service: DropiOrdersService) =>
    service.createOrder({
      items: [ITEM],
      shipping: SHIPPING,
    });

  it('marca rechazo ante un 4xx: repetir la llamada no cambia nada', async () => {
    const { service } = makeService({
      warehouseIds: [2015],
      responses: [
        httpResponse(400, {
          is_successful: false,
          status_code: 400,
          status_reason: 'No se puede crear una orden menor a $45.000 COP.',
          data: null,
        }),
      ],
    });

    const result = await checkout(service);

    expect(result.success).toBe(false);
    expect(result.results[0].rechazo).toBe(true);
    expect(result.rechazo).toBe(true);
    expect(result.message).toContain('$45.000');
  });

  it('no marca rechazo ante un 5xx: es un fallo tecnico reprocesable', async () => {
    const { service } = makeService({
      warehouseIds: [2015],
      responses: [
        httpResponse(503, {
          is_successful: false,
          status_reason: 'Service Unavailable',
          data: null,
        }),
      ],
    });

    const result = await checkout(service);

    expect(result.success).toBe(false);
    expect(result.results[0].rechazo).toBe(false);
    expect(result.rechazo).toBe(false);
  });

  it('no marca rechazo cuando la llamada a Dropi revienta', async () => {
    const { service } = makeService({
      warehouseIds: [2015],
      responses: [new Error('getaddrinfo ENOTFOUND')],
    });

    const result = await checkout(service);

    expect(result.success).toBe(false);
    expect(result.results[0].rechazo).toBe(false);
    expect(result.rechazo).toBe(false);
  });

  it('marca rechazo cuando el precio esta bajo el sugerido de Dropi', async () => {
    const { service, posted } = makeService({
      warehouseIds: [2015],
      suggestedPrice: 219900,
      responses: [CREATED],
    });

    const result = await service.createOrder({
      items: [{ ...ITEM, price: 175900 }],
      shipping: SHIPPING,
    });

    expect(result.success).toBe(false);
    expect(result.rechazo).toBe(true);
    expect(posted).toHaveLength(0);
  });

  it('no marca rechazo cuando el pedido se creo completo', async () => {
    const { service } = makeService({
      warehouseIds: [2015],
      responses: [CREATED],
    });

    const result = await checkout(service);

    expect(result.success).toBe(true);
    expect(result.rechazo).toBe(false);
  });
});

describe('DropiOrdersService: seleccion automatica de transportadora', () => {
  const OLD_ENV = { ...process.env };

  beforeEach(() => {
    process.env.DROPI_USER_ID = '660824';
    process.env.DROPI_SUPPLIER_ID = '29151';
    process.env.DROPI_WAREHOUSE_ID = '3577';
    process.env.DROPI_DISTRIBUTION_COMPANY_ID = '3';
    process.env.DROPI_DISTRIBUTION_COMPANY_NAME = 'FIJA';
    process.env.DROPI_SHIPPING_AMOUNT = '41295';
    process.env.DROPI_CARRIER_AUTO_SELECT = 'true';
    process.env.DROPI_CARRIER_TIMEOUT_MS = '2000';
    process.env.DROPI_RATE_TYPE = 'CON RECAUDO';
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('usa la cotizacion de mejor precio-calidad y su bodega', async () => {
    const requests: Array<{ path: string; body?: PostedOrderBody | any }> = [];

    const request = jest.fn(
      (path: string, _method: string, body?: PostedOrderBody | any) => {
        requests.push({ path, body });

        if (path.includes('/department')) {
          return Promise.resolve(
            httpResponse(200, {
              is_successful: true,
              status_code: 200,
              data: { objects: [{ id: 1, name: 'SANTANDER' }] },
            }),
          );
        }

        if (path.includes('/trajectory/bycity')) {
          return Promise.resolve(
            httpResponse(200, {
              is_successful: true,
              status_code: 200,
              data: {
                objects: [{ id: 99, name: 'Bucaramanga', cod_dane: '68001' }],
              },
            }),
          );
        }

        if (path.includes('/getOriginCityForCalculateShipping')) {
          return Promise.resolve(
            httpResponse(200, {
              is_successful: true,
              status_code: 200,
              data: {
                objects: {
                  city_dropi: { id: 5, name: 'Bogota', cod_dane: '11001' },
                  warehouse: { id: 777 },
                },
              },
            }),
          );
        }

        if (path === '/bff/orders/quote') {
          return Promise.resolve(
            httpResponse(200, {
              is_successful: true,
              status_code: 200,
              data: {
                objects: [
                  {
                    distributionCompany: { id: 10, name: 'INTERRAPIDISIMO' },
                    incidence_solution_method: 'GUIA',
                    procesar_notificaciones: true,
                    objects: {
                      precioEnvio: 10900,
                      trayecto: '2 dias',
                      transportadora_service: 'normal',
                    },
                  },
                  {
                    id: 20,
                    name: 'VELOCES',
                    objects: {
                      precioEnvio: 10000,
                      trayecto: '8 dias',
                      transportadora_service: 'normal',
                    },
                  },
                ],
              },
            }),
          );
        }

        if (path === '/bff/orders') {
          return Promise.resolve(CREATED);
        }

        return Promise.reject(new Error(`request inesperado: ${path}`));
      },
    );

    const client = { request } as unknown as DropiClient;
    const auth = {
      getToken: jest.fn().mockResolvedValue('tok'),
      invalidateToken: jest.fn(),
    } as unknown as DropiAuthService;
    const products = {
      resolveDropshipperContext: jest.fn().mockResolvedValue({
        supplierId: 12108,
        warehouseId: 2015,
        warehouseIds: [2015],
        variationId: null,
        salePrice: 175900,
        suggestedPrice: 0,
        weight: 1,
      }),
    } as unknown as DropiProductsService;

    const service = new DropiOrdersService(client, auth, products);
    const result = await service.createOrder({
      items: [ITEM],
      shipping: SHIPPING,
    });

    expect(result.success).toBe(true);
    expect(result.results[0].carrier).toBe('INTERRAPIDISIMO');

    const quote = requests.find((r) => r.path === '/bff/orders/quote');
    expect(quote?.body).toMatchObject({
      ciudad_remitente: { name: 'Bogota' },
      ciudad_destino: { name: 'Bucaramanga' },
      peso: 1,
      warehouse: { id: 777 },
      products: [{ id: ITEM.dropiProductId, variation_id: null }],
    });
    expect(quote?.body.Peso).toBeUndefined();

    const order = requests.find((r) => r.path === '/bff/orders');
    expect(order?.body).toMatchObject({
      distributionCompany: { id: 10, name: 'INTERRAPIDISIMO' },
      shipping_amount: 10900,
      type_service: 'normal',
      warehouses_selected_id: 777,
    });
  });

  it('reintenta la cotizacion con dimensiones en mayuscula si el BFF rechaza el formato principal', async () => {
    const quoteBodies: Array<PostedOrderBody | any> = [];

    const request = jest.fn(
      (path: string, _method: string, body?: PostedOrderBody | any) => {
        if (path.includes('/department')) {
          return Promise.resolve(
            httpResponse(200, {
              is_successful: true,
              status_code: 200,
              data: { objects: [{ id: 1, name: 'SANTANDER' }] },
            }),
          );
        }

        if (path.includes('/trajectory/bycity')) {
          return Promise.resolve(
            httpResponse(200, {
              is_successful: true,
              status_code: 200,
              data: {
                objects: [{ id: 99, name: 'Bucaramanga', cod_dane: '68001' }],
              },
            }),
          );
        }

        if (path.includes('/getOriginCityForCalculateShipping')) {
          return Promise.resolve(
            httpResponse(200, {
              is_successful: true,
              status_code: 200,
              data: {
                objects: {
                  city_dropi: { id: 5, name: 'Bogota', cod_dane: '11001' },
                  warehouse: { id: 777 },
                },
              },
            }),
          );
        }

        if (path === '/bff/orders/quote') {
          quoteBodies.push(body);
          if (body?.peso !== undefined) {
            return Promise.resolve(
              httpResponse(400, {
                is_successful: false,
                status_code: 400,
                status_reason: 'peso is required',
                data: null,
              }),
            );
          }
          return Promise.resolve(
            httpResponse(200, {
              is_successful: true,
              status_code: 200,
              data: {
                objects: [
                  {
                    distributionCompany: {
                      id: 10,
                      name: 'INTERRAPIDISIMO',
                    },
                    objects: {
                      precioEnvio: 10900,
                      trayecto: '2 dias',
                      transportadora_service: 'normal',
                    },
                  },
                ],
              },
            }),
          );
        }

        if (path === '/bff/orders') {
          return Promise.resolve(CREATED);
        }

        return Promise.reject(new Error(`request inesperado: ${path}`));
      },
    );

    const client = { request } as unknown as DropiClient;
    const auth = {
      getToken: jest.fn().mockResolvedValue('tok'),
      invalidateToken: jest.fn(),
    } as unknown as DropiAuthService;
    const products = {
      resolveDropshipperContext: jest.fn().mockResolvedValue({
        supplierId: 12108,
        warehouseId: 2015,
        warehouseIds: [2015],
        variationId: null,
        salePrice: 175900,
        suggestedPrice: 0,
        weight: 1,
      }),
    } as unknown as DropiProductsService;

    const service = new DropiOrdersService(client, auth, products);
    const result = await service.createOrder({
      items: [ITEM],
      shipping: SHIPPING,
    });

    expect(result.success).toBe(true);
    expect(result.results[0].carrier).toBe('INTERRAPIDISIMO');
    expect(quoteBodies).toHaveLength(2);
    expect(quoteBodies[0]).toMatchObject({ peso: 1 });
    expect(quoteBodies[0].Peso).toBeUndefined();
    expect(quoteBodies[1]).toMatchObject({ Peso: 1 });
    expect(quoteBodies[1].peso).toBeUndefined();
  });

  it('si el cotizador falla, crea la orden con el carrier configurado', async () => {
    const posted: PostedOrderBody[] = [];
    const request = jest.fn(
      (path: string, _method: string, body?: PostedOrderBody) => {
        if (path.includes('/getOriginCityForCalculateShipping')) {
          return Promise.resolve(
            httpResponse(200, {
              is_successful: true,
              status_code: 200,
              data: {
                objects: {
                  city_dropi: { id: 5, name: 'Bogota' },
                  warehouse: { id: 777 },
                },
              },
            }),
          );
        }
        if (path.includes('/department')) {
          return Promise.resolve(httpResponse(500, {}));
        }
        if (path === '/bff/orders') {
          posted.push(body as PostedOrderBody);
          return Promise.resolve(CREATED);
        }
        return Promise.reject(new Error(`request inesperado: ${path}`));
      },
    );

    const client = { request } as unknown as DropiClient;
    const auth = {
      getToken: jest.fn().mockResolvedValue('tok'),
      invalidateToken: jest.fn(),
    } as unknown as DropiAuthService;
    const products = {
      resolveDropshipperContext: jest.fn().mockResolvedValue({
        supplierId: 12108,
        warehouseId: 2015,
        warehouseIds: [2015],
        variationId: null,
        salePrice: 175900,
        suggestedPrice: 0,
        weight: 1,
      }),
    } as unknown as DropiProductsService;

    const service = new DropiOrdersService(client, auth, products);
    const result = await service.createOrder({
      items: [ITEM],
      shipping: SHIPPING,
    });

    expect(result.success).toBe(true);
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({
      distributionCompany: { id: 3, name: 'FIJA' },
      shipping_amount: 41295,
    });
  });
});
