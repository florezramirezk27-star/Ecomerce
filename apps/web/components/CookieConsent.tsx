"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import ConsentBar from "./cookies/ConsentBar";
import ConsentDialog from "./cookies/ConsentDialog";
import {
  openCookiePreferences,
  readConsent,
  SERVER_CONSENT,
  setConsent,
  subscribeConsent,
  subscribeToConsent,
} from "@/lib/consent";

/**
 * Aviso de consentimiento.
 *
 * Dos superficies distintas a proposito: la barra sale sola la primera vez y
 * solo ofrece decidir, mientras que el panel con el detalle de cada cookie es
 * un modal que se abre cuando el visitante lo pide. Poner la tabla de cookies
 * en la barra desde el primer impacto hacia ruido; no mostrarla nunca deja el
 * deber de informacion a medias.
 */
export default function CookieConsent() {
  // La decision vive fuera de React (localStorage). `useSyncExternalStore` la
  // lee sin `setState` en un efecto y mantiene el panel sincronizado con
  // cualquier cambio, venga de donde venga.
  const consent = useSyncExternalStore(
    subscribeToConsent,
    readConsent,
    () => SERVER_CONSENT,
  );

  // Abrir el panel no viene del almacenamiento sino de un click, asi que ese
  // bit si es estado del componente. `draft` es lo que el visitante movio en el
  // interruptor y todavia no ha guardado.
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [draft, setDraft] = useState(false);

  const barRef = useRef<HTMLDivElement>(null);
  const movedFocus = useRef(false);

  useEffect(() => {
    return subscribeConsent((event) => {
      if (event.type === "open-preferences") {
        setDraft(readConsent()?.categories.tracking === true);
        setPrefsOpen(true);
      } else if (event.type === "decision") {
        setPrefsOpen(false);
      } else {
        setDraft(false);
      }
    });
  }, []);

  // Sin decision guardada el aviso es obligatorio: navegar no es consentir.
  const undecided = consent === null;
  const showBar = undecided && !prefsOpen;

  // Mueve el foco a la barra la primera vez para que un lector de pantalla la
  // anuncie. Solo una vez: al reabrir desde el footer no se le quita el foco
  // al visitante de donde esta.
  useEffect(() => {
    if (!showBar || movedFocus.current) return;
    const bar = barRef.current;
    if (!bar) return;
    movedFocus.current = true;
    bar.focus();
  }, [showBar]);

  const closePreferences = useCallback(() => {
    setPrefsOpen(false);
  }, []);

  if (!undecided && !prefsOpen) return null;

  if (prefsOpen) {
    return (
      <ConsentDialog
        tracking={draft}
        onTrackingChange={setDraft}
        onReject={() => setConsent(false)}
        onSave={() => setConsent(draft)}
        onClose={closePreferences}
        canGoBack={undecided}
      />
    );
  }

  return (
    <ConsentBar
      containerRef={barRef}
      onAccept={() => setConsent(true)}
      onReject={() => setConsent(false)}
      onCustomize={openCookiePreferences}
    />
  );
}
