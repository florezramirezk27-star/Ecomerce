"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { API_URL } from "@/lib/api";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Las contraseñas no coinciden");
      return;
    }

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    if (!token) {
      setError("Token de recuperación inválido");
      return;
    }

    const res = await fetch(`${API_URL}/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.message || "Error al restablecer la contraseña");
      return;
    }

    setDone(true);
  }

  if (done) {
    return (
      <main className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col gap-4 w-full max-w-sm px-4 text-center">
          <h1 className="text-2xl font-bold">Contraseña actualizada</h1>
          <p className="text-gray-600">
            Tu contraseña se ha restablecido correctamente.
          </p>
          <Link href="/login" className="text-blue-600 hover:underline mt-4">
            Iniciar sesión
          </Link>
        </div>
      </main>
    );
  }

  if (!token) {
    return (
      <main className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col gap-4 w-full max-w-sm px-4 text-center">
          <h1 className="text-2xl font-bold">Enlace inválido</h1>
          <p className="text-gray-600">
            El enlace de recuperación no es válido o ha expirado.
          </p>
          <Link href="/forgot-password" className="text-blue-600 hover:underline mt-4">
            Solicitar nuevo enlace
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
          Nueva contraseña
        </h1>

        {error && (
          <p className="text-red-500 text-sm text-center">{error}</p>
        )}

        <input
          type="password"
          placeholder="Nueva contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          className="border p-2 rounded"
        />

        <input
          type="password"
          placeholder="Confirmar contraseña"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={6}
          className="border p-2 rounded"
        />

        <button
          type="submit"
          className="bg-blue-600 text-white p-2 rounded hover:bg-blue-700"
        >
          Restablecer contraseña
        </button>
      </form>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
