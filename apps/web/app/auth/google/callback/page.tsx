'use client';

import { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { setAuth } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { mergeGuestCartIntoServer } from '@/lib/cart-merge';

function CallbackContent() {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (!code) {
      router.replace('/login?error=google_auth_failed');
      return;
    }

    (async () => {
      try {
        const result = await apiFetch('/auth/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });

        // El exchange devuelve solo el usuario; la credencial es la cookie.
        setAuth(result.user);
        // Lo agregado sin iniciar sesion pasa ahora al carrito del servidor.
        void mergeGuestCartIntoServer();
        router.replace(result.user.role === 'ADMIN' ? '/admin' : '/');
      } catch {
        router.replace('/login?error=google_auth_failed');
      }
    })();
  }, [router]);

  return null;
}

export default function GoogleCallback() {
  return (
    <main className="flex items-center justify-center min-h-dvh">
      <Suspense fallback={<p className="text-gray-500">Iniciando sesión con Google...</p>}>
        <CallbackContent />
      </Suspense>
    </main>
  );
}
