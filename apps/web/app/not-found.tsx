import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 px-6 py-32 text-center">
      <p className="text-6xl font-black text-slate-200">404</p>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-slate-900">
          No encontramos esta pagina
        </h1>
        <p className="max-w-md text-sm text-slate-600">
          El enlace puede estar roto o el producto que buscas ya no esta
          disponible.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/products"
          className="rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          Ver productos
        </Link>
        <Link
          href="/"
          className="rounded-full border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}
