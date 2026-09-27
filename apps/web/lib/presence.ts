'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from './admin';

const VISITOR_ID_KEY = 'storefront-visitor-id';
const HEARTBEAT_MS = 30_000;

export interface LiveVisitor {
  visitorId: string;
  firstSeenAt: number;
  lastPath: string;
  referrer: string;
  userId: string | null;
  isReturning: boolean;
}

export interface LiveVisitorsSnapshot {
  online: number;
  registered: number;
  guests: number;
  ttlMs: number;
  heartbeatMs: number;
  source: 'redis' | 'memory';
  recent: LiveVisitor[];
  serverTime: number;
}

const EMPTY_SNAPSHOT: LiveVisitorsSnapshot = {
  online: 0,
  registered: 0,
  guests: 0,
  ttlMs: 90_000,
  heartbeatMs: HEARTBEAT_MS,
  source: 'memory',
  recent: [],
  serverTime: 0,
};

function randomId() {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Id anonimo y estable por navegador. Se guarda en localStorage para que varias
 * pestanas de la misma persona cuenten como un solo visitante en vivo.
 */
export function getVisitorId(): string {
  if (typeof window === 'undefined') return '';

  try {
    const stored = window.localStorage.getItem(VISITOR_ID_KEY);
    if (stored && /^[a-f0-9]{32}$/.test(stored)) return stored;

    const id = randomId();
    window.localStorage.setItem(VISITOR_ID_KEY, id);
    return id;
  } catch {
    return randomId();
  }
}

function sendHeartbeat(path: string) {
  const visitorId = getVisitorId();
  if (!visitorId) return;

  const params = new URLSearchParams({ visitorId, path });
  if (document.referrer) params.set('referrer', document.referrer);

  // keepalive deja que la peticion termine aunque la pestana se este cerrando.
  fetch(`${API_BASE}/presence/heartbeat?${params.toString()}`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    keepalive: true,
  }).catch(() => {});
}

function sendLeave() {
  const visitorId = getVisitorId();
  if (!visitorId) return;

  const params = new URLSearchParams({ visitorId });
  fetch(`${API_BASE}/presence/leave?${params.toString()}`, {
    method: 'DELETE',
    credentials: 'include',
    cache: 'no-store',
    keepalive: true,
  }).catch(() => {});
}

/**
 * Reporta presencia mientras el visitante navega la tienda. No guarda IP, ni
 * user-agent, ni nada identificable: solo un id aleatorio y la ruta visitada.
 */
export function useStorefrontPresence(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    let interval: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    const start = () => {
      sendHeartbeat(window.location.pathname);
      if (!interval) {
        interval = setInterval(() => {
          if (document.visibilityState === 'visible') {
            sendHeartbeat(window.location.pathname);
          }
        }, HEARTBEAT_MS);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        start();
      } else {
        sendLeave();
      }
    };

    start();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', sendLeave);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', sendLeave);
      sendLeave();
    };
  }, [enabled]);
}

const LIVE_POLL_MS = 10_000;

/**
 * Conteo de personas en vivo para el panel admin. Sondea cada 10s y ademas al
 * reenfocar la pestana, que es cuando mas importa que el numero este al dia.
 */
export function useLiveVisitors(pollMs = LIVE_POLL_MS) {
  const [snapshot, setSnapshot] =
    useState<LiveVisitorsSnapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/presence/storefront?limit=12`, {
        credentials: 'include',
        cache: 'no-store',
      });

      if (!response.ok) throw new Error(`API Error: ${response.status}`);

      const data = (await response.json()) as LiveVisitorsSnapshot;
      if (!mounted.current) return;

      setSnapshot(data);
      setUpdatedAt(Date.now());
      setError('');
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : 'Error al cargar visitantes');
    } finally {
      if (!mounted.current) return;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    // load() hace await antes de cualquier setState, no es un render en cascada.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, pollMs);

    const onFocus = () => void load();

    window.addEventListener('focus', onFocus);
    return () => {
      mounted.current = false;
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [load, pollMs]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  return { snapshot, loading, refreshing, error, updatedAt, refresh };
}
