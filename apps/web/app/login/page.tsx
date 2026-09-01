"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { API_URL } from "@/lib/api";

const CLIENT_API_URL = process.env.NEXT_PUBLIC_API_URL || "/api/proxy";
import { setAuth } from "@/lib/auth";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(
    searchParams?.get("error") === "google_auth_failed"
      ? "Error al iniciar sesión con Google. Intenta de nuevo."
      : ""
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    let res: Response;
    try {
      res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
    } catch {
      setError("Error de conexión con el servidor");
      return;
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      setError(errData.message || "Credenciales inválidas");
      return;
    }

    const data = await res.json();

    setAuth(data.user);

    const redirect = searchParams.get("redirect");
    if (redirect && data.user.role === "ADMIN") {
      router.push(redirect);
    } else if (data.user.role === "ADMIN") {
      router.push("/admin");
    } else {
      router.push("/");
    }
  }

  return (
    <main className="flex items-center justify-center min-h-screen">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 w-full max-w-sm px-4"
      >
        <h1 className="text-2xl font-bold text-center">
          Iniciar sesión
        </h1>

        {error && (
          <p className="text-red-500 text-sm text-center">
            {error}
          </p>
        )}

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="border p-2 rounded"
        />

        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="border p-2 rounded"
        />

        <button
          type="submit"
          className="bg-blue-600 text-white p-2 rounded hover:bg-blue-700"
        >
          Ingresar
        </button>

        <div className="relative my-2">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-white px-2 text-gray-500">o</span>
          </div>
        </div>

        <a
          href={`${CLIENT_API_URL}/auth/google`}
          className="flex items-center justify-center gap-2 border border-gray-300 p-2 rounded hover:bg-gray-50 transition"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Continuar con Google
        </a>

        <Link
          href="/forgot-password"
          className="text-sm text-center text-gray-500 hover:underline"
        >
          ¿Olvidaste tu contraseña?
        </Link>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <main className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Cargando...</p>
      </main>
    }>
      <LoginForm />
    </Suspense>
  );
}
