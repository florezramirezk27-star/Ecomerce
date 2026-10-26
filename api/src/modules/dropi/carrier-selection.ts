/**
 * Logica pura de seleccion de transportadora.
 *
 * Vive fuera de `DropiOrdersService` para poder probarla sin red ni base de
 * datos. El servicio solo se encarga de resolver la ciudad de origen/destino y
 * de llamar a Dropi; aqui se normaliza la respuesta y se decide cual cotizacion
 * conviene.
 */

export interface DropiCarrierQuote {
  carrierId: number;
  carrierName: string;
  service: string;
  price: number;
  trayecto: unknown;
  incidenceSolutionMethod: string | null;
  notificationsEnabled: boolean;
  raw: Record<string, unknown>;
}

export interface ScoredDropiCarrierQuote extends DropiCarrierQuote {
  /** 0 = mala, 1 = excelente. */
  quality: number;
  /**
   * Costo ajustado por calidad. No es dinero: es el valor que se compara para
   * elegir. Un carrier mas caro puede ganar si su calidad compensa la
   * diferencia de precio.
   */
  adjustedCost: number;
}

export interface CarrierScoringConfig {
  /** Peso del precio en la decision. Default 0.55. */
  priceWeight?: number;
  /** Peso de la calidad en la decision. Default 0.45. */
  qualityWeight?: number;
  /** Calidad minima para preferir una cotizacion. Default 0.55. */
  minQuality?: number;
  /** Sobrescrituras de calidad por transportadora, ya normalizadas. */
  qualityOverrides?: Record<string, number>;
}

const DEFAULT_PRICE_WEIGHT = 0.55;
const DEFAULT_QUALITY_WEIGHT = 0.45;
const DEFAULT_MIN_QUALITY = 0.55;

/**
 * Puntajes iniciales de calidad por transportadora.
 *
 * Son un punto de partida editable con `DROPI_CARRIER_QUALITY_OVERRIDES`:
 * ninguna tabla de marcas puede saber como esta operando cada carrier en una
 * ruta concreta. El precio sigue pesando mas (55/45) y estas notas solo
 * desempatan/compensan diferencias pequenas. Si un carrier no aparece se usa
 * 0.75, que es neutro.
 */
