"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import ProductCarousel from "../ProductCarousel";

interface Product {
  id: string;
  name: string;
  slug: string;
  price: string | number;
  image: string;
  gallery?: string[];
  stock?: number;
  oldPrice?: string | number;
  categoryName?: string;
  category?: {
    id: string;
    name: string;
    slug: string;
  };
}

interface GenerativeUI {
  type:
    | "product_card"
    | "product_carousel"
    | "quick_replies"
    | "tracking_update"
    | "order_summary";
  data: Record<string, unknown>;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  ui?: GenerativeUI[];
}

interface ChatResponse {
  sessionId: string;
  response: string;
  ui?: GenerativeUI[];
}

interface ChatHistoryResponse {
  sessionId: string;
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
  }>;
}

export default function StoreChat() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [initialSessionId] = useState<string | null>(() =>
    typeof window !== "undefined"
      ? localStorage.getItem("store-chat-session")
      : null
  );
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const [initialGuestId] = useState<string | null>(() =>
    typeof window !== "undefined"
      ? localStorage.getItem("store-chat-guest-id")
      : null
  );
  const [guestId, setGuestId] = useState<string | null>(initialGuestId);
  const [initialGuestSecret] = useState<string | null>(() =>
    typeof window !== "undefined"
      ? localStorage.getItem("store-chat-guest-secret")
      : null
  );
  const [guestSecret, setGuestSecret] = useState<string | null>(
    initialGuestSecret
  );
  const [loading, setLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, loading]);

  useEffect(() => {
    if (!initialSessionId) return;

    let cancelled = false;

    (async () => {
      try {
        const data = (await apiFetch(
          `/chat/history?sessionId=${encodeURIComponent(initialSessionId)}`,
          {
            ...(initialGuestSecret
              ? { headers: { "x-guest-secret": initialGuestSecret } }
              : {}),
          }
        )) as ChatHistoryResponse;

        if (cancelled) return;

        setMessages(
          data.messages
            .filter(
              (item) =>
                item.role === "user" ||
                item.role === "assistant"
            )
            .map((item) => ({
              id: item.id,
              role: item.role,
              content: item.content,
            }))
        );
      } catch (error) {
        if (cancelled) return;

        console.error("Error cargando historial del chat:", error);

        localStorage.removeItem("store-chat-session");
        localStorage.removeItem("store-chat-guest-id");
        localStorage.removeItem("store-chat-guest-secret");
        setSessionId(null);
        setGuestId(null);
        setGuestSecret(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialSessionId, initialGuestSecret]);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();

    const text = message.trim();

    if (!text || loading) {
      return;
    }

    const temporaryId = `user-${Date.now()}`;

    setMessages((previous) => [
      ...previous,
      {
        id: temporaryId,
        role: "user",
        content: text,
      },
    ]);

    setMessage("");
    setLoading(true);

    try {
      const currentGuestId =
        guestId ??
        (typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `guest-${Date.now()}-${Math.random().toString(36).slice(2)}`);

      if (!guestId) {
        setGuestId(currentGuestId);
        localStorage.setItem("store-chat-guest-id", currentGuestId);
      }

      const data = (await apiFetch("/chat/message", {
        method: "POST",
        body: JSON.stringify({
          message: text,
          ...(sessionId ? { sessionId } : {}),
          guestId: currentGuestId,
          ...(guestSecret ? { guestSecret } : {}),
        }),
      })) as ChatResponse & {
        guestSecret?: string;
        userId?: string | null;
      };

      if (data.sessionId) {
        setSessionId(data.sessionId);
        localStorage.setItem(
          "store-chat-session",
          data.sessionId
        );
      }

      if (data.guestSecret) {
        setGuestSecret(data.guestSecret);
        localStorage.setItem(
          "store-chat-guest-secret",
          data.guestSecret
        );
      }

      setMessages((previous) => [
        ...previous,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: data.response,
          ui: data.ui,
        },
      ]);
    } catch (error) {
      console.error("Error enviando mensaje:", error);

      setMessages((previous) => [
        ...previous,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content:
            "Lo siento 😔. Ocurrió un problema al procesar tu mensaje. Intenta nuevamente.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function clearChat() {
    localStorage.removeItem("store-chat-session");
    localStorage.removeItem("store-chat-guest-id");
    localStorage.removeItem("store-chat-guest-secret");
    setSessionId(null);
    setGuestId(null);
    setGuestSecret(null);
    setMessages([]);
  }

  return (
    <>
      {/* Botón flotante */}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="fixed bottom-6 right-6 z-50 flex h-16 w-16 items-center justify-center rounded-full bg-gray-900 text-white shadow-2xl transition hover:scale-105 hover:bg-gray-800"
        aria-label="Abrir asistente"
      >
        {open ? (
          <svg
            className="h-7 w-7"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              d="M6 6l12 12M18 6L6 18"
            />
          </svg>
        ) : (
          <svg
            className="h-7 w-7"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 10h8M8 14h5"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20 11.5a7.5 7.5 0 01-7.5 7.5H8l-4 2v-5.5A7.5 7.5 0 0111.5 4h1A7.5 7.5 0 0120 11.5z"
            />
          </svg>
        )}
      </button>

      {/* Ventana */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[600px] w-[380px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between bg-gray-900 px-5 py-4 text-white">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10">
                  🤖
                </div>

                <div>
                  <h2 className="font-bold">
                    Asistente de tienda
                  </h2>

                  <p className="text-xs text-gray-300">
                    Estamos aquí para ayudarte
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={clearChat}
              className="rounded-lg px-2 py-1 text-xs text-gray-300 transition hover:bg-white/10 hover:text-white"
            >
              Limpiar
            </button>
          </div>

          {/* Mensajes */}
          <div className="flex-1 space-y-4 overflow-y-auto bg-gray-50 p-4">
            {messages.length === 0 && (
              <div className="flex h-full items-center justify-center">
                <div className="max-w-[280px] text-center">
                  <div className="mb-4 text-5xl">
                    👋
                  </div>

                  <h3 className="mb-2 text-lg font-bold text-gray-900">
                    ¡Hola!
                  </h3>

                  <p className="text-sm leading-relaxed text-gray-500">
                    Soy tu asistente virtual. Puedo ayudarte a
                    encontrar productos, consultar precios y
                    resolver tus dudas.
                  </p>
                </div>
              </div>
            )}

            {messages.map((item) => (
              <div
                key={item.id}
                className={`flex ${
                  item.role === "user"
                    ? "justify-end"
                    : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[90%] ${
                    item.role === "user"
                      ? "rounded-2xl rounded-br-md bg-gray-900 text-white px-4 py-3"
                      : ""
                  }`}
                >
                  {/* Mensaje de texto */}
                  {item.content && (
                    <div
                      className={
                        item.role === "assistant"
                          ? "rounded-2xl rounded-bl-md border border-gray-200 bg-white px-4 py-3 text-sm leading-relaxed text-gray-800 shadow-sm"
                          : "text-sm leading-relaxed"
                      }
                    >
                      {item.content}
                    </div>
                  )}

                  {/* Productos */}
                  {item.ui?.map((ui, index) => {
                    if (ui.type !== "product_carousel") {
                      return null;
                    }

                    const products = (ui.data.products as Product[] | undefined) ?? [];

                    if (products.length === 0) {
                      return null;
                    }

                    return (
                      <div
                        key={`${item.id}-ui-${index}`}
                        className="mt-3"
                      >
                        <ProductCarousel products={products} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-md border border-gray-200 bg-white px-4 py-3 shadow-sm">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400" />
                    <span
                      className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
                      style={{ animationDelay: "150ms" }}
                    />
                    <span
                      className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
                      style={{ animationDelay: "300ms" }}
                    />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form
            onSubmit={sendMessage}
            className="border-t border-gray-200 bg-white p-3"
          >
            <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 p-2 focus-within:border-gray-400">
              <input
                value={message}
                onChange={(event) =>
                  setMessage(event.target.value)
                }
                disabled={loading}
                placeholder="Escribe tu mensaje..."
                className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400"
              />

              <button
                type="submit"
                disabled={!message.trim() || loading}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-900 text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Enviar mensaje"
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M22 2L11 13"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M22 2l-7 20-4-9-9-4 20-7z"
                  />
                </svg>
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
