import { getProductUnitPrice } from './product-promotion';

const oftalmiel = {
  name: 'Gotas Oftalmiel',
  slug: 'gotas-oftalmiel-adios-cataratas',
  price: 64_900,
};

describe('getProductUnitPrice', () => {
  it.each([
    [1, 64_900],
    [2, 49_950],
    [3, 43_300],
    [4, 43_300],
  ])('applies the Oftalmiel offer for quantity %i', (quantity, price) => {
    expect(getProductUnitPrice(oftalmiel, quantity)).toBe(price);
  });

  it('does not raise a product price to the offer price', () => {
    expect(getProductUnitPrice({ ...oftalmiel, price: 40_000 }, 1)).toBe(
      40_000,
    );
  });

  it('does not change prices for other products', () => {
    expect(
      getProductUnitPrice(
        { name: 'Otro producto', slug: 'otro-producto', price: 80_000 },
        3,
      ),
    ).toBe(80_000);
  });
});