const DEFAULT_CARRIER_QUALITY: Record<string, number> = {
  INTERRAPIDISIMO: 0.94,
  SERVIENTREGA: 0.92,
  ENVIA: 0.9,
  COORDINADORA: 0.88,
  TCC: 0.87,
  VELOCES: 0.84,
  '99MINUTOS': 0.82,
  DOMINA: 0.82,
  DEPRISA: 0.8,
  URBANO: 0.8,
  MENSAJERIA: 0.78,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function asText(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * Convierte numeros y strings de Dropi en numero. Soporta separadores de miles
 * porque la API a veces devuelve `"12.500"` y `Number("12.500")` daria 12.5.
 */
export function toNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'string') return null;

  const raw = value.trim();
  if (!raw) return null;

  const cleaned = raw.replace(/[^\d,.-]/g, '');
  if (!cleaned) return null;

  // Formato colombiano: 12.500 o 12.500,50. Se revisa antes que Number()
  // porque Number('12.500') devuelve 12.5 y perderia dos ceros.
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(cleaned)) {
    const n = Number(cleaned.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  const n = Number(cleaned.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeCarrierKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function normalizeGeoName(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(
      /\b(d c|dc|distrito capital|departamento|ciudad|municipio|corregimiento)\b/g,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return dp[n];
}

/**
 * Busca una ciudad/departamento por nombre. Dropi devuelve nombres con
 * acentos, "D.C.", "municipio", etc.; la comparacion exacta falla y la
 * cotizacion se caeria al carrier fijo de .env.
 */
export function matchGeoName<T extends { name?: unknown }>(
  items: T[],
  target: string,
): T | null {
  const wanted = normalizeGeoName(target);
  if (!wanted) return null;

  const exact = items.find((item) => normalizeGeoName(item.name) === wanted);
  if (exact) return exact;

  const contains = items.find((item) => {
    const name = normalizeGeoName(item.name);
    if (!name) return false;
    // Se compara por palabras completas para aceptar "San Jose de Cucuta"
    // cuando el checkout manda solo "Cucuta", sin que "San" coincida con
    // "Santander" por accidente.
    return (
      name.startsWith(`${wanted} `) ||
      name.endsWith(` ${wanted}`) ||
      name.includes(` ${wanted} `) ||
      wanted.startsWith(`${name} `) ||
      wanted.endsWith(` ${name}`) ||
      wanted.includes(` ${name} `)
    );
  });
  if (contains) return contains;

  let best: T | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const item of items) {
    const name = normalizeGeoName(item.name);
    if (!name) continue;
    const distance = levenshtein(name, wanted);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = item;
    }
  }

  const tolerance = Math.max(2, Math.floor(wanted.length / 4));
  return best && bestDistance <= tolerance ? best : null;
}

export function parseCarrierQualityOverrides(
  raw: string | undefined,
): Record<string, number> {
  if (!raw?.trim()) return {};

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return {};

    const out: Record<string, number> = {};
    for (const [name, value] of Object.entries(parsed)) {
      const number = toNumber(value);
      if (number === null) continue;
      out[normalizeCarrierKey(name)] = clamp(number, 0, 1);
    }
    return out;
  } catch {
    return {};
  }
}

function deliveryQuality(trayecto: unknown): number {
  const text =
    typeof trayecto === 'string'
      ? trayecto
      : trayecto === undefined || trayecto === null
        ? ''
        : JSON.stringify(trayecto);
  // Solo se interpreta como tiempo si dice "dias/horas" o si es un numero
  // suelto. Un codigo de ruta como "RUTA 123" no debe leerse como 123 dias.
  const match =
    text.match(/(\d+(?:[.,]\d+)?)\s*(?:d[ií]as?|horas?|hours?)/i) ??
    text.match(/^\s*(\d+(?:[.,]\d+)?)\s*$/);
  if (!match) return 0.7;

  const days = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(days)) return 0.7;
  if (days <= 1) return 1;
  if (days <= 3) return 0.9;
  if (days <= 5) return 0.78;
  if (days <= 8) return 0.62;
  return 0.5;
}

function serviceQuality(service: string): number {
  const value = service.toLowerCase();
  if (/(same|mismo|hoy|express|expr[eé]s|next|siguiente|24)/.test(value)) {
    return 1;
  }
  if (/(normal|standard|est[aá]ndar)/.test(value)) return 0.82;
  return 0.78;
}

function carrierQuality(
  carrierName: string,
  overrides: Record<string, number>,
): number {
  const key = normalizeCarrierKey(carrierName);
  return overrides[key] ?? DEFAULT_CARRIER_QUALITY[key] ?? 0.75;
}

/**
 * Normaliza una cotizacion cruda de Dropi.
 *
 * La forma confirmada en el frontend de Dropi es:
 * {
 *   id, name,
 *   objects: { precioEnvio, trayecto, transportadora_service, ... }
 * }
 * Se aceptan tambien variantes anidadas por si Dropi cambia el contrato.
 */
