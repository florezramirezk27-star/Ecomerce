import { apiFetch } from "@/lib/api";
import {
  getGuestCart,
  removeGuestCartItems,
  type GuestCartItem,
} from "@/lib/guest-cart";

/**
 * Pasa el carrito de invitado al carrito del servidor.
 *
 * Sin esto, un cliente que arma el carrito sin iniciar sesion y despues se
 * registra pierde todo lo que habia agregado: el carrito de invitado vive en
 * `localStorage` y el del servidor en la base de datos, y nadie los juntaba.
 * Desde fuera se ve como si el boton "Agregar al carrito" no hiciera nada:
 * se agregaba, se iniciaba sesion y el carrito aparecia vacio.
 *
 * Solo se quitan del `localStorage` las lineas que si se pudieron pasar. Si
 * un producto falla (agotado, borrado del catalogo) se sigue con las demas:
 * perder una linea no debe hacer perder el carrito entero.
 */
export async function mergeGuestCartIntoServer(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  const guestItems = getGuestCart();
  if (guestItems.length === 0) return false;

  const merged: GuestCartItem[] = [];

  for (const item of guestItems) {
    try {
      await apiFetch("/cart/add", {
        method: "POST",
        body: JSON.stringify({
          productId: item.productId,
          quantity: item.quantity,
          variationId: item.variationId ?? 0,
          // La promocion viaja con la linea: si no, al pasar al servidor la
          // linea dejaria de cobrarse con el precio de oferta.
          promotion: item.promotion === true,
        }),
      });
      merged.push(item);
    } catch {
      // Se deja la linea en el carrito de invitado: si el producto vuelve a
      // estar disponible, el cliente no la pierde.
    }
  }

  /* Se quitan de una vez las lineas que si pasaron, para no recargar el
     contador de la cabecera una vez por producto. */
  removeGuestCartItems(merged);

  if (merged.length > 0) {
    /* Por si el contador de la cabecera estaba en cero: con la sesion nueva
       todavia puede no saber cuantos articulos hay. */
    window.dispatchEvent(new Event("cart-change"));
  }

  return merged.length > 0;
}
