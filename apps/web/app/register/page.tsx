"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "No se pudo crear la cuenta");
      }

      router.push("/login");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al crear la cuenta",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg bg-white p-6 shadow-sm"
      >
        <div>
          <h1 className="text-center text-2xl font-bold text-gray-900">
            Crear cuenta
          </h1>
          <p className="mt-1 text-center text-sm text-gray-600">
            Registrate para comprar y ver tus pedidos.
          </p>
        </div>

        {error && (
          <p className="rounded border border-red-200 bg-red-50 p-3 text-center text-sm text-red-700">
            {error}
          </p>
        )}

        <input
          type="text"
          placeholder="Nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={3}
          className="rounded border p-2"
        />

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="rounded border p-2"
        />

        <input
          type="password"
          placeholder="Contrasena"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          className="rounded border p-2"
        />

        <button
          type="submit"
          disabled={loading}
          className="rounded bg-blue-600 p-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Creando..." : "Registrarse"}
        </button>

        <Link
          href="/login"
          className="text-center text-sm text-blue-600 hover:underline"
        >
          Ya tengo cuenta
        </Link>
      </form>
    </main>
  );
}
