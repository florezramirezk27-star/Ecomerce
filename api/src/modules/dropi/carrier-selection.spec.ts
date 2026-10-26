import {
  matchGeoName,
  parseCarrierQualityOverrides,
  selectBestCarrierQuote,
  toDropiCarrierQuote,
} from './carrier-selection';

type ExtraQuoteFields = {
  incidence_solution_method?: string;
  procesar_notificaciones?: boolean;
  objects?: Record<string, unknown>;
};

const carrier = (
  id: number,
  name: string,
  price: number,
  trayecto: string,
  extra: ExtraQuoteFields = {},
) => ({
  id,
  name,
  ...extra,
  objects: {
    precioEnvio: price,
    trayecto,
    transportadora_service: 'normal',
    ...(extra.objects ?? {}),
  },
});

describe('carrier-selection: cotizaciones de Dropi', () => {
  it('normaliza la forma confirmada de /bff/orders/quote', () => {
    const quote = toDropiCarrierQuote({
      id: 7,
      name: 'INTERRAPIDISIMO',
      incidence_solution_method: 'GUIA',
      procesar_notificaciones: true,
      objects: {
        precioEnvio: '12.500',
        trayecto: '2 dias',
        transportadora_service: 'normal',
      },
    });

    expect(quote).toMatchObject({
      carrierId: 7,
      carrierName: 'INTERRAPIDISIMO',
      price: 12500,
      service: 'normal',
      trayecto: '2 dias',
      incidenceSolutionMethod: 'GUIA',
      notificationsEnabled: true,
    });
  });

  it('no elige la mas barata cuando su calidad es claramente peor', () => {
    const best = selectBestCarrierQuote([
      carrier(10, 'INTERRAPIDISIMO', 10900, '2 dias', {
        incidence_solution_method: 'GUIA',
        procesar_notificaciones: true,
      }),
      carrier(20, 'VELOCES', 10000, '8 dias'),
    ]);

    expect(best).toMatchObject({
      carrierId: 10,
      carrierName: 'INTERRAPIDISIMO',
      price: 10900,
    });
  });

  it('elige la mas barata cuando la calidad es equivalente', () => {
    const best = selectBestCarrierQuote([
      carrier(1, 'TCC', 10000, '3 dias'),
      carrier(2, 'TCC', 14000, '3 dias'),
    ]);

    expect(best?.carrierId).toBe(1);
  });

  it('ignora cotizaciones sin precio, sin id o con error', () => {
    const best = selectBestCarrierQuote([
      { id: 1, name: 'SIN PRECIO', objects: {} },
      { name: 'SIN ID', objects: { precioEnvio: 5000 } },
      {
        id: 2,
        name: 'CON ERROR',
        error: 'no disponible',
        objects: { precioEnvio: 5000 },
      },
      carrier(3, 'TCC', 8000, '2 dias'),
    ]);

    expect(best?.carrierId).toBe(3);
  });

  it('devuelve null si no hay ninguna cotizacion utilizable', () => {
    expect(selectBestCarrierQuote([])).toBeNull();
    expect(selectBestCarrierQuote([{ id: 1, name: 'X' }])).toBeNull();
  });

  it('permite sobrescribir la calidad por transportadora', () => {
    const overrides = parseCarrierQualityOverrides(
      '{"VELOCES":0.99,"INTERRAPIDISIMO":0.2}',
    );

    const best = selectBestCarrierQuote(
      [
        carrier(10, 'INTERRAPIDISIMO', 10000, '2 dias'),
        carrier(20, 'VELOCES', 11000, '2 dias'),
      ],
      { qualityOverrides: overrides },
    );

    expect(best?.carrierId).toBe(20);
  });
});

describe('carrier-selection: ciudades de Dropi', () => {
  it('compara nombres con acentos, D.C. y palabras de mas', () => {
    const departments = [
      { id: 1, name: 'ANTIOQUIA' },
      { id: 2, name: 'Bogotá D.C.' },
      { id: 3, name: 'SANTANDER' },
    ];

    expect(matchGeoName(departments, 'Bogota')?.id).toBe(2);
    expect(matchGeoName(departments, 'bogotá d.c.')?.id).toBe(2);
  });

  it('encuentra la ciudad aunque Dropi la devuelva con otro sufijo', () => {
    const cities = [
      { id: 10, name: 'Bucaramanga' },
      { id: 11, name: 'Floridablanca' },
    ];

    expect(matchGeoName(cities, 'BUCARAMANGA')?.id).toBe(10);
  });

  it('encuentra una ciudad con prefijo historico como San Jose de Cucuta', () => {
    const cities = [{ id: 21, name: 'San José de Cúcuta' }];

    expect(matchGeoName(cities, 'Cucuta')?.id).toBe(21);
    expect(matchGeoName(cities, 'SAN JOSE DE CUCUTA')?.id).toBe(21);
  });
});
