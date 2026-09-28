"use client";

import { ErrorState } from "@/components/Feedback";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      title="Error en el panel de administracion"
      message="No pudimos cargar esta seccion. Si el problema continua, revisa que tu sesion de administrador siga vigente."
      detail={error}
      onRetry={reset}
      retryLabel="Reintentar"
    />
  );
}
