const isServer = typeof window === 'undefined';

/** Forma paginada que devuelve el API para listados. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const API_URL = isServer
  ? (process.env.API_URL || 'http://localhost:3001')
  : (process.env.NEXT_PUBLIC_API_URL || '/api/proxy');

// El token de sesion no se guarda en ningun sitio del navegador. Solo viaja en
// la cookie httpOnly que pone la API, y por eso estas peticiones van siempre con
// credentials: 'include'. Antes se copiaba a localStorage y ademas se mandaba
// como Authorization Bearer; con esa copia, cualquier JavaScript que corriera en
// la pagina podia leerla con localStorage.getItem('token') y quedarse con la
// sesion del admin. Un token de refresco tampoco sirve: leerlo basta.

const CSRF_COOKIE_NAMES = ['__Host-csrf-token', 'csrf-token'];

function getCsrfToken(): string | null {
  if (isServer) return null;
  for (const name of CSRF_COOKIE_NAMES) {
    const matches = [
      ...document.cookie.matchAll(
        new RegExp(`(?:^|;\\s*)${name}=([^;]*)`, 'g'),
      ),
    ];
    if (matches.length > 0) {
      return decodeURIComponent(matches[matches.length - 1][1]);
    }
  }
  return null;
}

async function ensureCsrfCookie(): Promise<void> {
  if (getCsrfToken()) return;
  try {
    await fetch(`${API_URL}/auth`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {}
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 2,
): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      if (i === retries) throw error;
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
  throw new Error('Unreachable');
}

let refreshPromise: Promise<boolean> | null = null;

export function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function performRefresh(): Promise<boolean> {
  try {
    await ensureCsrfCookie();
    const csrfToken = getCsrfToken();

    const response = await fetchWithRetry(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      },
      credentials: 'include',
      body: '{}',
    });

    if (!response.ok) return false;

    // /auth/refresh renueva la cookie httpOnly y devuelve solo el usuario. No
    // hay token que guardar: la cookie ya cambio sola.
    const data = await response.json().catch(() => null);

    if (data?.user && !isServer) {
      localStorage.setItem('user', JSON.stringify(data.user));
      window.dispatchEvent(new Event('auth-change'));
    }

    return true;
  } catch {
    return false;
  }
}

function handleSessionExpired() {
  if (isServer) return;
  localStorage.removeItem('user');
  // La cookie 'token' no se toca aqui y no se puede: es httpOnly, asi que
  // document.cookie no la ve. La limpia el logout de la API. La de 'role' si es
  // legible y hay que borrarla para que la UI no siga mostrando el rol.
  document.cookie = 'role=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax';
  window.dispatchEvent(new Event('auth-change'));
  window.location.href = '/login';
}

export async function apiFetch(
  endpoint: string,
  options?: RequestInit,
) {
  const body = options?.body;
  const method = (options?.method || 'GET').toUpperCase();
  const isFormData = body instanceof FormData;

  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string> || {}),
  };

  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  const isSafeMethod = ['GET', 'HEAD', 'OPTIONS'].includes(method);

  if (!isSafeMethod) {
    await ensureCsrfCookie();
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
  }

  let response = await fetchWithRetry(
    `${API_URL}${endpoint}`,
    {
      ...options,
      headers,
      credentials: 'include',
    },
  );

  if (
    !isSafeMethod &&
    response.status === 403
  ) {
    const errBody = await response
      .clone()
      .json()
      .catch(() => ({}));
    if (typeof errBody.message === 'string' && errBody.message.includes('CSRF')) {
      await ensureCsrfCookie();
      const fresh = getCsrfToken();
      if (fresh) headers['X-CSRF-Token'] = fresh;
      response = await fetchWithRetry(
        `${API_URL}${endpoint}`,
        {
          ...options,
          headers,
          credentials: 'include',
        },
      );
    }
  }

  if (response.status === 401 && (await refreshSession())) {
    if (!isSafeMethod) {
      const fresh = getCsrfToken();
      if (fresh) headers['X-CSRF-Token'] = fresh;
    }
    response = await fetchWithRetry(
      `${API_URL}${endpoint}`,
      {
        ...options,
        headers,
        credentials: 'include',
      },
    );
  }

  if (response.status === 401) {
    handleSessionExpired();
    throw new Error('Sesión expirada');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.message || `Error en API (${response.status})`,
    );
  }

  return response.json();
}