export function toDropiCarrierQuote(
  rawQuote: unknown,
): DropiCarrierQuote | null {
  const quote = asRecord(rawQuote);
  if (!quote) return null;

  const objects = asRecord(quote.objects) ?? {};
  const company =
    asRecord(quote.distributionCompany) ??
    asRecord(quote.distribution_company) ??
    {};

  const error = asText(quote.error);
  if (error) return null;

  // La orden se crea con `distributionCompany`; si el BFF trae tanto ese
  // objeto como un id/nombre en la raiz, manda el objeto anidado.
  const carrierId = toNumber(
    company.id ??
      quote.id ??
      quote.transportadora_id ??
      quote.distribution_company_id ??
      quote.distributionCompanyId,
  );
  const carrierName =
    asText(company.name) ??
    asText(quote.name) ??
    asText(quote.transportadora) ??
    asText(quote.carrier);

  const price = toNumber(
    objects.precioEnvio ??
      objects.precio_envio ??
      objects.price ??
      objects.shipping_amount ??
      objects.shippingAmount ??
      quote.shipping_amount ??
      quote.shippingAmount ??
      quote.price,
  );

  if (
    carrierId === null ||
    carrierId <= 0 ||
    !carrierName ||
    price === null ||
    price <= 0
  ) {
    return null;
  }

  const service =
    asText(objects.transportadora_service) ??
    asText(quote.transportadora_service) ??
    asText(quote.type_service) ??
    'normal';

  return {
    carrierId,
    carrierName,
    service,
    price,
    trayecto: objects.trayecto ?? quote.trayecto ?? null,
    incidenceSolutionMethod:
      asText(objects.incidence_solution_method) ??
      asText(company.incidence_solution_method) ??
      asText(quote.incidence_solution_method),
    notificationsEnabled:
      objects.procesar_notificaciones === true ||
      company.procesar_notificaciones === true ||
      quote.procesar_notificaciones === true,
    raw: quote,
  };
}

/**
 * Elige la cotizacion con mejor relacion precio/calidad.
 *
 * En vez de sumar dos puntajes normalizados (donde el carrier mas caro puede
 * ganar solo por tener la calidad maxima), se calcula un costo ajustado:
 *
 *   costoAjustado = precio * (1 + (pesoCalidad/pesoPrecio) * (1 - calidad))
 *
 * Con los pesos por defecto (55/45), un carrier 20% mas caro necesita una
 * calidad claramente mejor para compensar. El resultado sigue siendo barato,
 * pero no elige la opcion mas economica cuando su calidad es mala.
 */
export function selectBestCarrierQuote(
  rawQuotes: unknown[],
  config: CarrierScoringConfig = {},
): ScoredDropiCarrierQuote | null {
  const priceWeight = clamp(
    config.priceWeight ?? DEFAULT_PRICE_WEIGHT,
    0.05,
    0.95,
  );
  const qualityWeight = clamp(
    config.qualityWeight ??
      (config.priceWeight === undefined
        ? DEFAULT_QUALITY_WEIGHT
        : 1 - priceWeight),
    0.05,
    0.95,
  );
  const minQuality = clamp(config.minQuality ?? DEFAULT_MIN_QUALITY, 0, 1);
  const overrides = config.qualityOverrides ?? {};

  const scored: ScoredDropiCarrierQuote[] = [];
  for (const rawQuote of rawQuotes) {
    const quote = toDropiCarrierQuote(rawQuote);
    if (!quote) continue;

    const base = carrierQuality(quote.carrierName, overrides);
    const delivery = deliveryQuality(quote.trayecto);
    const service = serviceQuality(quote.service);
    const incident =
      quote.incidenceSolutionMethod || quote.notificationsEnabled ? 1 : 0.55;

    const quality = clamp(
      base * 0.7 + delivery * 0.12 + service * 0.12 + incident * 0.06,
      0.35,
      1,
    );
    const adjustedCost =
      quote.price * (1 + (qualityWeight / priceWeight) * (1 - quality));

    scored.push({ ...quote, quality, adjustedCost });
  }

  if (scored.length === 0) return null;

  // Si hay al menos una opcion con calidad aceptable, no se elige una de
  // calidad muy baja solo porque sea mas barata. Si todas son malas, se elige
  // la mejor disponible en vez de fallar la compra.
  const acceptable = scored.filter((quote) => quote.quality >= minQuality);
  const pool = acceptable.length > 0 ? acceptable : scored;

  pool.sort((a, b) => {
    if (a.adjustedCost !== b.adjustedCost) {
      return a.adjustedCost - b.adjustedCost;
    }
    if (a.price !== b.price) return a.price - b.price;
    if (a.quality !== b.quality) return b.quality - a.quality;
    return a.carrierName.localeCompare(b.carrierName);
  });

  return pool[0];
}
