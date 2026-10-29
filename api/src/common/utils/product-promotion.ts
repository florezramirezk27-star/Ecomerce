import type { Product } from '@prisma/client';

const OFTALMIEL_OFFER_UNIT_PRICES = {
  single: 64_900,
  double: 49_950,
  family: 43_300,
};

export function getProductUnitPrice(
  product: Pick<Product, 'name' | 'slug' | 'price'>,
  quantity: number,
): number {
  const regularPrice = Number(product.price);
  const isOftalmiel = `${product.name} ${product.slug}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .includes('oftalmiel');

  if (!isOftalmiel) return regularPrice;

  const offerPrice =
    quantity >= 3
      ? OFTALMIEL_OFFER_UNIT_PRICES.family
      : quantity >= 2
        ? OFTALMIEL_OFFER_UNIT_PRICES.double
        : OFTALMIEL_OFFER_UNIT_PRICES.single;

  return Math.min(regularPrice, offerPrice);
}
