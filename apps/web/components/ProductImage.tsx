"use client";

import { useCallback, useState } from "react";
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
  /**
   * `fill` para contenedores con aspecto fijo; `width`/`height` si no.
   *
   * Con `fill` (el valor por defecto) la imagen sale como `position:absolute`
   * con `inset:0`, o sea que se ancla en el PRIMER ancestro posicionado. Si el
   * contenedor inmediato no tiene `relative`, la imagen se mide contra el
   * viewport y se sale de la tarjeta. El contenedor necesita las dos cosas:
   * `relative` y una altura definida (`aspect-square`, `aspect-[4/3]`, `h-20`).
   */
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

  // Fallo silencioso: ni React ni TypeScript se quejan si el contenedor no
  // tiene `relative`, la imagen simplemente se dibuja del tamaño del viewport
  // encima de la pagina. Solo se nota mirando el resultado, y asi se colaron
  // cinco usos. Se avisa en desarrollo, no en produccion.
  const checkParent = useCallback(
    (el: HTMLImageElement | null) => {
      if (!fill || !el?.parentElement) return;
      if (process.env.NODE_ENV === "production") return;
      if (getComputedStyle(el.parentElement).position === "static") {
        console.error(
          `[ProductImage] "${alt}" va con fill (position:absolute) pero su contenedor no tiene \`relative\`. Anade \`relative\` y una altura fija al contenedor.`,
        );
      }
    },
    [fill, alt],
  );

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
      ref={checkParent}
      {...rest}
    />
  );
}
