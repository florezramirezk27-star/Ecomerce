"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { initFacebookPixel } from "@/lib/facebook-pixel";

export default function FacebookPixel() {
  const pathname = usePathname();

  useEffect(() => {
    initFacebookPixel();
    if (pathname.startsWith("/admin")) return;
    window.fbq?.("track", "PageView");
  }, [pathname]);

  return null;
}