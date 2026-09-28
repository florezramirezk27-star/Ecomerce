"use client";

import { useState } from "react";
import Image, { type ImageProps } from "next/image";

/**
 * Marcador para productos sin imagen o cuya imagen no carga.
 *
 * Se dibuja como `data:` y no como optimizable a proposito: pasar por el
 * optimizador de Next solo para acabar devolviendo el mismo SVG gasta una
 * transformacion por cada producto roto.
 */
const PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'%3E%3Crect width='400' height='300' fill='%23f1f5f9'/%3E%3Cpath d='M160 130l-28 34h20l-16 34 44-48h-22l24-20z' fill='%23cbd5e1'/%3E%3C/svg%3E";

/** Solo se optimizan URLs http(s); data:, blob: y rutas locales se pintan tal cual. */
function isOptimizable(src: string) {
  return src.startsWith("http://") || src.startsWith("https://");
}

type Props = Omit<ImageProps, "src" | "alt" | "onError"> & {
  src?: string | null;
  alt: string;
  /** `fill` para contenedores con aspecto fijo; `width`/`height` si no. */
  fill?: boolean;
  sizes?: string;
  /** `true` solo para la imagen LCP de la cabecera; el resto debe ser lazy. */
  priority?: boolean;
};

/**
 * Imagen de producto tolerante a fallos.
 *
 * Reemplaza el patron repetido en cuatro archivos, donde un `onError` intercambiaba
 * el `src` por un data-URI. Con `next/image` ese intercambio no funciona: el
 * optimizador rechaza el data-URI, y ademas el `src` optimizado ya fue
 * construido, asi que la imagen rota persistia. Aqui en su lugar se cambia el
 * elemento completo por el marcador cuando la carga falla.
 */
export default function ProductImage({
  src,
  alt,
  fill = true,
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
  priority = false,
  className,
  style,
  ...rest
}: Props) {
  const [failed, setFailed] = useState(false);

  const usable = typeof src === "string" && src.length > 0 && !failed;

  if (!usable) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={PLACEHOLDER}
        alt={alt}
        aria-hidden={alt ? undefined : true}
        className={className}
        style={style}
        loading="lazy"
        decoding="async"
      />
    );
  }

  if (!isOptimizable(src)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className={className}
        style={style}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill={fill}
      sizes={sizes}
      priority={priority}
      className={className}
      style={style}
      onError={() => setFailed(true)}
      {...rest}
    />
  );
}
