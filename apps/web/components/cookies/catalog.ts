import type { ConsentCategory } from "@/lib/consent";

/**
 * Lo que el navegador guarda de verdad, con nombre, para que y por cuanto
 * tiempo. Esta tabla es la que se muestra en el panel de preferencias: un
 * aviso que no dice que cookies pone ni cuanto duran no cumple el deber de
 * informacion, por muy bonito que sea.
 *
 * Si se agrega o se cambia algo aqui, hay que subir `CONSENT_VERSION` en
 * `lib/consent.ts` para que vuelva a preguntar a quien ya habia aceptado.
 */

export interface StoredItem {
  name: string;
  purpose: string;
  duration: string;
}

export interface ConsentCategoryInfo {
  id: ConsentCategory;
  name: string;
  /** Frase corta de una linea, para el resumen. */
  summary: string;
  purpose: string;
  /** Encargado del tratamiento, cuando el dato sale de la tienda. */
  vendor?: string;
  items: StoredItem[];
  /** Las esenciales no se pueden apagar. */
  locked?: boolean;
}

export const CATEGORIES: ConsentCategoryInfo[] = [
  {
    id: "essentials",
    name: "Esenciales",
    summary: "Sin ellas la tienda no funciona",
    purpose:
      "Permiten que el carrito, el inicio de sesion y la proteccion contra fraude funcionen. La Ley 1581 de 2012 no exige autorizacion para el tratamiento necesario para prestar un servicio contratado, por eso no se pueden desactivar.",
    locked: true,
    items: [
      {
        name: "csrf-token",
        purpose: "Verifica que los formularios los envia nuestra pagina y no un tercero.",
        duration: "Mientras dure la sesion",
      },
      {
        name: "token / role",
        purpose: "Mantiene tu sesion iniciada y los permisos de tu cuenta.",
        duration: "Hasta que cierres sesion",
      },
      {
        name: "guest_cart",
        purpose: "Guarda los productos del carrito cuando compras sin iniciar sesion.",
        duration: "Hasta que vacies el carrito",
      },
      {
        name: "kronio.consent",
        purpose: "Registra tu decision sobre las cookies para no volver a preguntartelo.",
        duration: "Hasta que la borres",
      },
    ],
  },
  {
    id: "tracking",
    name: "Analitica y publicidad",
    summary: "Nos dicen que funciona y que te interesa",
    purpose:
      "Con tu permiso usamos el pixel de Meta para medir el trafico, entender que productos te interesan y mostrarte anuncios relevantes en Facebook e Instagram. Si no lo aceptas, nada de esto se carga y tus datos nunca salen de la tienda.",
    vendor: "Meta Platforms, Inc.",
    items: [
      {
        name: "_fbp",
        purpose: "Identifica tu navegador para medir visitas y segmentar la publicidad.",
        duration: "3 meses",
      },
      {
        name: "_fbc",
        purpose: "Se crea unicamente si haces clic en un anuncio nuestro de Facebook o Instagram.",
        duration: "3 meses",
      },
    ],
  },
];

export function categoryInfo(id: ConsentCategory): ConsentCategoryInfo {
  const found = CATEGORIES.find((c) => c.id === id);
  if (!found) throw new Error(`Categoria de consentimiento desconocida: ${id}`);
  return found;
}
