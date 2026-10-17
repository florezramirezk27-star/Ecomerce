/**
 * Lectura de las presentaciones (variaciones) de un producto de Dropi.
 *
 * Se guardan como JSON en `Product.variations` en vez de una tabla propia: la
 * tienda solo necesita listarlas en la ficha y validarlas al agregar al carrito,
 * no editarlas campo por campo. Aqui se define como leerlas sin regar `any`.
 */

export interface ProductVariation {
  /** `variation_id` de Dropi: es el que se manda al crear la orden. */
  id: number;
  name: string;
  stock: number;
}

/**
 * Normaliza cualquier cosa guardada en la columna JSON a una lista usable.
 *
 * Un `Json` de Prisma es `null` para las filas que no tienen presentaciones y
 * podria contener basura si se escribio a mano. Se ignora lo que no se parezca a
 * `{ id, name, stock }` y se descartan las entradas sin `id` valido, porque
 * `id` es lo que se le pide a Dropi: sin el, la variante no se puede pedir.
 */
export function parseProductVariations(raw: unknown): ProductVariation[] {
  if (!Array.isArray(raw)) return [];

  const out: ProductVariation[] = [];
  for (const entry of raw as unknown[]) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;

    const id = Number(record.id);
    if (!Number.isInteger(id) || id <= 0) continue;

    const name = typeof record.name === 'string' ? record.name.trim() : '';
    const stock = Number(record.stock);

    out.push({
      id,
      name: name || `Presentación ${id}`,
      stock: Number.isFinite(stock) && stock > 0 ? stock : 0,
    });
  }
  return out;
}

/**
 * Busca la presentacion elegida. `variationId` es `0`/`undefined` cuando no se
 * eligio ninguna (producto simple), por eso no se filtra antes.
 */
export function findProductVariation(
  raw: unknown,
  variationId: number | null | undefined,
): ProductVariation | null {
  if (!variationId) return null;
  return parseProductVariations(raw).find((v) => v.id === variationId) ?? null;
}

/**
 * Stock disponible para lo que el cliente elegio.
 *
 * - Con presentacion elegida manda la de ella: el stock total de la ficha seria
 *   la suma de todas y dejaria vender la variante que se agoto.
 * - Sin presentacion (producto simple, o fichas que agregan al carrito sin
 *   elegir) manda `product.stock`, que ya es el total.
 */
export function effectiveStock(
  product: { stock: number; variations?: unknown },
  variationId: number | null | undefined,
): number {
  const variation = findProductVariation(product.variations, variationId);
  return variation ? variation.stock : product.stock;
}
