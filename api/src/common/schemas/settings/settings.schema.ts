import { z } from 'zod';

/**
 * URL del logo de la tienda.
 *
 * Se valida antes de persistirla en `settings.json` porque ese valor acaba en el
 * `<link rel="icon">` de todas las paginas (ver `Navbar.tsx` y `layout.tsx`).
 * Sin esta comprobacion, un valor corrupto rompe el favicon de la tienda entera
 * y solo se recupera con otra llamada de admin.
 *
 * Solo `http`/`https`. Se descartan `javascript:`, `data:` y `file:`: aunque el
 * destino final sea un atributo `href` de `<link>`, no hay motivo para
 * persistir un esquema que no sea una URL real, y filtrarlos aqui evita que un
 * valor asi llegue a estar en disco.
 *
 * El limite acota lo que se escribe en el archivo. El cuerpo de la peticion
 * admite 1 MB, que no es nada razonable para un logo.
 */
export const MAX_LOGO_URL_LENGTH = 2048;

export const settingsLogoSchema = z.object({
  logo: z
    .string()
    .trim()
    .max(
      MAX_LOGO_URL_LENGTH,
      `La URL no puede pasar de ${MAX_LOGO_URL_LENGTH} caracteres`,
    )
    .url('La URL del logo no es valida')
    .refine(
      (value) => /^https?:\/\//i.test(value),
      'La URL del logo debe empezar por http:// o https://',
    ),
});
