"use client";

import { ErrorState } from "@/components/Feedback";

/**
 * Ultima linea de defensa: este boundary envuelve el `<html>` completo, asi que
 * se usa cuando falla `app/layout.tsx` y los boundaries de las rutas no llegan a
 * montarse. Por eso debe renderizar sus propias etiquetas html/body y no puede
 * depender de ningun componente del App Router.
 */
export default function GlobalRootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
          backgroundColor: "#f8fafc",
          color: "#0f172a",
        }}
      >
        <ErrorState
          title="Error inesperado"
          message="La aplicacion no pudo cargar. Intentalo de nuevo."
          detail={error}
          onRetry={reset}
        />
      </body>
    </html>
  );
}
