import { apiFetch } from "./api";

function notify() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("auth-change"));
  }
}

function removeCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
}

export function getUser() {
  if (typeof window === "undefined") {
    return null;
  }

  const user = localStorage.getItem("user");

  try {
    return user ? JSON.parse(user) : null;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return localStorage.getItem("user") !== null;
}

export function setAuth(user: { role: string }) {
  localStorage.removeItem("token");
  localStorage.setItem("user", JSON.stringify(user));
  notify();
}

export function clearAuth() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  removeCookie("role");
  notify();
}

export async function serverLogout() {
  try {
    await apiFetch("/auth/logout", { method: "POST", body: "{}" });
  } catch {
    // ignore API errors
  }
  clearAuth();
}
