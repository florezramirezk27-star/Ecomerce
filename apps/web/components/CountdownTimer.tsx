"use client";

import { useState, useEffect, useRef } from "react";

const STORAGE_KEY = "offer_countdown_end";

function getEndTime(): number {
  if (typeof window === "undefined") return Date.now() + 3 * 3600000;
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const parsed = parseInt(saved, 10);
    if (parsed > Date.now()) return parsed;
  }
  const hours = 2 + Math.floor(Math.random() * 2);
  const end = Date.now() + hours * 3600000;
  localStorage.setItem(STORAGE_KEY, String(end));
  return end;
}

function calcRemaining(end: number) {
  const diff = Math.max(0, end - Date.now());
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return { h, m, s, total: diff };
}

export default function CountdownTimer() {
  const endRef = useRef<number>(0);
  const [rem, setRem] = useState(() => calcRemaining(getEndTime()));

  useEffect(() => {
    endRef.current = getEndTime();

    const tick = () => {
      const r = calcRemaining(endRef.current);
      setRem(r);
      if (r.total <= 0) {
        endRef.current = getEndTime();
      }
    };
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="border-2 border-orange-300/60 bg-gradient-to-r from-orange-50/90 to-amber-50/90 rounded-xl px-5 py-4 shadow-sm">
      <p className="text-xs sm:text-sm font-bold text-orange-700 uppercase tracking-wider mb-3 flex items-center gap-2">
        <svg className="w-4 h-4 text-orange-500 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-.5-13v4h-5v2h7V7h-2z" />
        </svg>
        ¡Compra ya! Envío gratis si ordenas en:
      </p>

      <div className="flex items-center justify-center gap-1.5 select-none">
        <div className="flex flex-col items-center">
          <span className="bg-gray-900 text-white font-bold text-3xl sm:text-4xl tabular-nums rounded-lg px-3 py-1.5 min-w-[4.5rem] text-center leading-none">
            {pad(rem.h)}
          </span>
          <span className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">Horas</span>
        </div>

        <span className="text-3xl sm:text-4xl font-bold text-gray-900 mt-[-1.25rem] blinking-colon">:</span>

        <div className="flex flex-col items-center">
          <span className="bg-gray-900 text-white font-bold text-3xl sm:text-4xl tabular-nums rounded-lg px-3 py-1.5 min-w-[4.5rem] text-center leading-none">
            {pad(rem.m)}
          </span>
          <span className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">Minutos</span>
        </div>

        <span className="text-3xl sm:text-4xl font-bold text-gray-900 mt-[-1.25rem] blinking-colon">:</span>

        <div className="flex flex-col items-center">
          <span className="bg-gray-900 text-white font-bold text-3xl sm:text-4xl tabular-nums rounded-lg px-3 py-1.5 min-w-[4.5rem] text-center leading-none">
            {pad(rem.s)}
          </span>
          <span className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">Segundos</span>
        </div>
      </div>
    </div>
  );
}
