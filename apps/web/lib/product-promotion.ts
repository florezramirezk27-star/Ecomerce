interface PromotionProduct {
  name: string;
  slug: string;
  price: string | number;
}

/**
 * Precios unitarios de la promocion por cantidad de Aceite de Orégano (COP).
 * Unidad normal: $69.900.
 * - 2 frascos: $109.900 en total -> $54.950 c/u.
 * - 3 frascos: $139.800 en total ("paga 2 y lleva 3") -> $46.600 c/u.
 *
 * Estos totales coinciden con `BULK_TOTALS` de
 * `components/landings/AceiteOreganoLanding.tsx`, asi que el precio que se
 * muestra en la landing es exactamente el que se cobra en el carrito.
 */
const ACEITE_OREGANO_OFFER_UNIT_PRICES = {
  single: 69_900,
  double: 54_950,
  family: 46_600,
};

/**
 * Precios unitarios de la promocion por cantidad de Glucora / Berberina (COP).
 * Unidad normal: $89.900.
 * - 2 frascos: $149.900 en total -> $74.950 c/u.
 * - 3 frascos: "paga 2 y lleva 3" = 2 x $89.900 = $179.800 en total -> ~$59.933 c/u.
 *
 * Coinciden con `BULK_TOTALS` de `components/landings/GlucoraLanding.tsx`.
 */
const GLUCORA_OFFER_UNIT_PRICES = {
  single: 89_900,
  double: 74_950,
  family: 59_933,
};

/**
 * Precios unitarios de la promocion por cantidad de Crema Arbutina TOSOWOONG
 * (COP). Unidad normal: $69.900, el mismo esquema que Aceite de Oregano.
 * - 2 unidades: $109.900 en total -> $54.950 c/u.
 * - 3 unidades: $139.800 en total ("paga 2 y lleva 3") -> $46.600 c/u.
 *
 * Coinciden con `BULK_TOTALS` de
 * `components/landings/ArbutinaLanding.tsx`.
 */
const ARBUTINA_OFFER_UNIT_PRICES = {
  single: 69_900,
  double: 54_950,
  family: 46_600,
};

/**
 * Precios unitarios de la promoción por cantidad de Kit Bisagras Premium
 * Negro (COP).
 * - 4 unidades: $76.000 en total -> $19.000 c/u.
 * - 8 unidades: $150.400 en total -> $18.800 c/u.
 * - 16 unidades: $299.600 en total -> $18.725 c/u.
 *
 * Coinciden con `BULK_TOTALS` de
 * `components/landings/BisagrasLanding.tsx`.
 * Nota: el precio unitario nunca baja de $18.725 (50% del precio sugerido
 * de Dropi: $37.450) para que el proveedor acepte el pedido.
 */
const BISAGRAS_OFFER_UNIT_PRICES = {
  four: 19_000,
  eight: 18_800,
  sixteen: 18_725,
};

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isAceiteOreganoProduct(product: PromotionProduct): boolean {
  return normalize(`${product.name} ${product.slug}`).includes(
    'aceite de oregano',
  );
}

function isGlucoraProduct(product: PromotionProduct): boolean {
  const text = normalize(`${product.name} ${product.slug}`);
  return (
    text.includes('glucora') ||
    text.includes('berberine') ||
    text.includes('berberina')
  );
}

function isArbutinaProduct(product: PromotionProduct): boolean {
  const text = normalize(`${product.name} ${product.slug}`);
  return text.includes('arbutin') || text.includes('tosowoong');
}

function isBisagrasProduct(product: PromotionProduct): boolean {
  const text = normalize(`${product.name} ${product.slug}`);
  return text.includes('bisagra');
}

/**
 * Precio unitario de la promocion por cantidad.
 *
 * Se aplica UNICAMENTE a las lineas que vienen del selector de promociones de
 * la landing (`promotion === true`). Ver `getLineUnitPrice` para el precio que
 * paga cada linea.
 */
export function getProductUnitPrice(
  product: PromotionProduct,
  quantity: number,
): number {
  const regularPrice = Number(product.price);

  if (isAceiteOreganoProduct(product)) {
    const offerPrice =
      quantity >= 3
        ? ACEITE_OREGANO_OFFER_UNIT_PRICES.family
        : quantity >= 2
          ? ACEITE_OREGANO_OFFER_UNIT_PRICES.double
          : ACEITE_OREGANO_OFFER_UNIT_PRICES.single;
    return Math.min(regularPrice, offerPrice);
  }

  if (isGlucoraProduct(product)) {
    const offerPrice =
      quantity >= 3
        ? GLUCORA_OFFER_UNIT_PRICES.family
        : quantity >= 2
          ? GLUCORA_OFFER_UNIT_PRICES.double
          : GLUCORA_OFFER_UNIT_PRICES.single;
    return Math.min(regularPrice, offerPrice);
  }

  if (isArbutinaProduct(product)) {
    const offerPrice =
      quantity >= 3
        ? ARBUTINA_OFFER_UNIT_PRICES.family
        : quantity >= 2
          ? ARBUTINA_OFFER_UNIT_PRICES.double
          : ARBUTINA_OFFER_UNIT_PRICES.single;
    return Math.min(regularPrice, offerPrice);
  }

  if (isBisagrasProduct(product)) {
    const offerPrice =
      quantity >= 16
        ? BISAGRAS_OFFER_UNIT_PRICES.sixteen
        : quantity >= 8
          ? BISAGRAS_OFFER_UNIT_PRICES.eight
          : quantity >= 4
            ? BISAGRAS_OFFER_UNIT_PRICES.four
            : BISAGRAS_OFFER_UNIT_PRICES.four;
    return Math.min(regularPrice, offerPrice);
  }

  const isOftalmiel = normalize(`${product.name} ${product.slug}`).includes(
    'oftalmiel',
  );

  if (!isOftalmiel) return regularPrice;

  const offerPrice = quantity >= 3 ? 43_300 : quantity >= 2 ? 49_950 : 64_900;
  return Math.min(regularPrice, offerPrice);
}

/**
 * Precio unitario que cobra una linea del carrito o del pedido.
 *
 * - `promotion === true`: la linea salio del selector de promociones de la
 *   landing, asi que cobra el precio de oferta por cantidad (2 frascos =
 *   $99.900 en total, 3 = $129.900).
 * - en cualquier otro caso: el precio normal del producto por la cantidad que
 *   el cliente pida, sin descuento. Antes el precio de oferta se aplicaba por
 *   cantidad sola, asi que quien compraba 2 frascos desde la ficha pagaba
 *   $99.900 aunque nunca hubiera visto la promocion.
 */
export function getLineUnitPrice(
  product: PromotionProduct,
  quantity: number,
  promotion: boolean | null | undefined,
): number {
  if (promotion) return getProductUnitPrice(product, quantity);
  return Number(product.price);
}
