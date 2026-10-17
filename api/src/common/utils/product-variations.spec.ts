import {
  effectiveStock,
  findProductVariation,
  parseProductVariations,
} from './product-variations';

describe('parseProductVariations', () => {
  it('devuelve lista vacia para JSON nulo (productos simples)', () => {
    expect(parseProductVariations(null)).toEqual([]);
    expect(parseProductVariations(undefined)).toEqual([]);
    expect(parseProductVariations('garbage')).toEqual([]);
  });

  it('normaliza entradas validas', () => {
    const result = parseProductVariations([
      { id: 11, name: 'Talla M / Rojo', stock: 3 },
      { id: 12, name: '  Talla G ', stock: 0 },
    ]);

    expect(result).toEqual([
      { id: 11, name: 'Talla M / Rojo', stock: 3 },
      { id: 12, name: 'Talla G', stock: 0 },
    ]);
  });

  it('descarta entradas sin id valido y pone nombre de respaldo', () => {
    const result = parseProductVariations([
      { id: 0, stock: 5 },
      { name: 'sin id', stock: 5 },
      { stock: 5 },
      { id: '21', stock: 2 },
      { id: 22, stock: -4 },
    ]);

    // id '21' se convierte a 21; stock negativo se clamp a 0.
    expect(result).toEqual([
      { id: 21, name: 'Presentación 21', stock: 2 },
      { id: 22, name: 'Presentación 22', stock: 0 },
    ]);
  });
});

describe('findProductVariation', () => {
  it('devuelve null si no se eligio variacion', () => {
    expect(findProductVariation([{ id: 5 }], 0)).toBeNull();
    expect(findProductVariation([{ id: 5 }], null)).toBeNull();
    expect(findProductVariation([{ id: 5 }], undefined)).toBeNull();
  });

  it('devuelve null si la variacion no existe', () => {
    expect(findProductVariation([{ id: 5 }], 99)).toBeNull();
  });
});

describe('effectiveStock', () => {
  const product = {
    stock: 10,
    variations: [
      { id: 1, stock: 3 },
      { id: 2, stock: 7 },
    ],
  };

  it('usa el stock de la presentacion elegida', () => {
    expect(effectiveStock(product, 1)).toBe(3);
    expect(effectiveStock(product, 2)).toBe(7);
  });

  it('usa el total cuando no hay presentacion elegida', () => {
    expect(effectiveStock(product, 0)).toBe(10);
    expect(effectiveStock({ stock: 10 }, undefined)).toBe(10);
  });

  it('cae al total si la presentacion elegida desaparecio', () => {
    expect(effectiveStock(product, 99)).toBe(10);
  });
});
