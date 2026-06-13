export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:3001';

export async function apiFetch(
  endpoint: string,
  options?: RequestInit,
) {
  const body = options?.body;
  const isFormData = body instanceof FormData;
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string> || {}),
  };

  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(
    `${API_URL}${endpoint}`,
    {
      ...options,
      headers,
    },
  );

  if (response.status === 401) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax';
      document.cookie = 'role=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax';
      window.dispatchEvent(new Event('auth-change'));
      window.location.href = '/login';
    }
    throw new Error('Sesión expirada');
  }

  if (!response.ok) {
    throw new Error('Error en API');
  }

  return response.json();
}
