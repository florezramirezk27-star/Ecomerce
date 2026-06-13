"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/auth";
import { API_URL } from "@/lib/api";
import { getGuestCart, removeFromGuestCart, type GuestCartItem } from "@/lib/guest-cart";

interface CartItem {
  id: string;
  quantity: number;
  product: {
    id: string;
    name: string;
    price: string | number;
    image: string;
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
    },
  };
}

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

export default function CartPage() {
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [showCheckout, setShowCheckout] = useState(false);
  const [shippingForm, setShippingForm] = useState({
    shippingName: "",
    shippingPhone: "",
    shippingEmail: "",
    shippingAddress: "",
    shippingCity: "",
    shippingState: "",
    shippingZip: "",
    notes: "",
  });

  useEffect(() => {
    loadCart();
    if (getToken()) loadOrders();
  }, []);

  async function loadCart() {
    const token = getToken();

    if (!token) {
      const guestItems = getGuestCart();
      setItems(guestItems.map((item, i) => guestToCartItem(item, i)));
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/cart`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error("Error loading cart");

      const cart: Cart = await res.json();
      setItems(cart?.items ?? []);
    } catch {
      setMessage({ type: "error", text: "Error al cargar el carrito" });
    } finally {
      setLoading(false);
    }
  }

  async function loadOrders() {
    const token = getToken();
    if (!token) return;

    try {
      const res = await fetch(`${API_URL}/orders/my-orders?page=1&limit=5`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setOrders(data.items ?? []);
      }
    } catch {
      // ignore
    }
  }

  const handleRemoveItem = async (cartItemId: string) => {
    const token = getToken();

    if (!token) {
      const idx = parseInt(cartItemId.replace("guest-", ""), 10);
      const guestItems = getGuestCart();
      if (guestItems[idx]) removeFromGuestCart(guestItems[idx].productId);
      setItems((prev) => prev.filter((item) => item.id !== cartItemId));
      setMessage({ type: "success", text: "Producto removido" });
      setTimeout(() => setMessage(null), 2000);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/cart/${cartItemId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error();
      setItems((prev) => prev.filter((item) => item.id !== cartItemId));
      setMessage({ type: "success", text: "Producto removido" });
      setTimeout(() => setMessage(null), 2000);
    } catch {
      setMessage({ type: "error", text: "Error al remover producto" });
    }
  };

  const handleOpenCheckout = () => {
    const token = getToken();
    if (!token) {
      setMessage({ type: "error", text: "Debes iniciar sesión" });
      return;
    }
    setShippingForm({
      shippingName: "",
      shippingPhone: "",
      shippingEmail: "",
      shippingAddress: "",
      shippingCity: "",
      shippingState: "",
      shippingZip: "",
      notes: "",
    });
    setShowCheckout(true);
  };

  const handleCheckoutSubmit = async () => {
    const token = getToken();
    if (!token) return;

    if (!shippingForm.shippingName || !shippingForm.shippingPhone || !shippingForm.shippingAddress || !shippingForm.shippingCity || !shippingForm.shippingState) {
      setMessage({ type: "error", text: "Completa todos los campos obligatorios" });
      return;
    }

    setCheckoutLoading(true);
    try {
      const res = await fetch(`${API_URL}/orders/checkout`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(shippingForm),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Error al finalizar compra");
      }

      setShowCheckout(false);
      setMessage({ type: "success", text: "✓ Pedido realizado con éxito. Pagarás contra entrega." });
      setItems([]);
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

  if (loading) {
    return (
      <main className="min-h-screen bg-orange-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-gray-600">Cargando carrito...</p>
        </div>
      </main>
    );
  }

  if (!getToken() && items.length === 0) {
    return (
      <main className="min-h-screen bg-orange-50 p-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-8">Carrito</h1>
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <div className="mb-4">
              <svg className="w-16 h-16 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Tu carrito está vacío</h2>
            <p className="text-gray-600 mb-6">Agrega productos para comenzar a comprar</p>
            <Link href="/products" className="inline-block bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 transition">
              Continuar comprando
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-orange-50">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-8">Carrito de compras</h1>

        {message && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}>
            {message.text}
          </div>
        )}

        {!getToken() && items.length > 0 && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-center">
            <p className="text-blue-800 font-medium">Inicia sesión para finalizar tu compra</p>
            <div className="flex gap-3 justify-center mt-2">
              <Link href="/login" className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700 transition">
                Iniciar sesión
              </Link>
              <Link href="/register" className="text-sm bg-white text-blue-600 border border-blue-600 px-4 py-1.5 rounded-lg hover:bg-blue-50 transition">
                Registrarse
              </Link>
            </div>
          </div>
        )}

        {/* Cart items section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            {items.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm p-12 text-center">
                <div className="mb-4">
                  <svg className="w-16 h-16 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Tu carrito está vacío</h2>
                <p className="text-gray-600 mb-6">Agrega productos para comenzar a comprar</p>
                <Link href="/products" className="inline-block bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 transition">
                  Continuar comprando
                </Link>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                <div className="divide-y">
                  {items.map((item) => (
                    <div key={item.id} className="p-6 flex gap-6 hover:bg-orange-50 transition">
                      <div className="flex-shrink-0">
                        <img src={item.product.image} alt={item.product.name} className="w-24 h-24 object-cover rounded-lg bg-gray-100" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg text-gray-900">{item.product.name}</h3>
                        <p className="text-gray-600 mt-1">{Number(item.product.price).toLocaleString("es-CO")} COP</p>
                        <p className="text-sm text-gray-500 mt-2">
                          Cantidad: <span className="font-medium text-gray-900">{item.quantity}</span>
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-4">
                        <p className="font-bold text-lg text-gray-900">
                          {(Number(item.product.price) * item.quantity).toLocaleString("es-CO")} COP
                        </p>
                        <button onClick={() => handleRemoveItem(item.id)} className="text-sm text-red-600 hover:text-red-700 transition">
                          Remover
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {items.length > 0 && (
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow-sm p-6 sticky top-6">
                <h2 className="text-xl font-bold mb-6">Resumen del pedido</h2>

                <div className="space-y-4 pb-6 border-b border-gray-200">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Subtotal ({items.length})</span>
                    <span className="text-gray-900">{totalFormatted}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Envío</span>
                    <span className="text-green-600 font-semibold">Gratis</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Método de pago</span>
                    <span className="text-gray-900 font-medium">Contra entrega</span>
                  </div>
                </div>

                <div className="mt-6 mb-6 flex justify-between text-lg font-bold">
                  <span>Total:</span>
                  <span className="text-blue-600">{totalFormatted}</span>
                </div>

                <button
                  onClick={handleOpenCheckout}
                  disabled={checkoutLoading}
                  className={`w-full py-3 px-4 rounded-lg font-semibold text-white transition ${
                    checkoutLoading
                      ? "bg-gray-400 cursor-not-allowed opacity-75"
                      : "bg-green-600 hover:bg-green-700 active:bg-green-800"
                  }`}
                >
                  {checkoutLoading ? "Procesando..." : "Finalizar compra"}
                </button>

                <Link href="/products" className="block text-center mt-4 text-blue-600 hover:text-blue-700 text-sm">
                  Continuar comprando
                </Link>

                <div className="mt-6 pt-6 border-t border-gray-200 text-xs text-gray-600 space-y-2">
                  <div>✓ Paga cuando recibas</div>
                  <div>✓ Envío gratis</div>
                  <div>✓ Soporte 24/7</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Recent orders section */}
        {getToken() && orders.length > 0 && (
          <div className="mt-12">
            <h2 className="text-2xl font-bold mb-6">Tus pedidos recientes</h2>
            <div className="space-y-4">
              {orders.map((order) => (
                <div key={order.id} className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-200">
                  <div className="p-5 flex justify-between items-center gap-4">
                    <div>
                      <p className="text-sm font-mono text-gray-500">Orden #{order.id.slice(0, 10)}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(order.createdAt).toLocaleDateString("es-CO", {
                          year: "numeric", month: "long", day: "numeric",
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-semibold px-3 py-1 rounded-full ${STATUS_COLORS[order.status] || "bg-gray-100 text-gray-700"}`}>
                        {STATUS_LABELS[order.status] || order.status}
                      </span>
                      <span className="font-bold text-gray-900">
                        {Number(order.total).toLocaleString("es-CO")} COP
                      </span>
                    </div>
                  </div>

                  {order.shippingName && (
                    <div className="border-t border-gray-100 px-5 py-3 bg-gray-50">
                      <p className="text-xs text-gray-600">
                        <span className="font-medium">Enviar a:</span> {order.shippingName} — {order.shippingAddress}, {order.shippingCity}
                      </p>
                    </div>
                  )}

                  <div className="border-t border-gray-100 px-5 py-3 flex gap-4 overflow-x-auto">
                    {order.items.slice(0, 4).map((item) => (
                      <div key={item.id} className="flex-shrink-0 flex items-center gap-2">
                        <img src={item.product.image} alt={item.product.name} className="w-10 h-10 object-cover rounded bg-gray-100" />
                        <span className="text-xs text-gray-600 max-w-[100px] truncate">{item.product.name}</span>
                      </div>
                    ))}
                    {order.items.length > 4 && (
                      <div className="flex-shrink-0 flex items-center text-xs text-gray-400">
                        +{order.items.length - 4} más
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div className="text-center">
                <Link href="/orders" className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                  Ver todos tus pedidos →
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Checkout modal */}
        {showCheckout && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200 flex justify-between items-center">
                <h2 className="text-xl font-bold">Datos de envío</h2>
                <button onClick={() => setShowCheckout(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
              </div>

              <div className="p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo *</label>
                    <input
                      type="text"
                      value={shippingForm.shippingName}
                      onChange={(e) => setShippingForm({ ...shippingForm, shippingName: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      placeholder="Juan Pérez"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono *</label>
                    <input
                      type="tel"
                      value={shippingForm.shippingPhone}
                      onChange={(e) => setShippingForm({ ...shippingForm, shippingPhone: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      placeholder="300 123 4567"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Correo electrónico para la factura</label>
                  <input
                    type="email"
                    value={shippingForm.shippingEmail}
                    onChange={(e) => setShippingForm({ ...shippingForm, shippingEmail: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    placeholder="cliente@correo.com"
                  />
                  <p className="text-xs text-gray-400 mt-1">Si no lo llenas, la factura llega a tu correo registrado</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dirección *</label>
                  <input
                    type="text"
                    value={shippingForm.shippingAddress}
                    onChange={(e) => setShippingForm({ ...shippingForm, shippingAddress: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    placeholder="Calle 123 # 45-67"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ciudad *</label>
                    <input
                      type="text"
                      value={shippingForm.shippingCity}
                      onChange={(e) => setShippingForm({ ...shippingForm, shippingCity: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      placeholder="Bogotá"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Departamento *</label>
                    <input
                      type="text"
                      value={shippingForm.shippingState}
                      onChange={(e) => setShippingForm({ ...shippingForm, shippingState: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      placeholder="Cundinamarca"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Código postal</label>
                    <input
                      type="text"
                      value={shippingForm.shippingZip}
                      onChange={(e) => setShippingForm({ ...shippingForm, shippingZip: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      placeholder="110111"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notas del pedido</label>
                  <textarea
                    value={shippingForm.notes}
                    onChange={(e) => setShippingForm({ ...shippingForm, notes: e.target.value })}
                    rows={3}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                    placeholder="Indicaciones adicionales para la entrega..."
                  />
                </div>

                <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
                  <span className="text-green-600 font-medium text-sm">💵 Pago contra entrega</span>
                  <span className="text-green-700 text-xs">Pagas en efectivo cuando recibas el producto</span>
                </div>
              </div>

              <div className="p-6 border-t border-gray-200 flex justify-between items-center">
                <div>
                  <p className="text-sm text-gray-600">Total a pagar</p>
                  <p className="text-xl font-bold text-blue-600">{totalFormatted}</p>
                </div>
                <button
                  onClick={handleCheckoutSubmit}
                  disabled={checkoutLoading}
                  className={`px-6 py-3 rounded-lg font-semibold text-white transition ${
                    checkoutLoading
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-green-600 hover:bg-green-700"
                  }`}
                >
                  {checkoutLoading ? "Procesando..." : "Confirmar pedido"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
