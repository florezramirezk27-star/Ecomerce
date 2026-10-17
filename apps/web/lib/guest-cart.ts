export interface GuestCartItem {
  productId: string;
  name: string;
  price: string | number;
  image: string;
  slug: string;
  quantity: number;
  /**
   * Presentacion elegida (`variation_id` de Dropi). `0`/ausente = producto
   * simple. Dos lineas del mismo producto con distinta presentacion son dos
   * items distintos.
   */
  variationId?: number;
  variationName?: string | null;
}

const GUEST_CART_KEY = "guest_cart";

/** Normaliza la presentacion ausente a 0 para poder comparar lineas. */
function variationOf(item: GuestCartItem): number {
  return item.variationId ?? 0;
}

/** Misma linea = mismo producto Y misma presentacion. */
function isSameLine(
  item: GuestCartItem,
  productId: string,
  variationId: number,
): boolean {
  return item.productId === productId && variationOf(item) === variationId;
}

export function getGuestCart(): GuestCartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(GUEST_CART_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function addToGuestCart(
  item: Omit<GuestCartItem, "quantity"> & { quantity?: number },
): GuestCartItem[] {
  const cart = getGuestCart();
  const variationId = item.variationId ?? 0;
  const existing = cart.find((i) => isSameLine(i, item.productId, variationId));
  if (existing) {
    existing.quantity += item.quantity || 1;
  } else {
    cart.push({ ...item, variationId, quantity: item.quantity || 1 });
  }
  localStorage.setItem(GUEST_CART_KEY, JSON.stringify(cart));
  window.dispatchEvent(new Event("cart-change"));
  return cart;
}

export function removeFromGuestCart(
  productId: string,
  variationId = 0,
): GuestCartItem[] {
  const cart = getGuestCart().filter(
    (i) => !isSameLine(i, productId, variationId),
  );
  localStorage.setItem(GUEST_CART_KEY, JSON.stringify(cart));
  window.dispatchEvent(new Event("cart-change"));
  return cart;
}

export function updateGuestCartQuantity(
  productId: string,
  quantity: number,
  variationId = 0,
): GuestCartItem[] {
  const cart = getGuestCart().map((i) =>
    isSameLine(i, productId, variationId) ? { ...i, quantity } : i,
  );
  localStorage.setItem(GUEST_CART_KEY, JSON.stringify(cart));
  window.dispatchEvent(new Event("cart-change"));
  return cart;
}

export function clearGuestCart() {
  localStorage.removeItem(GUEST_CART_KEY);
  window.dispatchEvent(new Event("cart-change"));
}

export function getGuestCartCount(): number {
  return getGuestCart().reduce(
    (sum, item) => sum + item.quantity,
    0,
  );
}
