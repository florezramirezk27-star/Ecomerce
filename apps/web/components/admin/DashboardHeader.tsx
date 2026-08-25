'use client';

import { Bell, MessageSquare, Search } from 'lucide-react';

export default function DashboardHeader() {
  return (
    <header className="flex items-center justify-between gap-4 rounded-[2rem] border border-slate-200 bg-white px-6 py-4 shadow-lg shadow-slate-200/60">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 text-white text-sm font-bold shadow-sm">
            K
          </div>
          <span className="hidden text-lg font-bold text-slate-900 sm:inline">
            Kronio Market
          </span>
        </div>
      </div>

      <div className="relative hidden max-w-md flex-1 md:block">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar productos, pedidos, clientes..."
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2.5 pl-11 pr-4 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <div className="flex items-center gap-2">
        <button className="relative flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-blue-600">
          <Bell className="h-5 w-5" />
          <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
        </button>
        <button className="relative flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-blue-600">
          <MessageSquare className="h-5 w-5" />
        </button>
        <div className="ml-2 flex items-center gap-3 border-l border-slate-200 pl-4">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-slate-900">Admin</p>
            <p className="text-xs text-slate-500">Administrador</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500 text-white text-sm font-bold shadow-sm">
            A
          </div>
        </div>
      </div>
    </header>
  );
}
