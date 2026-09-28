/**
 * Estados de carga y error reutilizables.
 *
 * Antes cada pagina tenia su propio spinner inline y su propio bloque de error,
 * asi que un fallo de red dejaba pantalla en blanco o un mensaje sin accion.
 * Estos dos componentes son la base de los `loading.tsx` y `error.tsx` del
 * App Router.
 */

export function LoadingState({
  label = "Cargando...",
  rows = 3,
}: {
  label?: string;
  rows?: number;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex flex-col items-center justify-center gap-4 px-6 py-24 text-center"
    >
      <span
        aria-hidden="true"
        className="h-9 w-9 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600"
      />
      <p className="text-sm font-medium text-slate-500">{label}</p>
      {rows > 0 ? (
        <div className="grid w-full max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: rows }, (_, i) => (
            <div
              key={i}
              className="h-64 animate-pulse rounded-3xl border border-slate-200 bg-slate-100"
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Muestra errores sin filtrar el mensaje tecnico al usuario final.
 *
 * El detalle se imprime en consola para poder diagnosticarlo, pero en pantalla
 * solo se muestra un texto generico: los mensajes de `fetch` y de NestJS
 * incluyen URLs internas y nombres de tabla.
 */
export function ErrorState({
  title = "Algo salio mal",
  message = "No pudimos cargar esta informacion. Intentalo de nuevo en unos segundos.",
  detail,
  onRetry,
  retryLabel = "Reintentar",
}: {
  title?: string;
  message?: string;
  detail?: unknown;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  if (detail) {
    console.error("[ErrorState]", detail);
  }

  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-5 px-6 py-24 text-center"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-2xl">
        <span aria-hidden="true">!</span>
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        <p className="max-w-md text-sm text-slate-600">{message}</p>
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
