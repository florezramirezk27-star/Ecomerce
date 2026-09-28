"use client";

import { ErrorState } from "@/components/Feedback";

export default function ProductsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      title="No pudimos cargar los productos"
      detail={error}
      onRetry={reset}
    />
  );
}
