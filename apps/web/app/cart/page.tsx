"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getUser, isAuthenticated } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { getGuestCart, removeFromGuestCart, updateGuestCartQuantity, type GuestCartItem } from "@/lib/guest-cart";
import { trackMetaEvent } from "@/lib/facebook-pixel";
import { DEPARTMENTS, MUNICIPALITIES } from "@/lib/colombia";

interface CartItem {
  id: string;
  quantity: number;
  product: {
    id: string;
    name: string;
    price: string | number;
    image: string;
    slug: string;
    stock?: number;
  };
}

interface Cart {
  items: CartItem[];
}

interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  price: string | number;
  product: {
    name: string;
    image: string;
  };
}

interface Order {
  id: string;
  status: string;
  total: string | number;
  paymentMethod: string;
  shippingName: string | null;
  shippingAddress: string | null;
  shippingCity: string | null;
  createdAt: string;
  items: OrderItem[];
}

function guestToCartItem(item: GuestCartItem, index: number): CartItem {
  return {
    id: `guest-${index}`,
    quantity: item.quantity,
    product: {
      id: item.productId,
      name: item.name,
      price: item.price,
      image: item.image,
      slug: item.slug || '',
    },
  };
}

const MAX_QUANTITY = 99;

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  PAID: "Pagado",
  SHIPPED: "Enviado",
  DELIVERED: "Entregado",
  CANCELLED: "Cancelado",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700",
  PAID: "bg-blue-100 text-blue-700",
  SHIPPED: "bg-purple-100 text-purple-700",
  DELIVERED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
};

function formatPrice(n: string | number) {
  return Number(n).toLocaleString("es-CO") + " COP";
}

