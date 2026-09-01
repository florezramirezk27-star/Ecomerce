import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/anton";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Banner from "@/components/Banner";
import StoreChat from "@/components/chat/StoreChat";
import { Analytics } from '@vercel/analytics/next';

const FALLBACK_ICON = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="%232563eb"/><text x="16" y="24" text-anchor="middle" font-family="Arial,sans-serif" font-weight="bold" font-size="22" fill="white">K</text></svg>';

const API_URL = process.env.API_URL || "http://localhost:3001";

export async function generateMetadata(): Promise<Metadata> {
  let icon = FALLBACK_ICON;
  try {
    const res = await fetch(`${API_URL}/settings/logo`, {
      signal: AbortSignal.timeout(3000),
      next: { revalidate: 60 },
    });
    const data = await res.json();
    if (data.logo) icon = data.logo;
  } catch {}

  return {
    title: "Kronio Market",
    description: "Kronio Market",
    icons: { icon },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Navbar />
        <Banner />
        <div className="flex-1">{children}</div>
        <StoreChat />
        <Analytics />
      </body>
    </html>
  );
}
