"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/Feedback";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app/error]", error);
  }, [error]);

  return (
    <ErrorState
      title="Error inesperado"
      message="Algo fallo al renderizar esta pagina. Puedes reintentar sin perder la sesion."
      detail={error}
      onRetry={reset}
    />
  );
}
