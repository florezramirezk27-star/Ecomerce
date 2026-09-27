'use client';

import { useEffect, useState } from 'react';
import { Activity, LogIn, RefreshCw, UserRound, Users } from 'lucide-react';
import { timeAgo } from '@/lib/admin';
import { LiveVisitor, useLiveVisitors } from '@/lib/presence';

function pathLabel(path: string) {
  if (!path) return '—';
  if (path === '/') return 'Inicio';
  return path;
}

function initials(visitor: LiveVisitor) {
  if (visitor.userId) return '✓';
  return visitor.visitorId.slice(0, 2).toUpperCase();
}

function LiveDot({ online }: { online: boolean }) {
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0">
      {online && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
      )}
      <span
        className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
          online ? 'bg-emerald-500' : 'bg-slate-300'
        }`}
      />
    </span>
  );
}

export default function LiveVisitorsCard() {
  const { snapshot, loading, refreshing, error, updatedAt, refresh } =
    useLiveVisitors();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  const online = snapshot.online;
  const isLive = online > 0;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/40">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-xl ${
              isLive
                ? 'bg-emerald-50 text-emerald-600'
                : 'bg-slate-100 text-slate-400'
            }`}
          >
            <Users className="h-5 w-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900">
                Personas en la tienda ahora
              </h2>
              <LiveDot online={isLive} />
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {loading
                ? 'Conectando...'
                : isLive
                  ? 'Visitas activas en este momento'
                  : 'Nadie esta navegando la tienda'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {updatedAt && (
            <span className="text-[11px] text-slate-400">
              Actualizado {timeAgo(new Date(updatedAt).toISOString(), now)}
            </span>
          )}
          <button
            onClick={refresh}
            aria-label="Actualizar visitantes en vivo"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:bg-slate-50 hover:text-blue-600"
          >
            <RefreshCw
              className={
                loading || refreshing ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'
              }
            />
          </button>
        </div>
      </div>

      <div className="mt-5 flex items-end gap-3">
        <span className="text-5xl font-bold leading-none text-slate-900">
          {loading ? '—' : online}
        </span>
        <span className="pb-1 text-sm text-slate-500">
          {online === 1 ? 'persona en vivo' : 'personas en vivo'}
        </span>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          No se pudo actualizar: {error}
        </p>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <LogIn className="h-3 w-3" />
            Con cuenta
          </p>
          <p className="mt-1 text-xl font-bold text-slate-900">
            {snapshot.registered}
          </p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <UserRound className="h-3 w-3" />
            Invitados
          </p>
          <p className="mt-1 text-xl font-bold text-slate-900">
            {snapshot.guests}
          </p>
        </div>
      </div>

      {snapshot.recent.length > 0 && (
        <div className="mt-5">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <Activity className="h-3 w-3" />
            Navegando ahora
          </p>
          <ul className="mt-2 space-y-1.5">
            {snapshot.recent.slice(0, 8).map((visitor) => (
              <li
                key={visitor.visitorId}
                className="flex items-center gap-3 rounded-xl px-2 py-1.5"
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold uppercase ${
                    visitor.userId
                      ? 'bg-blue-50 text-blue-600'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {initials(visitor)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-slate-700">
                    {pathLabel(visitor.lastPath)}
                  </span>
                  <span className="block truncate text-[11px] text-slate-400">
                    {visitor.userId
                      ? 'Cliente registrado'
                      : visitor.isReturning
                        ? 'Visitante que ya Volvio'
                        : 'Visita nueva'}
                  </span>
                </span>
                <span className="shrink-0 text-[10px] font-medium text-slate-300">
                  {timeAgo(new Date(visitor.firstSeenAt).toISOString(), now)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 border-t border-slate-100 pt-3 text-[11px] text-slate-400">
        Se descuenta a quien no reporte en {Math.round(snapshot.ttlMs / 1000)}s.
        {snapshot.source === 'memory' &&
          ' Sin REDIS_URL: conteo valido solo para esta instancia de la API.'}
      </p>
    </section>
  );
}
