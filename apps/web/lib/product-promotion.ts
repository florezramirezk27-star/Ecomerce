interface PromotionProduct {
  name: string;
  slug: string;
  price: string | number;
}

/**
 * Precio unitario de la promocion por cantidad (solo Oftalmiel).
 *
 * Se aplica UNICAMENTE a las lineas que vienen del selector de promociones de
 * la landing. Ver `getLineUnitPrice` para el precio que paga cada linea.
 */
export function getProductUnitPrice(
  product: PromotionProduct,
  quantity: number,
): number {
  const regularPrice = Number(product.price);
  const isOftalmiel = `${product.name} ${product.slug}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .includes('oftalmiel');

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
