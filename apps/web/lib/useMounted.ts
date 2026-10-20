"use client";

import { useSyncExternalStore } from "react";

/**
 * `false` en el servidor (y durante la hidratacion) y `true` ya en el cliente.
 *
 * Sirve para componentes que dependen de algo que solo existe en el navegador
 * (por ejemplo `usePathname()` en una pagina prerenderizada de forma estatica,
 * donde el servidor lo ve como `null`) y que si decidieran con ese valor
 * pintarian un arbol distinto al del HTML del servidor. Gatear el render con
 * este hook hace que el primer render del cliente coincida con el del servidor
 * y evita el error de hidratacion (#418).
 *
 * Se implementa con `useSyncExternalStore` en vez de un `useState` + `useEffect`
 * porque el efecto que llama a `setState` dispara renders en cascada (lo marca
 * la regla `react-hooks/set-state-in-effect`). Es el mismo patron que usa el
 * aviso de cookies.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
