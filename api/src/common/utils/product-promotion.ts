import type { Product } from '@prisma/client';

const OFTALMIEL_OFFER_UNIT_PRICES = {
  single: 64_900,
  double: 49_950,
  family: 43_300,
};

/**
 * Precios unitarios de la promocion por cantidad de Aceite de Orégano (COP).
 * Unidad normal: $69.900.
 * - 2 frascos: $109.900 en total -> $54.950 c/u.
 * - 3 frascos: $139.800 en total ("paga 2 y lleva 3") -> $46.600 c/u.
 *
 * Coinciden con `BULK_TOTALS` de
 * `apps/web/components/landings/AceiteOreganoLanding.tsx`, asi que el precio
 * que se muestra en la landing es exactamente el que se cobra en el carrito.
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
 * Coinciden con `BULK_TOTALS` de `apps/web/components/landings/GlucoraLanding.tsx`.
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
 * `apps/web/components/landings/ArbutinaLanding.tsx`.
 */
const ARBUTINA_OFFER_UNIT_PRICES = {
  single: 69_900,
  double: 54_950,
  family: 46_600,
};

/**
 * Precios unitarios de la promocion por cantidad de Kit Bisagras Premium
 * Negro (COP).
 * - 4 unidades: $64.900 en total -> $16.225 c/u. (precio sugerido de Dropi ID 2414445)
 * - 8 unidades: $74.900 en total -> $9.362 c/u. (precio sugerido de Dropi ID 2414444)
 * - 16 unidades: $139.900 en total -> ~$8.744 c/u.
 *
 * Coinciden con `BULK_TOTALS` de
 * `apps/web/components/landings/BisagrasLanding.tsx`.
 *
 * Nota: Dropi rechaza precios de venta menores al 50% del precio sugerido.
 * Estos totales coinciden con el precio sugerido de Dropi para los packs de 4
 * y 8, por lo que el proveedor acepta el pedido.
 */
const BISAGRAS_OFFER_UNIT_PRICES = {
  four: 16_225,
  eight: 9_362,
  sixteen: 8_744,
};

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isAceiteOreganoProduct(product: PricedProduct): boolean {
  return normalize(`${product.name} ${product.slug}`).includes(
    'aceite de oregano',
  );
}

function isGlucoraProduct(product: PricedProduct): boolean {
  const text = normalize(`${product.name} ${product.slug}`);
  return (
    text.includes('glucora') ||
    text.includes('berberine') ||
    text.includes('berberina')
  );
}

function isArbutinaProduct(product: PricedProduct): boolean {
  const text = normalize(`${product.name} ${product.slug}`);
  return text.includes('arbutin') || text.includes('tosowoong');
}

function isBisagrasProduct(product: PricedProduct): boolean {
  const text = normalize(`${product.name} ${product.slug}`);
  return text.includes('bisagra');
}

/**
 * Producto con lo justo para calcular el precio.
 *
 * `price` acepta tambien numeros y strings ademas del `Decimal` de Prisma:
 * los precios salen de la base de datos como `Decimal`, pero las pruebas y
 * algunos llamadores tienen el precio como numero. `Number()` normaliza los
 * tres casos por igual.
 */
type PricedProduct = Pick<Product, 'name' | 'slug'> & {
  price: Product['price'] | number | string;
};

/**
 * Precio unitario de la promocion por cantidad.
 *
 * Se aplica UNICAMENTE a las lineas marcadas con `promotion` (las que salen
 * del selector de promociones de la landing). Ver `getLineUnitPrice`.
 */
export function getProductUnitPrice(
  product: PricedProduct,
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

  const offerPrice =
    quantity >= 3
      ? OFTALMIEL_OFFER_UNIT_PRICES.family
      : quantity >= 2
        ? OFTALMIEL_OFFER_UNIT_PRICES.double
        : OFTALMIEL_OFFER_UNIT_PRICES.single;

  return Math.min(regularPrice, offerPrice);
}

/**
 * Precio unitario que cobra una linea del carrito o del pedido.
 *
 * - `promotion === true`: la linea salio del selector de promociones de la
 *   landing y cobra el precio de oferta por cantidad (2 frascos = $99.900 en
 *   total, 3 = $129.900).
 * - en cualquier otro caso: el precio normal del producto por la cantidad que
 *   el cliente pida, sin descuento.
 *
 * Antes el precio de oferta se aplicaba por cantidad sola: quien compraba 2
 * frascos desde la ficha del producto pagaba $99.900 aunque nunca hubiera visto
 * la promocion.
 */
export function getLineUnitPrice(
  product: PricedProduct,
  quantity: number,
  promotion: boolean | null | undefined,
): number {
  if (promotion) return getProductUnitPrice(product, quantity);
  return Number(product.price);
}
