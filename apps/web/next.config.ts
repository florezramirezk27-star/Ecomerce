import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const SERVER_API = process.env.API_URL || "http://localhost:3001";
const CLIENT_API = process.env.NEXT_PUBLIC_API_URL || "/api/proxy";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "http://localhost:3001";

function extractOrigin(url: string): string {
  try { return new URL(url).origin; } catch { return url; }
}

const clientOrigin = extractOrigin(CLIENT_API);
const wsOrigin = extractOrigin(WS_URL);
const wsScheme = wsOrigin.startsWith("https") ? "wss" : "ws";
const wsHost = wsOrigin.replace(/^https?:\/\//, "");

const connectSrc = [
  "'self'",
  clientOrigin,
  wsOrigin,
  `${wsScheme}://${wsHost}`,
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
