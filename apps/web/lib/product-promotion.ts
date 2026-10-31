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
