'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setAuth } from '@/lib/auth';
import { API_URL } from '@/lib/api';

function CallbackContent() {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const userStr = params.get('user');

    if (token && userStr) {
      try {
        const user = JSON.parse(decodeURIComponent(userStr));
        setAuth(token, user);
        router.replace(user.role === 'ADMIN' ? '/admin' : '/');
      } catch {
        router.replace('/login?error=google_auth_failed');
      }
    } else {
      router.replace('/login?error=google_auth_failed');
    }
  }, [router]);

  return null;
}

export default function GoogleCallback() {
  return (
    <main className="flex items-center justify-center min-h-screen">
      <Suspense fallback={<p className="text-gray-500">Iniciando sesión con Google...</p>}>
        <CallbackContent />
      </Suspense>
    </main>
  );
}
