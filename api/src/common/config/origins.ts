/**
 * Origenes de loopback: cualquier puerto. El frontend de desarrollo se mueve
 * de puerto cada vez que algo ocupa el 3000 (`next dev` incrementa solo), y con
 * el puerto fijo todo lo que dependia de el se rompia en silencio.
 */
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function isLocalOrigin(origin: unknown): origin is string {
  return typeof origin === 'string' && LOCAL_ORIGIN.test(origin);
}

/**
 * URL del frontend para redirects (OAuth, recuperacion de contrasena).
 *
 * `FRONTEND_URL` manda siempre: en produccion es la unica fuente valida. Sin
 * ella se usa el origen de la peticion, para que el callback vuelva al puerto
 * que este sirviendo el frontend en vez de a un 3000 fijo. Solo se aceptan
 * origenes de loopback, asi que esto no abre un redirect abierto: un sitio
 * externo no puede declarar ese origen en la cabecera `Origin`.
 */
export function frontendUrl(req?: {
  headers?: Record<string, unknown>;
}): string {
  const configured = process.env.FRONTEND_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');

  const origin = req?.headers?.origin;
  if (isLocalOrigin(origin)) return origin;

  return 'http://localhost:3000';
}

/**
 * `allowedOrigins` viene de `CORS_ORIGIN` y es la unica fuente valida en
 * produccion. En desarrollo se acepta ademas cualquier loopback, porque el
 * puerto del frontend es volatil. Permitir loopback no abre un redirect
 * abierto ni expone la API: un navegador solo envia `Origin` con el sitio que
 * el usuario esta visiting, nunca con uno elegido por un atacante.
 */
export function isOriginAllowed(
  origin: unknown,
  allowedOrigins: string[],
): boolean {
  if (typeof origin !== 'string' || origin === '') return true;
  if (allowedOrigins.includes(origin)) return true;
  return process.env.NODE_ENV !== 'production' && isLocalOrigin(origin);
}
