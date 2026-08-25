'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import DOMPurify from 'dompurify';

interface GenerativeUI {
  type: 'product_card' | 'product_carousel' | 'coupon' | 'quick_replies' | 'tracking_update' | 'order_summary';
  data: Record<string, unknown>;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  ui?: GenerativeUI[];
}

interface ProductRecommendation {
  id: string;
  name: string;
  slug: string;
  price: number;
  image?: string;
  stock: number;
  categoryName: string;
}

const WELCOME_MESSAGE: Message = {
  id: 'welcome',
  role: 'assistant',
  content:
    '¡Hola! 👋 Soy **KronioBot**, tu asistente virtual. Puedo ayudarte a encontrar productos, consultar precios, resolver dudas sobre envíos y más. ¿En qué puedo ayudarte hoy?',
};

function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  let sid = localStorage.getItem('kronio_chat_session');
  if (!sid) {
    sid = crypto.randomUUID();
    localStorage.setItem('kronio_chat_session', sid);
  }
  return sid;
}

function getGuestSecret(sid: string): string | undefined {
  if (typeof window === 'undefined' || !sid) return undefined;
  return localStorage.getItem(`kronio_chat_secret_${sid}`) || undefined;
}

function storeGuestSecret(sid: string, secret: string): void {
  if (typeof window === 'undefined' || !sid || !secret) return;
  localStorage.setItem(`kronio_chat_secret_${sid}`, secret);
}

function resetChatIdentity(): void {
  if (typeof window === 'undefined') return;
  const old = localStorage.getItem('kronio_chat_session');
  if (old) {
    localStorage.removeItem(`kronio_chat_secret_${old}`);
  }
  localStorage.removeItem('kronio_chat_session');
}

function useSocket(url: string) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let s: Socket | null = null;

    (async () => {
      const auth: Record<string, string> = {};

      try {
        const res = await fetch('/api/proxy/auth/ws-ticket', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.ticket) auth.ticket = data.ticket;
        }
      } catch {
        // sin ticket → invitado
      }

      if (cancelled) return;

      s = io(`${url}/chat`, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        auth,
      });

      s.on('connect', () => setConnected(true));
      s.on('disconnect', () => setConnected(false));

      setSocket(s);
    })();

    return () => {
      cancelled = true;
      s?.disconnect();
    };
  }, [url]);

  return { socket, connected };
}

