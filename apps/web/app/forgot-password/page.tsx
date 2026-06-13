"use client";

import { useState } from "react";
import Link from "next/link";
import { API_URL } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const res = await fetch(`${API_URL}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (!res.ok) {
      setError("Error al enviar la solicitud");
      return;
    }

    setSent(true);
  }

  if (sent) {
    return (
      <main className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col gap-4 w-full max-w-sm px-4 text-center">
          <h1 className="text-2xl font-bold">Revisa tu correo</h1>
          <p className="text-gray-600">
            Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.
          </p>
          <Link href="/login" className="text-blue-600 hover:underline mt-4">
            Volver al inicio de sesión
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex items-center justify-center min-h-screen">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 w-full max-w-sm px-4"
      >
        <h1 className="text-2xl font-bold text-center">
          Recuperar contraseña
        </h1>

        {error && (
          <p className="text-red-500 text-sm text-center">{error}</p>
        )}

        <input
          type="email"
          placeholder="Tu correo electrónico"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="border p-2 rounded"
        />

        <button
          type="submit"
          className="bg-blue-600 text-white p-2 rounded hover:bg-blue-700"
        >
          Enviar enlace de recuperación
        </button>

        <Link href="/login" className="text-sm text-center text-gray-500 hover:underline mt-2">
          Volver al inicio de sesión
        </Link>
      </form>
    </main>
  );
}
