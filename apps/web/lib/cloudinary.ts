import { apiFetch } from "@/lib/api";

/**
 * Sube una imagen de producto desde el panel.
 *
 * Antes esto subia DIRECTA del navegador a `api.cloudinary.com` con las
 * variables publicas `NEXT_PUBLIC_CLOUDINARY_*`. Tenia dos problemas: si esas
 * variables no llegaban al build la URL salia `.../v1_1/undefined/image/upload`
 * y Cloudinary respondia con un error opaco, y ademas obligaba a abrir
 * `api.cloudinary.com` en la CSP del panel. Ahora la imagen se manda al API
 * (`POST /uploads`), que ya tiene Cloudinary configurado en el servidor, valida
 * el tipo real del archivo y no depende de variables publicas ni de la CSP.
 *
 * Devuelve la URL publica de la imagen.
 */
export async function uploadImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  const data = (await apiFetch("/uploads", {
    method: "POST",
    body: formData,
  })) as { url?: string };

  if (!data?.url) {
    throw new Error("La subida no devolvio una URL de imagen.");
  }

  return data.url;
}

/**
 * Sube un video de producto desde el panel.
 *
 * Va por el mismo camino que el logo y el video del banner: el archivo se manda
 * al API (`POST /uploads/video`), que tiene Cloudinary configurado en el
 * servidor y valida el tipo real del archivo. Subirlo directo desde el
 * navegador exigiria variables publicas de Cloudinary y abrir su dominio en la
 * CSP del panel; asi no hace falta ni una cosa ni la otra.
 *
 * El limite de tamano y el formato se validan antes en el formulario (igual que
 * en el banner), pero el API vuelve a comprobarlos: 25 MB y solo videos.
 *
 * Devuelve la URL publica del video.
 */
export async function uploadVideo(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  const data = (await apiFetch("/uploads/video", {
    method: "POST",
    body: formData,
  })) as { url?: string };

  if (!data?.url) {
    throw new Error("La subida no devolvio una URL de video.");
  }

  return data.url;
}
