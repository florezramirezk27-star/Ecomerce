function notify() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("auth-change"));
  }
}

function setCookie(name: string, value: string, days = 7) {
  if (typeof document === "undefined") return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function removeCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
}

export function getToken() {
  if (typeof window === "undefined") {
    return null;
  }

  return localStorage.getItem("token");
}

export function getUser() {
  if (typeof window === "undefined") {
    return null;
  }

  const user =
    localStorage.getItem("user");

  return user
    ? JSON.parse(user)
    : null;
}

export function setAuth(token: string, user: { role: string }) {
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));
  setCookie("token", token);
  setCookie("role", user.role);
  notify();
}

export function clearAuth() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  removeCookie("token");
  removeCookie("role");
  notify();
}

export async function serverLogout() {
  const token = getToken();
  if (token) {
    try {
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/auth/logout-force`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        },
      );
    } catch {
      // ignore API errors
    }
  }
  clearAuth();
}
