import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const SERVER_API = process.env.API_URL || "http://localhost:3001";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "https://ecomerce-vslf.onrender.com";

function extractOrigin(url: string): string {
  try { return new URL(url).origin; } catch { return url; }
}

const wsOrigin = extractOrigin(WS_URL);
const wsHost = wsOrigin.replace(/^https?:\/\//, "");

const connectSrc = [
  "'self'",
  wsOrigin,
  `ws://${wsHost}`,
  `wss://${wsHost}`,
]
  .filter((v, i, a) => a.indexOf(v) === i)
  .join(" ");

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https:",
  `connect-src ${connectSrc}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "media-src 'self' https://www.pexels.com https://videos.pexels.com",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
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
