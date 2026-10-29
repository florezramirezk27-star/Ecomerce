interface PromotionProduct {
  name: string;
  slug: string;
  price: string | number;
}

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
