"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isAuthenticated } from "@/lib/auth";
import { apiFetch } from "@/lib/api";

interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  price: string | number;
  product: {
    name: string;
    image: string;
    price: string | number;
  };
}

interface Order {
  id: string;
  status: "PENDING" | "PAID" | "SHIPPED" | "DELIVERED" | "CANCELLED";
  total: string | number;
  createdAt: string;
  items: OrderItem[];
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    loadOrders();
  }, [page]);

  async function loadOrders() {
    if (!isAuthenticated()) {
      setLoading(false);
      return;
    }

    try {
      const data = await apiFetch(
        `/orders/my-orders?page=${page}&limit=20`,
      );

      if (data.items) {
        setOrders(data.items);
        setTotalPages(data.totalPages);
      } else {
        setOrders(data || []);
      }
    } catch (err) {
      setError("Error al cargar las órdenes");
    } finally {
      setLoading(false);
    }
  }

  const getStatusColor = (
    status: Order["status"],
  ) => {
    const colors: Record<
      Order["status"],
      {
        bg: string;
        text: string;
        badge: string;
        icon: string;
      }
    > = {
      PENDING: {
        bg: "bg-yellow-50",
        text: "text-yellow-700",
        badge: "bg-yellow-100",
        icon: "⏳",
      },
      PAID: {
        bg: "bg-blue-50",
        text: "text-blue-700",
        badge: "bg-blue-100",
        icon: "✓",
      },
      SHIPPED: {
        bg: "bg-purple-50",
        text: "text-purple-700",
        badge: "bg-purple-100",
        icon: "📦",
      },
      DELIVERED: {
        bg: "bg-green-50",
        text: "text-green-700",
        badge: "bg-green-100",
        icon: "✓✓",
      },
      CANCELLED: {
        bg: "bg-red-50",
        text: "text-red-700",
        badge: "bg-red-100",
        icon: "✗",
      },
    };
    return colors[status];
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      PENDING: "Pendiente",
      PAID: "Pagado",
      SHIPPED: "Enviado",
      DELIVERED: "Entregado",
      CANCELLED: "Cancelado",
    };
    return labels[status] || status;
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-orange-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-gray-600">
            Cargando órdenes...
          </p>
        </div>
      </main>
    );
  }

  if (!isAuthenticated()) {
    return (
      <main className="min-h-screen bg-orange-50 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-8 text-center">
            <h1 className="text-2xl font-bold text-blue-900 mb-2">
              Inicia sesión
            </h1>
            <p className="text-blue-700 mb-6">
              Necesitas una cuenta para ver tus órdenes
            </p>
            <Link
              href="/login"
              className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              Iniciar sesión
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-orange-50 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-8">
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      </main>
    );
  }

  if (orders.length === 0) {
    return (
      <main className="min-h-screen bg-orange-50 p-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-8">
            Mis órdenes
          </h1>

          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <div className="mb-4">
              <svg
                className="w-16 h-16 mx-auto text-gray-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              No tienes órdenes aún
            </h2>
            <p className="text-gray-600 mb-6">
              Realiza tu primera compra hoy
            </p>
            <Link
              href="/products"
              className="inline-block bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 transition"
            >
              Ver productos
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-orange-50">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-8">
          Mis órdenes
        </h1>

        <div className="space-y-6">
          {orders.map((order) => {
            const statusColor = getStatusColor(
              order.status,
            );

            return (
              <div
                key={order.id}
                className={`${statusColor.bg} border border-gray-200 rounded-lg overflow-hidden transition hover:shadow-md`}
              >
                {/* Header */}
                <div className="p-6 flex justify-between items-start md:items-center gap-4">
                  <div>
                    <p className="text-sm font-mono text-gray-600">
                      Orden #{order.id.slice(0, 12)}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      {new Date(
                        order.createdAt,
                      ).toLocaleDateString("es-CO", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>

                  <span
                    className={`${statusColor.badge} ${statusColor.text} text-sm font-semibold px-4 py-2 rounded-full inline-flex items-center gap-2`}
                  >
                    <span className="text-lg">
                      {statusColor.icon}
                    </span>
                    {getStatusLabel(order.status)}
                  </span>
                </div>

                {/* Items */}
                <div className="border-t border-gray-200 px-6 py-4">
                  <h3 className="font-semibold text-gray-900 mb-4">
                    Productos ({order.items.length})
                  </h3>

                  <div className="space-y-3">
                    {order.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start gap-4 pb-3 border-b border-gray-200 last:border-b-0 last:pb-0"
                      >
                        <img
                          src={item.product.image}
                          alt={item.product.name}
                          className="w-16 h-16 object-cover rounded bg-white"
                        />

                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">
                            {item.product.name}
                          </p>
                          <p className="text-sm text-gray-600">
                            Cantidad: {item.quantity}
                          </p>
                        </div>

                        <p className="font-semibold text-gray-900 text-right flex-shrink-0">
                          {(
                            Number(item.price) *
                            item.quantity
                          ).toLocaleString("es-CO")} COP
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer */}
                <div className="border-t border-gray-200 bg-white bg-opacity-50 px-6 py-4 flex justify-between items-center">
                  <p className="text-sm text-gray-600">
                    Total del pedido
                  </p>
                  <p className="text-2xl font-bold text-gray-900">
                    {Number(order.total).toLocaleString(
                      "es-CO",
                    )} COP
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {orders.length > 0 && (
          <div className="mt-8 flex flex-col items-center gap-4">
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Anterior
                </button>
                <span className="text-sm text-gray-600">
                  Página {page} de {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Siguiente
                </button>
              </div>
            )}
            <Link
              href="/products"
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              Continuar comprando →
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
