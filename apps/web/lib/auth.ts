import { apiFetch } from "./api";

// Los navegadores de quienes visitaron la tienda antes de este cambio siguen
// teniendo el JWT en localStorage, y no basta con dejar de escribirlo: la API
// continua admitiendo Authorization Bearer, asi que un token viejo ahi sigue
// siendo una credencial valida que cualquier XSS puede leer. Se borra al cargar.
//
// Vive aqui y no en un useEffect porque el Navbar, que es client component,
// importa este modulo y el layout raiz lo pinta en todas las paginas. Si se
// mueve a otro sitio, hay que comprobar que sigue corriendo en todas.
if (typeof window !== "undefined") {
  window.localStorage.removeItem("token");
}

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

// Solo el usuario, y solo para pintar la interfaz. La credencial es la cookie
// httpOnly que deja la API. Guardar el token tambien por aqui era lo que
// hacia vulnerable la sesion: un XSS leia localStorage y se quedaba con la
// sesion del admin.
export function setAuth(user: { role: string }) {
  localStorage.setItem("user", JSON.stringify(user));
  notify();
}

export function clearAuth() {
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
