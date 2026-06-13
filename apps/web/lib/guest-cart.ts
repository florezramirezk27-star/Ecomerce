export interface GuestCartItem {
  productId: string;
  name: string;
  price: string | number;
  image: string;
  quantity: number;
}

const GUEST_CART_KEY = "guest_cart";

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
  const existing = cart.find(
    (i) => i.productId === item.productId,
  );
  if (existing) {
    existing.quantity += item.quantity || 1;
  } else {
    cart.push({ ...item, quantity: item.quantity || 1 });
  }
  localStorage.setItem(GUEST_CART_KEY, JSON.stringify(cart));
  window.dispatchEvent(new Event("cart-change"));
  return cart;
}

export function removeFromGuestCart(
  productId: string,
): GuestCartItem[] {
  const cart = getGuestCart().filter(
    (i) => i.productId !== productId,
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
