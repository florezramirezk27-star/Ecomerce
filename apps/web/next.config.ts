import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const DEV_API = "http://localhost:3001";

const SERVER_API = (() => {
  const url = process.env.API_URL;
  if (url) return url.replace(/\/+$/, "");
  if (isProd) {
    throw new Error(
      "API_URL no esta definida. En produccion el SSR y el proxy /api/proxy fallarian en silencio apuntando a localhost.",
    );
  }
  return DEV_API;
})();

const WS_URL = (() => {
  const url = process.env.NEXT_PUBLIC_WS_URL;
  if (url) return url;
  if (isProd) {
    throw new Error(
      "NEXT_PUBLIC_WS_URL no esta definida. Sin ella el chat y el contador de visitantes no tendran socket.",
    );
  }
  return DEV_API;
})();

function extractOrigin(url: string): string {
  try { return new URL(url).origin; } catch { return url; }
}

const wsOrigin = extractOrigin(WS_URL);
const wsHost = wsOrigin.replace(/^https?:\/\//, "");

/**
 * Origenes de Meta (pixel + API de Conversiones).
 *
 * `connect.facebook.net` es de donde sale el `fbevents.js`; `www.facebook.com`
 * es el endpoint clasico que recibe los eventos (`/tr`) y la cookie `_fbp`; y
 * `graph.facebook.com` es el que usa la CAPI.
 *
 * `*.on.aws` y `*.run.app` son los endpoints de "OpenBridge", la ruta nueva de
 * entrega de Meta: el pixel manda los eventos a un servidor propio de Meta (en
 * AWS, con fallback en Cloud Run) en vez de a `facebook.com`, para que lleguen
 * aunque el visitante bloquee facebook.com (bloqueadores de anuncios, navegadores
 * con proteccion contra rastreo). El pixel se configura desde el Event Manager
 * y Meta puede cambiar el host o la region en cualquier momento, asi que se
 * permiten por sufijo y no host por host: si se listaran los nombres exactos,
 * el dia que Meta rote la region el pixel volveria a fallar en silencio.
 *
 * Con estos origins fuera de la CSP el pixel seguia funcionando por la ruta
 * clasica, pero OpenBridge fallaba en cada pagina y Meta lo reportaba como
 * error de entrega del pixel (`pn=openbridge3`), lo que degrada la calidad de
 * los datos que Meta calcula para las campañas.
 */
const META_ORIGINS = [
  "https://connect.facebook.net",
  "https://www.facebook.com",
  "https://graph.facebook.com",
  "https://*.on.aws",
  "https://*.run.app",
].join(" ");

// Vercel inyecta su toolbar de feedback/comentarios (vercel.live) en los
// despliegues de preview y, segun la configuracion del proyecto, tambien en
// produccion. Sin estos origenes en la CSP el script se bloquea y la consola
// escupe un error en cada carga. Pusher es el transporte de esos comentarios en
// vivo. Permitirlos no abre la puerta a nada ajeno: es codigo first-party de
// Vercel.
const VERCEL_LIVE_SCRIPT = "https://vercel.live";
const VERCEL_LIVE_CONNECT = [
  "https://vercel.live",
  "https://*.pusher.com",
  "wss://*.pusher.com",
  "https://*.pusherapp.com",
  "wss://*.pusherapp.com",
];
const VERCEL_LIVE_FRAME = "https://vercel.live";

const VIDEO_FRAME_SRC = [
  "https://www.youtube.com",
  "https://www.youtube-nocookie.com",
  "https://player.vimeo.com",
];

/**
 * Nota sobre `frame-src` e iframes propios:
 *
 * `frame-src` lleva `'self'` en TODO el sitio, no solo en la ficha. Motivo: la
 * landing de un producto se incrusta en un iframe del propio origen y Next no
 * vuelve a aplicar las cabeceras en la navegacion client-side (SPA). Al entrar
 * a una ficha desde la home con un click, el documento conserva la CSP del
 * documento inicial; si esa CSP no tuviera `'self'` en `frame-src`, el iframe de
 * la landing se bloqueaba con "Este contenido esta bloqueado" y solo se veia
 * tras recargar (que si reaplica las cabeceras de la ficha). Con `'self'` en
 * todas las paginas el iframe carga igual entren por SPA o por recarga directa.
 *
 * El aislamiento no se pierde: `frame-ancestors 'none'` (mas abajo) impide que
 * cualquier otro sitio incruste la tienda, que es la proteccion real contra
 * clickjacking. `frame-src 'self'` solo permite incrustar paginas del propio
 * dominio, que ya estan bajo nuestro control. Se mantiene `withSelfFraming()`
 * por compatibilidad, pero ya no es imprescindible.
 */

// El mapa de la direccion de envio vive en un iframe de Google. Sin estos
// origenes en frame-src, default-src 'self' lo bloquea y el cliente ve la
// caja gris en blanco.
const MAPS_FRAME_SRC = ["https://www.google.com", "https://maps.google.com"];

// Geocodificadores de OpenStreetMap que rellenan el codigo postal. Sin estos
// origenes en connect-src el fetch falla con CORS y el campo queda vacio.
const GEOCODE_ORIGINS = [
  "https://nominatim.openstreetmap.org",
  "https://photon.komoot.io",
];

function dedupe(values: string[]) {
  return values.filter((v, i, a) => a.indexOf(v) === i).join(" ");
}

/**
 * Devuelve la CSP estricta de la tienda con `'self'` agregado al `frame-src`.
 *
 * Solo se usa en las rutas donde la tienda incrusta su propia landing. Next
 * aplica la ultima cabecera que coincide para una misma clave, asi que las
 * entradas que usan esto van despues del comodin y reemplazan la CSP estricta
 * solo en esas rutas.
 */
function withSelfFraming() {
  const frameSrc = dedupe([
    "'self'",
    ...VIDEO_FRAME_SRC,
    ...MAPS_FRAME_SRC,
    VERCEL_LIVE_FRAME,
  ]);
  return csp
    .map((directive) =>
      directive.startsWith("frame-src ") ? `frame-src ${frameSrc}` : directive,
    )
    .join("; ");
}

const connectSrc = dedupe([
  "'self'",
  wsOrigin,
  `ws://${wsHost}`,
  `wss://${wsHost}`,
  META_ORIGINS,
  ...GEOCODE_ORIGINS,
  ...VERCEL_LIVE_CONNECT,
]);

const imgSrc = dedupe(["'self'", "data:", "blob:", "https:"]);

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${VERCEL_LIVE_SCRIPT} https://connect.facebook.net${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  `img-src ${imgSrc}`,
  `connect-src ${connectSrc}`,
  `frame-src 'self' ${dedupe([...VIDEO_FRAME_SRC, ...MAPS_FRAME_SRC, VERCEL_LIVE_FRAME])}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "media-src 'self' https://www.pexels.com https://videos.pexels.com https://res.cloudinary.com https://*.cloudinary.com https://*.cloudinary-video.com",
];

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp.join("; ") },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

/**
 * Hosts remotos que `next/image` puede optimizar.
 *
 * Sin `remotePatterns`, `next/image` lanza un error en runtime para cualquier
 * host que no este listado, y `unoptimized` desactivaria el optimizador para
 * todo el catalogo. Se listan solo los hosts que de verdad sirven imagenes de
 * producto y logo; el resto sigue con `<img>` a proposito.
 */
const imageRemotePatterns = [
  { protocol: "https" as const, hostname: "res.cloudinary.com" },
  { protocol: "https" as const, hostname: "*.cloudfront.net" },
  { protocol: "https" as const, hostname: "picsum.photos" },
  { protocol: "https" as const, hostname: "fastly.picsum.photos" },
  // Imagenes de la home, que son el LCP de la pagina mas visitada.
  { protocol: "https" as const, hostname: "images.pexels.com" },
  { protocol: "https" as const, hostname: "aveonline.co" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    remotePatterns: imageRemotePatterns,
    // El catalogo se renderiza en servidores edge (Vercel) y el optimizador
    // necesita transformar imagenes de terceros; sin esto Next cae a la
    // imagen original y se pierde el beneficio de `next/image`.
    formats: ["image/avif", "image/webp"],
    // Anchos usados por el grid de catalogo, el carrusel y las miniaturas de
    // galeria, para no generar mas de un tamano por cada uno.
    deviceSizes: [320, 420, 640, 828, 1080, 1200, 1600, 1920],
    imageSizes: [48, 64, 96, 128, 256, 384],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // La landing de un producto se sirve como documento aparte (ver
        // `app/landing/[slug]/route.ts`) y trae su PROPIA CSP permisiva, porque
        // el codigo que pega el admin puede cargar cualquier CDN. Next aplica
        // la ultima cabecera que coincide para una misma clave, asi que esta
        // entrada, al ir despues del comodin, reemplaza la CSP estricta solo en
        // esta ruta. El aislamiento real lo da el `sandbox` del iframe.
        source: "/landing/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; img-src * data: blob:; media-src * data: blob:; frame-ancestors 'self'",
          },
          // El resto de la tienda sigue con X-Frame-Options DENY; aqui se
          // permite el mismo origen porque el iframe de la ficha lo incrusta.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
      {
        // La ficha del producto incrusta la landing del propio sitio, asi que
        // aqui el `frame-src` estricto necesita `'self'`. Se conserva el resto
        // de la CSP intacta (incluido `frame-ancestors 'none'`, que impide que
        // otro sitio incruste la ficha).
        source: "/products/:path*",
        headers: [{ key: "Content-Security-Policy", value: withSelfFraming() }],
      },
      {
        // Misma razon en la vista previa del admin, que tambien usa el iframe.
        source: "/admin/products/edit/:path*",
        headers: [{ key: "Content-Security-Policy", value: withSelfFraming() }],
      },
      {
        source: "/admin/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/cart/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/api/proxy/:path*",
        destination: `${SERVER_API}/:path*`,
      },
    ];
  },
};

export default nextConfig;
