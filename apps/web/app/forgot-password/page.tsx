"use client";

import { useState } from "react";
import Link from "next/link";
import { API_URL } from "@/lib/api";
import AuthShell from "@/components/auth/AuthShell";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    let res: Response;
    try {
      res = await fetch(`${API_URL}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      setLoading(false);
      setError("Error de conexión con el servidor");
      return;
    }

    if (!res.ok) {
      setLoading(false);
      const errData = await res.json().catch(() => ({}));
      setError(errData.message || "Error al enviar la solicitud");
      return;
    }

    setLoading(false);
    setSent(true);
  }

  if (sent) {
    return (
      <AuthShell>
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100">
            <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
            Revisa tu correo
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.
          </p>
        </div>

        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-700">
          El enlace expira en <strong>1 hora</strong>. Revisa también tu carpeta de no deseados (spam).
        </div>

        <Link
          href="/login"
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition-all hover:from-blue-700 hover:to-indigo-700"
        >
          Volver al inicio de sesión
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
          Recuperar contraseña
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Ingresa tu correo y te enviaremos un enlace para crear una nueva contraseña
        </p>
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700">
          <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-gray-700">
            Correo electrónico
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </span>
            <input
              id="email"
              type="email"
              placeholder="tu@correo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-xl border border-gray-300 bg-white py-3 pl-11 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition-all hover:from-blue-700 hover:to-indigo-700 hover:shadow-blue-600/40 active:scale-[0.99] disabled:cursor-wait disabled:opacity-75"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Enviando...
            </span>
          ) : (
            "Enviar enlace de recuperación"
          )}
        </button>
      </form>

      <p className="mt-8 text-center text-sm text-gray-500">
        ¿Recordaste tu contraseña?{" "}
        <Link href="/login" className="font-bold text-blue-600 hover:text-blue-700 hover:underline">
          Inicia sesión
        </Link>
      </p>
    </AuthShell>
  );
}