import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const DEV_API = "http://localhost:3001";

const SERVER_API = (() => {
  const url = process.env.API_URL;
  if (url) return url;
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

const META_ORIGINS = [
  "https://connect.facebook.net",
  "https://www.facebook.com",
].join(" ");

const VIDEO_FRAME_SRC = [
  "https://www.youtube.com",
  "https://www.youtube-nocookie.com",
  "https://player.vimeo.com",
];

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

const connectSrc = dedupe([
  "'self'",
  wsOrigin,
  `ws://${wsHost}`,
  `wss://${wsHost}`,
  META_ORIGINS,
  ...GEOCODE_ORIGINS,
]);

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://connect.facebook.net${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https:",
  `connect-src ${connectSrc}`,
  `frame-src ${dedupe([...VIDEO_FRAME_SRC, ...MAPS_FRAME_SRC])}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "media-src 'self' https://www.pexels.com https://videos.pexels.com",
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
