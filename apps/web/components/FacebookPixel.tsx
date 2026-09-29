"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { initFacebookPixel } from "@/lib/facebook-pixel";
import { hasTrackingConsent, subscribeToConsent } from "@/lib/consent";

export default function FacebookPixel() {
  const pathname = usePathname();

  // El pixel solo arranca si el visitante dio su consentimiento. Leerlo con
  // `useSyncExternalStore` cubre tambien el caso de que la decision llegue
  // despues de montar la pagina (banner): hay que inicializarlo en ese
  // momento, no esperar a la recarga.
  const allowed = useSyncExternalStore(
    subscribeToConsent,
    hasTrackingConsent,
    () => false,
  );

  useEffect(() => {
    if (!allowed) return;
    initFacebookPixel();
    if (pathname.startsWith("/admin")) return;
    window.fbq?.("track", "PageView");
  }, [pathname, allowed]);

  return null;
}