function RobotAvatar({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9';
  return (
    <div
      className={`${dim} flex flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-xs font-bold text-white shadow-sm`}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M12 2a2 2 0 0 1 2 2v1a1 1 0 0 1 1 1v1h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3V6a1 1 0 0 1 1-1V4a2 2 0 0 1 2-2zm-3 8H7v2h2v-2zm6 0h-2v2h2v-2zm-6 4H7v2h2v-2zm6 0h-2v2h2v-2zm-5 4h-2v2h2v-2zm4 0h-2v2h2v-2z"/>
      </svg>
    </div>
  );
}

function ProductCard({ product }: { product: ProductRecommendation }) {
  return (
    <a
      href={`/products/${product.slug}`}
      className="flex items-center gap-3 rounded-xl border border-blue-100 bg-white p-3 shadow-sm transition-all hover:border-blue-300 hover:shadow-md"
    >
      {product.image && (
        <img
          src={product.image}
          alt={product.name}
          className="h-14 w-14 flex-shrink-0 rounded-lg object-cover"
          loading="lazy"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">
          {product.name}
        </p>
        <p className="text-sm font-semibold text-blue-600">
          ${product.price.toLocaleString('es-CO')} COP
        </p>
        <p className="text-xs text-gray-500">
          {product.stock > 0 ? (
            <span className="text-green-600">Disponible</span>
          ) : (
            <span className="text-red-500">Agotado</span>
          )}
        </p>
      </div>
    </a>
  );
}

function ProductCarousel({ products }: { products: ProductRecommendation[] }) {
  if (!products || products.length === 0) return null;

  return (
    <div className="mt-1 space-y-2">
      <p className="text-xs font-medium text-gray-500">PRODUCTOS ENCONTRADOS</p>
      <div className="flex flex-col gap-2">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}

function CouponDisplay({ data }: { data: Record<string, unknown> }) {
  const code = data.code as string;
  const discountValue = data.discountValue as number;
  const discountType = data.discountType as string;
  const message = data.message as string;

  if (!code) return null;

  return (
    <div className="mt-2 rounded-xl border border-green-200 bg-green-50 p-3">
      <p className="text-xs font-medium text-green-700">🎉 DESCUENTO OBTENIDO</p>
      <p className="mt-1 text-sm text-green-800">{message || `Usa el código ${code} y obtén ${discountValue}${discountType === 'PERCENTAGE' ? '%' : ' COP'} de descuento`}</p>
      <div className="mt-2 rounded-lg bg-white px-3 py-2 text-center font-mono text-lg font-bold tracking-wider text-green-600 border border-green-300">
        {code}
      </div>
    </div>
  );
}

function StreamingContent({ content }: { content: string }) {
  const sanitized = DOMPurify.sanitize(content, {
    ALLOWED_TAGS: ['strong', 'b', 'em', 'i', 'a', 'br', 'p', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
  });

  return (
    <div
      className="prose prose-sm max-w-none text-gray-800"
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}

function ChatMessage({ message: msg }: { message: Message }) {
  const isUser = msg.role === 'user';

  const renderUI = () => {
    if (!msg.ui) return null;
    return msg.ui.map((ui, i) => {
      if (ui.type === 'product_carousel') {
        const products = ui.data?.products as ProductRecommendation[] | undefined;
        if (products && products.length > 0) {
          return <ProductCarousel key={`ui-${i}`} products={products} />;
        }
      }
      if (ui.type === 'coupon') {
        return <CouponDisplay key={`ui-${i}`} data={ui.data} />;
      }
      return null;
    });
  };

  return (
    <div className="mb-3">
      <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
        {!isUser && <span className="mr-2"><RobotAvatar size="sm" /></span>}
        <div
          className={`max-w-[85%] rounded-2xl px-4 py-2.5 shadow-sm ${
            isUser
              ? 'rounded-br-sm bg-blue-600 text-white'
              : 'rounded-bl-sm border border-gray-100 bg-white text-gray-800'
          }`}
        >
          {isUser ? (
            <p className="text-sm">{DOMPurify.sanitize(msg.content)}</p>
          ) : (
            <>
              {msg.content && <StreamingContent content={msg.content} />}
              {msg.isStreaming && (
                <span className="ml-1 inline-block h-3 w-1.5 animate-pulse bg-blue-500 align-text-bottom" />
              )}
            </>
          )}
        </div>
      </div>
      {!isUser && renderUI()}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="mb-3 flex justify-start">
      <span className="mr-2"><RobotAvatar size="sm" /></span>
      <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm border border-gray-100 bg-white px-4 py-3 shadow-sm">
        <span className="h-2 w-2 animate-bounce rounded-full bg-blue-400" style={{ animationDelay: '0ms' }} />
        <span className="h-2 w-2 animate-bounce rounded-full bg-blue-400" style={{ animationDelay: '150ms' }} />
        <span className="h-2 w-2 animate-bounce rounded-full bg-blue-400" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );
}

function QuickAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full border border-blue-200 bg-blue-50 px-3.5 py-1.5 text-xs font-medium text-blue-700 transition-all hover:border-blue-300 hover:bg-blue-100 active:scale-95"
    >
      {label}
    </button>
  );
}

const QUICK_ACTIONS = [
  '¿Qué productos tienen?',
  '¿Hacen envíos?',
  'Quiero comprar algo',
  'Estado de mi pedido',
];

export default function KronioChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState(() => getSessionId());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';
  const { socket, connected } = useSocket(wsUrl);

  useEffect(() => {
    if (!socket) return;

    socket.on('chat.stream_start', (data: { sessionId: string; guestSecret?: string }) => {
      setSessionId(data.sessionId);
      if (data.guestSecret) storeGuestSecret(data.sessionId, data.guestSecret);
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: '', isStreaming: true },
      ]);
    });

    socket.on('chat.stream', (data: { sessionId: string; content: string }) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.isStreaming) {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...last,
            content: last.content + data.content,
          };
          return updated;
        }
        return prev;
      });
    });

    socket.on('chat.done', (data: { sessionId: string; ui?: GenerativeUI[] }) => {
      setSessionId(data.sessionId);
      setIsLoading(false);
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.isStreaming) {
          const updated = [...prev];
          updated[updated.length - 1] = { ...last, isStreaming: false };
          return updated;
        }
        return prev;
      });

      if (data.ui && data.ui.length > 0) {
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: 'assistant', content: '', ui: data.ui },
        ]);
      }
    });

    socket.on('chat.error', (data: { message: string }) => {
      setIsLoading(false);

      if (data.message.includes('acceso')) {
        resetChatIdentity();
        setSessionId('');
        socket.disconnect().connect();
      }

      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.isStreaming) {
          const updated = [...prev];
          updated[updated.length - 1] = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `❌ ${data.message}`,
          };
          return updated;
        }
        return [
          ...prev,
          { id: crypto.randomUUID(), role: 'assistant', content: `❌ ${data.message}` },
        ];
      });
    });

    return () => {
      socket.off('chat.stream_start');
      socket.off('chat.stream');
      socket.off('chat.done');
      socket.off('chat.error');
    };
  }, [socket]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading || !socket?.connected) return;

      setInput('');
      setIsLoading(true);

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: trimmed,
      };
      setMessages((prev) => [...prev, userMsg]);

      socket.emit('chat.message', {
        message: trimmed,
        sessionId: sessionId || undefined,
        guestId: sessionId || undefined,
        guestSecret: sessionId ? getGuestSecret(sessionId) : undefined,
      });
    },
    [isLoading, socket, sessionId],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleQuickAction = (action: string) => {
    sendMessage(action);
  };

  const toggleChat = () => {
    setIsOpen((prev) => !prev);
    if (!isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {isOpen && (
        <div className="flex h-[600px] w-[380px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl shadow-black/15 sm:h-[520px] sm:w-[360px]">
          <div className="flex items-center justify-between bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 text-white">
            <div className="flex items-center gap-2.5">
<RobotAvatar />
              <div>
                <p className="text-sm font-semibold">KronioBot</p>
                <p className="flex items-center gap-1 text-[11px] text-blue-100">
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${
                      connected ? 'bg-green-400' : 'bg-red-400'
                    }`}
                  />
                  {connected ? 'En línea' : 'Conectando...'}
                </p>
              </div>
            </div>
            <button
              onClick={toggleChat}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-sm transition-colors hover:bg-white/20"
              aria-label="Cerrar chat"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto bg-gray-50/50 p-4">
            {messages.length === 1 && (
              <div className="mb-4">
                <p className="mb-2 text-xs font-medium text-gray-500">
                  ACCIONES RÁPIDAS
                </p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_ACTIONS.map((action) => (
                    <QuickAction
                      key={action}
                      label={action}
                      onClick={() => sendMessage(action)}
                    />
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}

            {isLoading && !messages.some((m) => m.isStreaming) && (
              <TypingIndicator />
            )}

            <div ref={messagesEndRef} />
          </div>

          <form
            onSubmit={handleSubmit}
            className="border-t border-gray-100 bg-white p-3"
          >
            <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5 transition-all focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Escribe un mensaje..."
                className="flex-1 bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400"
                disabled={isLoading}
                maxLength={2000}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading || !connected}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white transition-all hover:bg-blue-700 disabled:opacity-40 disabled:hover:bg-blue-600"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-4 w-4"
                >
                  <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                </svg>
              </button>
            </div>
            <p className="mt-1 text-[10px] text-gray-400">
              Al usar el chat aceptas nuestros{' '}
              <a href="/terminos" className="underline hover:text-gray-600">
                términos
              </a>
            </p>
          </form>
        </div>
      )}

      <button
        onClick={toggleChat}
        className={`flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all hover:scale-105 active:scale-95 ${
          isOpen
            ? 'bg-gray-700 hover:bg-gray-800'
            : 'bg-gradient-to-br from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700'
        }`}
        aria-label={isOpen ? 'Cerrar chat' : 'Abrir chat'}
      >
        {isOpen ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="white"
            className="h-6 w-6"
          >
            <path
              fillRule="evenodd"
              d="M5.47 5.47a.75.75 0 0 1 1.06 0L12 10.94l5.47-5.47a.75.75 0 1 1 1.06 1.06L13.06 12l5.47 5.47a.75.75 0 1 1-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 0 1-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 0 1 0-1.06Z"
              clipRule="evenodd"
            />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="white"
            className="h-7 w-7"
          >
            <path d="M4.913 2.658c2.075-.27 4.19-.408 6.337-.408 2.147 0 4.262.139 6.337.408 1.922.25 3.291 1.861 3.405 3.727a4.403 4.403 0 0 0-1.032-.211 50.89 50.89 0 0 0-8.42 0c-2.358.196-4.04 2.19-4.04 4.434v4.286a4.47 4.47 0 0 0 2.433 3.984L7.28 21.53A.75.75 0 0 1 6 21v-4.03a48.527 48.527 0 0 1-1.087-.128C2.905 16.58 1.5 14.833 1.5 12.862V6.638c0-1.97 1.405-3.718 3.413-3.979Z" />
            <path d="M15.75 7.5c-1.376 0-2.739.057-4.086.169C10.124 7.797 9 9.103 9 10.609v4.285c0 1.507 1.128 2.814 2.67 2.94 1.243.102 2.5.157 3.768.165l2.782 2.782a.75.75 0 0 0 1.28-.53v-2.39l.33-.026c1.542-.125 2.67-1.433 2.67-2.94v-4.286c0-1.505-1.125-2.811-2.664-2.94A49.392 49.392 0 0 0 15.75 7.5Z" />
          </svg>
        )}
      </button>
    </div>
  );
}