export default function CartPage() {
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [showCheckout, setShowCheckout] = useState(false);
  const idempotencyRef = useRef<string | null>(null);
  const [shippingForm, setShippingForm] = useState({
    shippingName: "",
    shippingPhone: "",
    shippingEmail: "",
    shippingDocType: "CC",
    shippingDocNumber: "",
    shippingAddress: "",
    shippingCity: "",
    shippingState: "",
    shippingZip: "",
    notes: "",
  });

  useEffect(() => {
    loadCart();
    if (isAuthenticated()) loadOrders();
  }, []);

  async function loadCart() {
    if (!isAuthenticated()) {
      const guestItems = getGuestCart();
      setItems(guestItems.map((item, i) => guestToCartItem(item, i)));
      setLoading(false);
      return;
    }

    try {
      const cart = await apiFetch("/cart");
      setItems(cart?.items ?? []);
    } catch {
      setMessage({ type: "error", text: "Error al cargar el carrito" });
    } finally {
      setLoading(false);
    }
  }

  async function loadOrders() {
    if (!isAuthenticated()) return;

    try {
      const data = await apiFetch("/orders/my-orders?page=1&limit=5");
      setOrders(data.items ?? []);
    } catch {
      // ignore
    }
  }

  const handleRemoveItem = async (cartItemId: string) => {
    if (!isAuthenticated()) {
      const idx = parseInt(cartItemId.replace("guest-", ""), 10);
      const guestItems = getGuestCart();
      if (guestItems[idx]) removeFromGuestCart(guestItems[idx].productId);
      setItems((prev) => prev.filter((item) => item.id !== cartItemId));
      setMessage({ type: "success", text: "Producto removido" });
      setTimeout(() => setMessage(null), 2000);
      return;
    }

    try {
      await apiFetch(`/cart/${cartItemId}`, { method: "DELETE" });
      setItems((prev) => prev.filter((item) => item.id !== cartItemId));
      setMessage({ type: "success", text: "Producto removido" });
      setTimeout(() => setMessage(null), 2000);
    } catch {
      setMessage({ type: "error", text: "Error al remover producto" });
    }
  };

  const handleUpdateQuantity = async (cartItemId: string, delta: number) => {
    if (!isAuthenticated()) {
      const idx = parseInt(cartItemId.replace("guest-", ""), 10);
      const guestItems = getGuestCart();
      const guestItem = guestItems[idx];
      if (!guestItem) return;
      const next = Math.min(
        MAX_QUANTITY,
        Math.max(1, guestItem.quantity + delta),
      );
      updateGuestCartQuantity(guestItem.productId, next);
      setItems((prev) =>
        prev.map((item) =>
          item.id === cartItemId ? { ...item, quantity: next } : item,
        ),
      );
      return;
    }

    const item = items.find((i) => i.id === cartItemId);
    if (!item) return;
    const stock = item.product.stock ?? MAX_QUANTITY;
    const next = Math.min(stock, Math.max(1, item.quantity + delta));
    if (next === item.quantity) return;

    try {
      await apiFetch(`/cart/${cartItemId}`, {
        method: "PATCH",
        body: JSON.stringify({ quantity: next }),
      });
      setItems((prev) =>
        prev.map((i) =>
          i.id === cartItemId ? { ...i, quantity: next } : i,
        ),
      );
    } catch (err) {
      setMessage({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Error al actualizar cantidad",
      });
    }
  };

  const handleClearCart = () => {
    if (!isAuthenticated()) {
      items.forEach((item) => {
        const idx = parseInt(item.id.replace("guest-", ""), 10);
        const guestItems = getGuestCart();
        if (guestItems[idx]) removeFromGuestCart(guestItems[idx].productId);
      });
      setItems([]);
      setMessage({ type: "success", text: "Carrito vaciado" });
      setTimeout(() => setMessage(null), 2000);
      return;
    }
    setMessage({ type: "error", text: "Función disponible solo para usuarios registrados" });
  };

  const handleOpenCheckout = () => {
    if (!isAuthenticated()) {
      setMessage({ type: "error", text: "Debes iniciar sesión" });
      return;
    }
    setShippingForm({
      shippingName: "",
      shippingPhone: "",
      shippingEmail: "",
      shippingDocType: "CC",
      shippingDocNumber: "",
      shippingAddress: "",
      shippingCity: "",
      shippingState: "",
      shippingZip: "",
      notes: "",
    });
    setMessage(null);
    void trackMetaEvent("InitiateCheckout", {
      num_items: items.reduce((acc, item) => acc + item.quantity, 0),
      value: items.reduce(
        (acc, item) =>
          acc + Number(item.product.price) * item.quantity,
        0,
      ),
      currency: "COP",
    });
    setShowCheckout(true);
  };

  const handleCheckoutSubmit = async () => {
    if (!isAuthenticated()) return;

    if (
      !shippingForm.shippingName ||
      !shippingForm.shippingPhone ||
      !shippingForm.shippingDocNumber ||
      !shippingForm.shippingAddress ||
      !shippingForm.shippingCity ||
      !shippingForm.shippingState
    ) {
      setMessage({ type: "error", text: "Completa todos los campos obligatorios" });
      return;
    }

    setCheckoutLoading(true);
    try {
      if (!idempotencyRef.current) {
        idempotencyRef.current = crypto.randomUUID();
      }
      const res = await apiFetch("/orders/checkout", {
        method: "POST",
        body: JSON.stringify({ ...shippingForm, idempotencyKey: idempotencyRef.current }),
      });
      idempotencyRef.current = null;

      setShowCheckout(false);

      const dropiStatus = res?.dropi?.success;
      const emailsStatus = res?.emails ?? {};
      const warnings: string[] = [];
      if (dropiStatus === false) {
        warnings.push(`No se envió a Dropi: ${res?.dropi?.message || "error desconocido"}`);
      }
      if (emailsStatus.customer === "failed") {
        warnings.push("No se pudo enviar la factura al cliente por correo.");
      }
      if (emailsStatus.admin === "failed") {
        warnings.push("No se notificó al correo de la tienda (revisa SMTP).");
      }
      setMessage({
        type: "success",
        text: warnings.length > 0
          ? `✓ Pedido realizado. Pagarás contra entrega. Atención: ${warnings.join(" ")}`
          : "✓ Pedido realizado con éxito. Pagarás contra entrega.",
      });
      setItems([]);
      void trackMetaEvent("Purchase", {
        value: items.reduce(
          (acc, item) =>
            acc + Number(item.product.price) * item.quantity,
          0,
        ),
        currency: "COP",
        num_items: items.reduce(
          (acc, item) => acc + item.quantity,
          0,
        ),
        content_ids: items.map((item) => item.product.id),
        email: shippingForm.shippingEmail || getUser()?.email || undefined,
        phone: shippingForm.shippingPhone || undefined,
      });
      await loadOrders();
    } catch (err: unknown) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Error al procesar compra",
      });
    } finally {
      setCheckoutLoading(false);
    }
  };

  const total = items.reduce((acc, item) => acc + Number(item.product.price) * item.quantity, 0);

  const totalFormatted = total.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
  });

  const FREE_SHIPPING_THRESHOLD = 100000;
  const freeShippingProgress = Math.min(100, (total / FREE_SHIPPING_THRESHOLD) * 100);

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-orange-50 to-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-gray-200 border-t-orange-500 rounded-full animate-spin" />
          <p className="text-gray-500">Cargando carrito...</p>
        </div>
      </main>
    );
  }

  if (items.length === 0) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-orange-50 to-white">
        <div className="max-w-4xl mx-auto px-6 py-20">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 text-center">
            <div className="w-20 h-20 mx-auto mb-6 bg-orange-100 rounded-full flex items-center justify-center">
              <svg className="w-10 h-10 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Tu carrito está vacío</h2>
            <p className="text-gray-500 mb-8 max-w-md mx-auto">Agrega productos para comenzar a comprar. Tenemos todo lo que necesitas.</p>
            <Link
              href="/products"
              className="inline-flex items-center gap-2 bg-gray-900 text-white px-8 py-3.5 rounded-xl font-semibold hover:bg-gray-800 transition-all hover:-translate-y-0.5 shadow-lg shadow-gray-900/20"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
              </svg>
              Explorar productos
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">

        {message && !showCheckout && (
          <div className={`mb-6 p-4 rounded-xl text-sm font-medium flex items-center gap-3 ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
              message.type === "success" ? "bg-emerald-200" : "bg-red-200"
            }`}>
              {message.type === "success" ? (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </span>
            {message.text}
          </div>
        )}

        {!isAuthenticated() && items.length > 0 && (
          <div className="mb-8 p-5 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl text-center">
            <p className="text-blue-800 font-semibold">Inicia sesión para finalizar tu compra</p>
            <div className="flex gap-3 justify-center mt-3">
              <Link href="/login" className="text-sm bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 transition font-medium">
                Iniciar sesión
              </Link>
              <Link href="/register" className="text-sm bg-white text-blue-600 border border-blue-600 px-5 py-2 rounded-lg hover:bg-blue-50 transition font-medium">
                Registrarse
              </Link>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Carrito de compras</h1>
          {items.length > 0 && (
            <span className="text-sm text-gray-500 bg-white px-4 py-1.5 rounded-full border border-gray-200">
              {items.length} {items.length === 1 ? "producto" : "productos"}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-100">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-stretch gap-4 sm:gap-6 p-4 sm:p-6 transition hover:bg-orange-50/50"
                  >
                    <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gray-50 rounded-xl overflow-hidden border border-gray-100 shrink-0">
                      <img src={item.product.image} alt={item.product.name} className="w-full h-full object-cover" />
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-center py-0.5">
                      <Link
                        href={`/products/${item.product.slug}`}
                        className="text-sm sm:text-base font-semibold text-gray-900 hover:text-blue-600 transition-colors line-clamp-1 sm:line-clamp-2"
                      >
                        {item.product.name}
                      </Link>
                      <p className="text-xs sm:text-sm text-gray-400 mt-0.5">{formatPrice(item.product.price)} c/u</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <button
                          onClick={() => handleUpdateQuantity(item.id, -1)}
                          className="w-7 h-7 rounded-md border border-gray-300 bg-white hover:bg-gray-100 flex items-center justify-center text-gray-700 text-sm font-bold transition disabled:opacity-40"
                          aria-label="Disminuir cantidad"
                        >
                          −
                        </button>
                        <span className="min-w-7 text-center text-xs font-semibold text-gray-700">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => handleUpdateQuantity(item.id, 1)}
                          className="w-7 h-7 rounded-md border border-gray-300 bg-white hover:bg-gray-100 flex items-center justify-center text-gray-700 text-sm font-bold transition disabled:opacity-40"
                          aria-label="Aumentar cantidad"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col items-end justify-center gap-1 shrink-0">
                      <p className="font-bold text-sm sm:text-base text-gray-900 whitespace-nowrap">
                        {formatPrice(Number(item.product.price) * item.quantity)}
                      </p>
                      <button
                        onClick={() => handleRemoveItem(item.id)}
                        className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Quitar
                      </button>
                    </div>
                  </div>
                ))}

                <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 bg-gray-50/50">
                  <Link href="/products" className="flex items-center gap-2 text-xs sm:text-sm text-gray-500 hover:text-gray-900 transition-colors font-medium">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Seguir comprando
                  </Link>

                  <button
                    onClick={handleClearCart}
                    className="flex items-center gap-1.5 text-xs sm:text-sm text-red-400 hover:text-red-600 transition-colors font-medium"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Vaciar carrito
                  </button>
                </div>
              </div>
            </div>

          {items.length > 0 && (
            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sticky top-6 space-y-5">
                <h2 className="text-lg font-bold text-gray-900">Resumen del pedido</h2>

                {total < FREE_SHIPPING_THRESHOLD && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2-1m0 0l2 1m-2-1v-4a1 1 0 011-1h2a1 1 0 011 1v4m-4 0l4 1m4-1l2 1m-2-1v-4a1 1 0 011-1h2a1 1 0 011 1v4m-4 0l4-1m4 1V6a1 1 0 00-1-1h-7a1 1 0 00-1 1v10" />
                      </svg>
                      <p className="text-xs font-semibold text-amber-800">¡Agrega más productos!</p>
                    </div>
                    <p className="text-xs text-amber-700 mb-2">
                      Te faltan <span className="font-bold">{formatPrice(FREE_SHIPPING_THRESHOLD - total)}</span> para envío gratis
                    </p>
                    <div className="w-full bg-amber-200 rounded-full h-1.5">
                      <div className="bg-amber-500 h-1.5 rounded-full transition-all" style={{ width: `${freeShippingProgress}%` }} />
                    </div>
                  </div>
                )}

                {total >= FREE_SHIPPING_THRESHOLD && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-200 flex items-center justify-center shrink-0">
                      <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-emerald-800">¡Envío gratis confirmado!</p>
                  </div>
                )}

                <div className="space-y-3 pb-5 border-b border-gray-100">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Subtotal</span>
                    <span className="text-gray-900 font-medium">{totalFormatted}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Envío</span>
                    <span className="text-emerald-600 font-semibold">Gratis</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Pago</span>
                    <span className="text-gray-700 font-medium">Contra entrega</span>
                  </div>
                </div>

                <div className="flex justify-between text-lg font-bold">
                  <span className="text-gray-900">Total</span>
                  <span className="text-gray-900">{totalFormatted}</span>
                </div>

                <button
                  onClick={handleOpenCheckout}
                  disabled={checkoutLoading}
                  className={`w-full py-3.5 px-4 rounded-xl font-semibold text-white transition flex items-center justify-center gap-2 ${
                    checkoutLoading
                      ? "bg-gray-300 cursor-not-allowed"
                      : "bg-gray-900 hover:bg-gray-800 active:bg-gray-700 shadow-lg shadow-gray-900/20 hover:-translate-y-0.5"
                  }`}
                >
                  {checkoutLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Procesando...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Finalizar compra
                    </>
                  )}
                </button>

                <div className="pt-4 border-t border-gray-100 space-y-2.5">
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                      <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </span>
                    <span>Paga cuando recibas</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                      <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                      </svg>
                    </span>
                    <span>Envío gratis a todo Colombia</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                      <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                    </span>
                    <span>Soporte 24/7</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {isAuthenticated() && orders.length > 0 && (
          <div className="mt-16">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Tus pedidos recientes</h2>
              <Link href="/orders" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                Ver todos →
              </Link>
            </div>
            <div className="space-y-4">
              {orders.map((order) => (
                <div key={order.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
                  <div className="p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                        <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-mono text-gray-500">#{order.id.slice(0, 12)}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(order.createdAt).toLocaleDateString("es-CO", {
                            year: "numeric", month: "long", day: "numeric",
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${STATUS_COLORS[order.status] || "bg-gray-100 text-gray-700"}`}>
                        {STATUS_LABELS[order.status] || order.status}
                      </span>
                      <span className="font-bold text-gray-900 text-sm">
                        {formatPrice(order.total)}
                      </span>
                    </div>
                  </div>

                  {order.shippingName && (
                    <div className="border-t border-gray-50 px-5 py-3 bg-gray-50/50">
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span><span className="font-medium text-gray-600">Enviar a:</span> {order.shippingName} — {order.shippingAddress}, {order.shippingCity}</span>
                      </div>
                    </div>
                  )}

                  <div className="border-t border-gray-50 px-5 py-3">
                    <div className="flex gap-3 overflow-x-auto scrollbar-none">
                      {order.items.slice(0, 5).map((item) => (
                        <div key={item.id} className="flex-shrink-0 flex items-center gap-2.5 bg-gray-50 rounded-lg px-3 py-2">
                          <img src={item.product.image} alt={item.product.name} className="w-9 h-9 object-cover rounded-lg bg-white" />
                          <span className="text-xs text-gray-600 max-w-[120px] truncate font-medium">{item.product.name}</span>
                        </div>
                      ))}
                      {order.items.length > 5 && (
                        <div className="flex-shrink-0 flex items-center text-xs text-gray-400 font-medium bg-gray-50 rounded-lg px-3">
                          +{order.items.length - 5} más
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {showCheckout && (
          <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/60 backdrop-blur-sm p-4 pt-8 sm:pt-12 overflow-y-auto">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in slide-in-from-bottom-4">
              {/* Header */}
              <div className="relative bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 px-6 sm:px-8 py-6 text-white overflow-hidden">
                <div className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/10" />
                <div className="absolute right-12 bottom-0 h-20 w-20 rounded-full bg-white/10" />
                <div className="relative flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-blue-200">
                      Checkout
                    </p>
                    <h2 className="mt-1 text-2xl font-bold">Datos de env&iacute;o</h2>
                    <p className="mt-1 text-sm text-blue-100">
                      Pago contra entrega &middot; entregas a todo Colombia
                    </p>
                  </div>
                  <button
                    onClick={() => setShowCheckout(false)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white transition hover:bg-white/20"
                    aria-label="Cerrar"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="relative mt-5 flex items-center gap-2">
                  {["Contacto", "Envío", "Pago"].map((step, i) => (
                    <div key={step} className="flex items-center gap-2">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${i < 2 ? "bg-white text-indigo-700" : "bg-white/20 text-white"}`}>
                        {i + 1}
                      </span>
                      <span className="hidden text-xs font-medium sm:block">{step}</span>
                      {i < 2 && <span className="h-px w-6 bg-white/30 sm:w-10" />}
                    </div>
                  ))}
                </div>
              </div>

              {message && (
                <div className={`mx-6 mt-5 mb-0 p-4 rounded-xl text-sm font-medium flex items-center gap-3 ${
                  message.type === "success"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-red-50 text-red-700 border border-red-200"
                }`}>
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                    message.type === "success" ? "bg-emerald-200" : "bg-red-200"
                  }`}>
                    {message.type === "success" ? (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </span>
                  {message.text}
                </div>
              )}

              <div className="px-6 sm:px-8 py-6 space-y-7">
                {/* Contacto */}
                <section>
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-indigo-700">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    Datos de contacto
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">Nombre completo *</label>
                      <input
                        type="text"
                        value={shippingForm.shippingName}
                        onChange={(e) => setShippingForm({ ...shippingForm, shippingName: e.target.value })}
                        className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                        placeholder="Juan Pérez"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">Teléfono *</label>
                      <input
                        type="tel"
                        value={shippingForm.shippingPhone}
                        onChange={(e) => setShippingForm({ ...shippingForm, shippingPhone: e.target.value })}
                        className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                        placeholder="300 123 4567"
                      />
                    </div>
                  </div>
                  <div className="mt-4">
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Correo electrónico</label>
                    <input
                      type="email"
                      value={shippingForm.shippingEmail}
                      onChange={(e) => setShippingForm({ ...shippingForm, shippingEmail: e.target.value })}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                      placeholder="cliente@correo.com"
                    />
                    <p className="mt-1.5 text-xs text-gray-400">
                      Si no lo llenas, la factura llega a tu correo registrado.
                    </p>
                  </div>
                </section>

                {/* Documento */}
                <section className="border-t border-gray-100 pt-6">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-indigo-700">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                    </svg>
                    Documento de identidad
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">Tipo de documento *</label>
                      <select
                        value={shippingForm.shippingDocType}
                        onChange={(e) => setShippingForm({ ...shippingForm, shippingDocType: e.target.value })}
                        className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                      >
                        <option value="CC">Cédula de ciudadanía</option>
                        <option value="CE">Cédula de extranjería</option>
                        <option value="NIT">NIT</option>
                        <option value="PASSPORT">Pasaporte</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">Número de documento *</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={shippingForm.shippingDocNumber}
                        onChange={(e) => setShippingForm({ ...shippingForm, shippingDocNumber: e.target.value.replace(/[^0-9]/g, "") })}
                        className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                        placeholder="1012345678"
                      />
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-gray-400">
                    Lo piden las transportadoras para la entrega y el cobro contra entrega.
                  </p>
                </section>

                {/* Dirección */}
                <section className="border-t border-gray-100 pt-6">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-indigo-700">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Dirección de entrega
                  </h3>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Dirección *</label>
                    <input
                      type="text"
                      value={shippingForm.shippingAddress}
                      onChange={(e) => setShippingForm({ ...shippingForm, shippingAddress: e.target.value })}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                      placeholder="Calle 123 # 45-67, casa / apto 3"
                    />
                  </div>
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">Departamento *</label>
                      <select
                        value={shippingForm.shippingState}
                        onChange={(e) =>
                          setShippingForm({ ...shippingForm, shippingState: e.target.value, shippingCity: "" })
                        }
                        className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                      >
                        <option value="">Selecciona un departamento</option>
                        {DEPARTMENTS.map((d) => (
                          <option key={d.value} value={d.value}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">Ciudad / municipio *</label>
                      <input
                        type="text"
                        list="ciudades-colombia"
                        value={shippingForm.shippingCity}
                        onChange={(e) => setShippingForm({ ...shippingForm, shippingCity: e.target.value })}
                        disabled={!shippingForm.shippingState}
                        className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition disabled:cursor-not-allowed disabled:opacity-60 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                        placeholder={shippingForm.shippingState ? "Ej: Medellín" : "Primero elige el departamento"}
                      />
                      <datalist id="ciudades-colombia">
                        {(MUNICIPALITIES[shippingForm.shippingState] ?? []).map((c) => (
                          <option key={c} value={c} />
                        ))}
                      </datalist>
                    </div>
                  </div>
                  <div className="mt-4">
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">
                      C&oacute;digo postal <span className="font-normal text-gray-400">(opcional)</span>
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={shippingForm.shippingZip}
                      onChange={(e) => setShippingForm({ ...shippingForm, shippingZip: e.target.value.replace(/[^0-9]/g, "") })}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                      placeholder="110111"
                    />
                  </div>
                  <div className="mt-4">
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Notas del pedido</label>
                    <textarea
                      value={shippingForm.notes}
                      onChange={(e) => setShippingForm({ ...shippingForm, notes: e.target.value })}
                      rows={2}
                      className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                      placeholder="Indicaciones adicionales para la entrega..."
                    />
                  </div>
                </section>

                <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 p-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-200">
                    <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">Pago contra entrega</p>
                    <p className="text-sm text-emerald-600">Pagas en efectivo cuando recibas el producto</p>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 bg-gray-50/70 px-6 sm:px-8 py-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <p className="text-sm text-gray-500">
                    Total a pagar <span className="text-gray-400">(contra entrega)</span>
                  </p>
                  <p className="text-2xl font-bold text-gray-900">{totalFormatted}</p>
                </div>
                <button
                  onClick={handleCheckoutSubmit}
                  disabled={checkoutLoading}
                  className={`w-full sm:w-auto px-8 py-3.5 rounded-xl font-semibold text-white transition flex items-center justify-center gap-2 shadow-lg ${
                    checkoutLoading
                      ? "bg-gray-300 cursor-not-allowed shadow-none"
                      : "bg-gradient-to-r from-blue-600 to-indigo-600 shadow-blue-600/25 hover:from-blue-700 hover:to-indigo-700 hover:-translate-y-0.5 active:translate-y-0"
                  }`}
                >
                  {checkoutLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Procesando...
                    </>
                  ) : (
                    <>
                      Confirmar pedido
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
