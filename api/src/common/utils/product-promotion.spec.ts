import { getLineUnitPrice, getProductUnitPrice } from './product-promotion';

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

  it.each([
    [1, 69_900],
    [2, 54_950],
    [3, 46_600],
    [4, 46_600],
  ])('applies the Arbutina offer for quantity %i', (quantity, price) => {
    const arbutina = {
      name: 'CREMA ARBUTINA TOSOWOONG',
      slug: 'crema-arbutina-tosowoong',
      price: 69_900,
    };
    expect(getProductUnitPrice(arbutina, quantity)).toBe(price);
  });
});

describe('getLineUnitPrice', () => {
  it('applies the offer only to lines that chose the promotion', () => {
    expect(getLineUnitPrice(oftalmiel, 2, true)).toBe(49_950);
    expect(getLineUnitPrice(oftalmiel, 3, true)).toBe(43_300);
  });

  it('charges the regular price per unit when the line did not choose it', () => {
    // Quien compra 2 o 3 frascos desde la ficha paga precio normal por
    // unidad, aunque la landing ofrezca ese mismo descuento por cantidad.
    expect(getLineUnitPrice(oftalmiel, 1, false)).toBe(64_900);
    expect(getLineUnitPrice(oftalmiel, 2, false)).toBe(64_900);
    expect(getLineUnitPrice(oftalmiel, 3, false)).toBe(64_900);
  });

  it('treats a missing flag as a regular purchase', () => {
    expect(getLineUnitPrice(oftalmiel, 2, undefined)).toBe(64_900);
    expect(getLineUnitPrice(oftalmiel, 2, null)).toBe(64_900);
  });

  it('keeps non-Oftalmiel products at their own price', () => {
    const otro = {
      name: 'Otro producto',
      slug: 'otro-producto',
      price: 80_000,
    };
    expect(getLineUnitPrice(otro, 2, true)).toBe(80_000);
    expect(getLineUnitPrice(otro, 2, false)).toBe(80_000);
  });

  it('never raises a product price above its own', () => {
    const barato = { ...oftalmiel, price: 40_000 };
    expect(getLineUnitPrice(barato, 2, true)).toBe(40_000);
    expect(getLineUnitPrice(barato, 2, false)).toBe(40_000);
  });
});
