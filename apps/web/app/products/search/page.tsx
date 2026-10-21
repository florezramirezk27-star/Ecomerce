import ProductSearchClient from '@/components/ProductSearchClient';

/**
 * La busqueda llega por la URL desde la cabecera (`/products/search?search=...`).
 *
 * La pagina es un componente de servidor que lee el parametro y se lo pasa al
 * cliente, en vez de leer `useSearchParams()` en el cliente: asi el campo
 * aparece con el termino ya escrito en el primer render, sin esperar al
 * arranque del JS y sin el error de hidratacion que da leer la URL en el
 * navegador.
 */
export default async function ProductSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string | string[] }>;
}) {
  let initialSearch = '';

  try {
    const params = await searchParams;
    const value = params?.search;
    if (typeof value === 'string') {
      initialSearch = value;
    } else if (Array.isArray(value)) {
      initialSearch = value[0] ?? '';
    }
  } catch {
    initialSearch = '';
  }

  return <ProductSearchClient initialSearch={initialSearch} />;
}
