"use client";

import { usePathname } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useMounted } from "@/lib/useMounted";
import ProductCarousel from "../ProductCarousel";

/**
 * El asistente vive en el layout raiz, asi que sin esto aparece tambien en
 * las pantallas donde no sirve de nada. En login y registro estorba: el
 * visitante esta a punto de dejar sus datos y un boton flotante encima de la
 * esquina compite con el formulario. En la pagina de recuperacion pasa lo
 * mismo. Tampoco se monta en admin ni en dropi, que son paneles de trabajo.
 */
const HIDDEN_PATHS = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/admin",
  "/dropi",
];

function isChatHidden(pathname: string | null): boolean {
  if (!pathname) return false;
  return HIDDEN_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

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
    metadata?: { ui?: GenerativeUI[] } | null;
  }>;
}

export default function StoreChat() {
  const pathname = usePathname();
  // `usePathname()` durante el prerenderizado estatico no es fiable (en Vercel
  // devuelve `null`), asi que el servidor renderiza el boton tambien en rutas
  // donde debe ocultarse y el cliente lo quita, rompiendo la hidratacion. Se
  // monta solo despues de hidratar para que el primer render del cliente
  // coincida con el del servidor.
  const mounted = useMounted();
  const hidden = !mounted || isChatHidden(pathname);
  // En vez de un booleano mas un efecto que lo cierre al navegar, se guarda
  // en QUE ruta se abrio. El panel esta abierto solo si esa ruta sigue siendo
  // la actual, asi que cambiar de pagina lo cierra por comparacion, sin
  // setState dentro de un efecto.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn !== null && openedOn === pathname;
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
  /**
   * Hay una barra fija en la parte baja de la pantalla.
   *
   * La ficha de producto muestra una barra de compra al desplazarse y el
   * carrito una barra con el total y el boton de finalizar. Ambas ocupan el
   * sitio del boton flotante del chat, asi que el boton se aparta mientras
   * haya alguna ahi. El aviso llega con el evento `store:bottom-bar`.
   */
  const [bottomBarVisible, setBottomBarVisible] = useState(false);
  /**
   * El aviso de cookies se fija en la parte baja de la pantalla y es
   * obligatorio decidir antes de seguir. Mientras esta ahi el chat no cabe:
   * su boton quedaria tapado por el aviso. El aviso llega con el evento
   * `store:consent-bar`, que dispara el componente de consentimiento.
   */
  const [consentBarVisible, setConsentBarVisible] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onBottomBarChange(event: Event) {
      const detail = (event as CustomEvent<{ visible?: boolean }>).detail;
      setBottomBarVisible(Boolean(detail?.visible));
    }

    function onConsentBarChange(event: Event) {
      const detail = (event as CustomEvent<{ visible?: boolean }>).detail;
      setConsentBarVisible(Boolean(detail?.visible));
    }

    window.addEventListener("store:bottom-bar", onBottomBarChange);
    window.addEventListener("store:consent-bar", onConsentBarChange);
    return () => {
      window.removeEventListener("store:bottom-bar", onBottomBarChange);
      window.removeEventListener("store:consent-bar", onConsentBarChange);
    };
  }, []);

  /* Avisa a la pagina de que el chat esta abierto.

     Cuando el chat esta abierto, su boton flotante se convierte en el de
     cerrar y vive en la parte baja de la pantalla: es justo donde esta la
     barra de compra de la ficha o la de finalizar compra del carrito. Si
     las dos estan ahi, el boton de cerrar queda debajo de la barra y no se
     puede cerrar el chat. La pagina se aparta mientras el chat esta
     abierto. */
  useEffect(() => {
    function avisar(estado: boolean) {
      window.dispatchEvent(
        new CustomEvent("store:chat-open", { detail: { open: estado } }),
      );
    }

    avisar(open);
    return () => avisar(false);
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, loading]);

  useEffect(() => {
    // En las paginas ocultas no hace falta ni pedir el historial: el chat no
    // se va a montar, asi que la peticion seria trabajo tirado.
    if (!initialSessionId || hidden) return;

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
              ...(item.metadata?.ui
                ? { ui: item.metadata.ui }
                : {}),
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
  }, [initialSessionId, initialGuestSecret, hidden]);

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

  // Va despues de todos los hooks: si se hiciera antes, React se quejaria de
  // que el numero de hooks cambia entre un render y el siguiente cuando se
  // navega de una pagina visible a una oculta.
  if (hidden) return null;

  return (
    <>
      {/* Botón flotante.
          Se oculta mientras haya una barra fija en la parte baja de la
          pantalla (barra de compra de la ficha, barra de finalizar compra
          del carrito) o el aviso de cookies: todas ocupan el mismo sitio y
          se pisarian. El aviso llega con los eventos `store:bottom-bar` y
          `store:consent-bar`.

          Con el chat abierto el boton se conserva aunque haya barra: ese
          boton es el de cerrar, y sin el el chat no se podria cerrar. Las
          barras se apartan solas mientras el chat esta abierto. */}
      {(open || (!bottomBarVisible && !consentBarVisible)) && (
        <button
          type="button"
          onClick={() => setOpenedOn(open ? null : pathname)}
          className="fixed bottom-safe-6 right-4 sm:right-6 z-50 flex h-16 w-16 items-center justify-center rounded-full bg-gray-900 text-white shadow-2xl transition hover:scale-105 hover:bg-gray-800"
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
      )}

      {/* Ventana */}
      {open && !consentBarVisible && (
        /* La altura se calcula con `dvh` y con un tope: antes era una altura
           fija de 600px + 96px de margen inferior, o sea 696px, mas que la
           altura de un iPhone SE (667px). La ventana se salia por arriba y
           tapaba la barra de navegacion. Ahora ocupa como maximo
           `100dvh - 10rem` (160px), de forma que el borde superior nunca
           queda por encima de la barra (64px) ni del borde de la pantalla. */
        <div className="fixed bottom-safe-24 right-4 sm:right-6 z-50 flex h-[min(600px,calc(100dvh-10rem))] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl">
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
                className="min-w-0 flex-1 bg-transparent px-2 py-2 text-base sm:text-sm text-gray-900 outline-none placeholder:text-gray-400"
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
