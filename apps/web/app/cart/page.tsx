"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getUser, isAuthenticated } from "@/lib/auth";
import { apiFetch, ApiError } from "@/lib/api";
import ProductImage from "@/components/ProductImage";
import AddressMap from "@/components/AddressMap";
import { clearGuestCart, getGuestCart, removeFromGuestCart, updateGuestCartQuantity, type GuestCartItem } from "@/lib/guest-cart";
import { mergeGuestCartIntoServer } from "@/lib/cart-merge";
import { trackMetaEvent } from "@/lib/facebook-pixel";
import { DEPARTMENTS, MUNICIPALITIES } from "@/lib/colombia";
import { lookupPostalCode } from "@/lib/postal-code";
import {
  CHECKOUT_FIELD_ORDER,
  DOCUMENT_TYPE_OPTIONS,
  canonicalDocType,
  canonicalizeCheckoutForm,
  documentTypeMeta,
  firstCheckoutErrorField,
  mapCheckoutApiErrors,
  resolveMunicipality,
  sanitizeDocNumberTyping,
  sanitizePhoneTyping,
  sanitizeZipTyping,
  validateCheckoutField,
  validateCheckoutForm,
  type CheckoutField,
  type CheckoutFormErrors,
  type CheckoutFormValues,
} from "@/lib/checkout-validation";

interface CartItem {
  id: string;
  quantity: number;
  /** Presentacion elegida (0 = ninguna). */
  variationId?: number;
  variationName?: string | null;
  product: {
    id: string;
    name: string;
    price: string | number;
    image: string;
    slug: string;
    stock?: number;
  };
}

interface Cart {
  items: CartItem[];
}

interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  price: string | number;
  variationName?: string | null;
  product: {
    name: string;
    image: string;
  };
}

interface Order {
  id: string;
  status: string;
  total: string | number;
  paymentMethod: string;
  shippingName: string | null;
  shippingAddress: string | null;
  shippingCity: string | null;
  createdAt: string;
  items: OrderItem[];
}

function guestToCartItem(item: GuestCartItem, index: number): CartItem {
  return {
    id: `guest-${index}`,
    quantity: item.quantity,
    variationId: item.variationId ?? 0,
    variationName: item.variationName ?? null,
    product: {
      id: item.productId,
      name: item.name,
      price: item.price,
      image: item.image,
      slug: item.slug || '',
    },
  };
}

const MAX_QUANTITY = 99;

/** Espera (ms) antes de buscar el codigo postal de la direccion escrita. */
const POSTAL_DEBOUNCE_MS = 600;

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  PAID: "Confirmado",
  SHIPPED: "Enviado",
  DELIVERED: "Entregado",
  CANCELLED: "Cancelado",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700",
  PAID: "bg-blue-100 text-blue-700",
  SHIPPED: "bg-purple-100 text-purple-700",
  DELIVERED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
};

function formatPrice(n: string | number) {
  return Number(n).toLocaleString("es-CO") + " COP";
}

const CHECKOUT_INPUT_BASE =
  "w-full rounded-xl border px-4 py-2.5 text-base sm:text-sm text-gray-900 outline-none transition focus:ring-4";
const CHECKOUT_INPUT_NORMAL =
  "border-gray-200 bg-gray-50/50 placeholder-gray-400 focus:border-blue-500 focus:bg-white focus:ring-blue-500/10";
const CHECKOUT_INPUT_ERROR =
  "border-red-400 bg-red-50/40 placeholder-red-300 focus:border-red-500 focus:bg-white focus:ring-red-500/10";

function checkoutInputClass(hasError: boolean, extra = "") {
  return `${CHECKOUT_INPUT_BASE} ${
    hasError ? CHECKOUT_INPUT_ERROR : CHECKOUT_INPUT_NORMAL
  } ${extra}`;
}

function CheckoutFieldError({
  id,
  message,
}: {
  id: string;
  message?: string;
}) {
  if (!message) return null;

  return (
    <p
      id={id}
      role="alert"
      className="mt-1.5 flex items-start gap-1.5 text-xs font-medium leading-5 text-red-600"
    >
      <svg
        className="mt-0.5 h-3.5 w-3.5 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v4m0 4h.01M10.29 3.86l-7.5 13A1 1 0 003.66 18h16.68a1 1 0 00.87-1.5l-7.5-13a1 1 0 00-1.74 0z"
        />
      </svg>
      <span>{message}</span>
    </p>
  );
}

export default function CartPage() {
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [showCheckout, setShowCheckout] = useState(false);
  const idempotencyRef = useRef<string | null>(null);
  const [shippingForm, setShippingForm] = useState<CheckoutFormValues>({
    shippingName: "",
    shippingPhone: "",
    shippingEmail: "",
    shippingDocType: "CC",
    shippingDocNumber: "",
    shippingAddress: "",
    shippingCity: "",
    shippingState: "",
    shippingZip: "",
    notes: "",
  });
  const [shippingErrors, setShippingErrors] = useState<CheckoutFormErrors>({});
  const [shippingTouched, setShippingTouched] = useState<
    Partial<Record<CheckoutField, boolean>>
  >({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  useEffect(() => {
    loadCart();
    if (isAuthenticated()) loadOrders();
  }, []);

  /**
   * Barra fija de "finalizar compra" en movil.
   *
   * En el movil el resumen del pedido queda debajo de la lista de productos:
   * el cliente tenia que bajar hasta el final del scroll para encontrar el
   * boton que completa la compra. Con la barra fija el total y el boton
   * estan siempre a la vista.
   */
  const [consentBarVisible, setConsentBarVisible] = useState(false);
  /** El chat abierto se lleva el boton de cerrar, que esta en la misma zona. */
  const [chatOpen, setChatOpen] = useState(false);
  const bottomBarVisible =
    items.length > 0 &&
    !showCheckout &&
    !consentBarVisible &&
    !chatOpen;

  /* El aviso de cookies es obligatorio y ocupa la parte baja de la pantalla:
     mientras este ahi no cabe otra barra. */
  useEffect(() => {
    function onConsentBarChange(event: Event) {
      const detail = (event as CustomEvent<{ visible?: boolean }>).detail;
      setConsentBarVisible(Boolean(detail?.visible));
    }

    window.addEventListener("store:consent-bar", onConsentBarChange);
    return () =>
      window.removeEventListener("store:consent-bar", onConsentBarChange);
  }, []);

  /* Con el chat abierto su boton de cerrar queda en la parte baja de la
     pantalla, justo donde va esta barra. */
  useEffect(() => {
    function onChatOpen(event: Event) {
      const detail = (event as CustomEvent<{ open?: boolean }>).detail;
      setChatOpen(Boolean(detail?.open));
    }

    window.addEventListener("store:chat-open", onChatOpen);
    return () => window.removeEventListener("store:chat-open", onChatOpen);
  }, []);

  /* Avisa al chat flotante de que la parte baja de la pantalla esta ocupada
     por la barra, para que su boton se aparte. */
  useEffect(() => {
    function avisar(visible: boolean) {
      window.dispatchEvent(
        new CustomEvent("store:bottom-bar", { detail: { visible } }),
      );
    }

    avisar(bottomBarVisible);
    return () => avisar(false);
  }, [bottomBarVisible]);

  /**
   * false = el campo lo pone el geocoder, true = lo escribio el cliente y ya no
   * se vuelve a tocar (salvo que lo borre, que lo devuelve a automatico).
   */
  const zipTouchedRef = useRef(false);
  const addressForLookup = [
    shippingForm.shippingAddress.trim(),
    shippingForm.shippingCity.trim(),
    shippingForm.shippingState.trim(),
  ]
    .filter(Boolean)
    .join(", ");
  const addressIsComplete = Boolean(
    shippingForm.shippingAddress.trim() &&
      shippingForm.shippingCity.trim() &&
      shippingForm.shippingState.trim(),
  );

  useEffect(() => {
    if (!addressIsComplete || zipTouchedRef.current) return;

    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const { zip } = await lookupPostalCode(addressForLookup, controller.signal);
      // Mientras se buscaba el cliente pudo escribir algo: manda lo suyo.
      if (cancelled || !zip || zipTouchedRef.current) return;
      // Devolver el mismo objeto si ya esta puesto evita renders en cascada.
      setShippingForm((prev) =>
        prev.shippingZip === zip ? prev : { ...prev, shippingZip: zip },
      );
    }, POSTAL_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [addressIsComplete, addressForLookup]);

  async function loadCart() {
    if (!isAuthenticated()) {
      const guestItems = getGuestCart();
      setItems(guestItems.map((item, i) => guestToCartItem(item, i)));
      setLoading(false);
      return;
    }

    try {
      /* Un cliente que armo el carrito sin iniciar sesion y luego se
         registro lo tiene en `localStorage`. Antes de mostrar el carrito del
         servidor se pasa lo que quedo ahi, o el cliente ve un carrito vacio
         y piensa que el boton de agregar no funciono. */
      await mergeGuestCartIntoServer();

      const cart = await apiFetch("/cart");
      setItems(cart?.items ?? []);
    } catch {
      setMessage({ type: "error", text: "Error al cargar el carrito" });
    } finally {
      setLoading(false);
    }
  }

  async function loadOrders() {
    if (!isAuthenticated()) return;

    try {
      const data = await apiFetch("/orders/my-orders?page=1&limit=5");
      setOrders(data.items ?? []);
    } catch {
      // ignore
    }
  }

  const handleRemoveItem = async (cartItemId: string) => {
    if (!isAuthenticated()) {
      const idx = parseInt(cartItemId.replace("guest-", ""), 10);
      const guestItems = getGuestCart();
      if (guestItems[idx]) {
        removeFromGuestCart(
          guestItems[idx].productId,
          guestItems[idx].variationId ?? 0,
        );
      }
      setItems((prev) => prev.filter((item) => item.id !== cartItemId));
      setMessage({ type: "success", text: "Producto removido" });
      setTimeout(() => setMessage(null), 2000);
      return;
    }

    try {
      await apiFetch(`/cart/${cartItemId}`, { method: "DELETE" });
      window.dispatchEvent(new Event("cart-change"));
      setItems((prev) => prev.filter((item) => item.id !== cartItemId));
      setMessage({ type: "success", text: "Producto removido" });
      setTimeout(() => setMessage(null), 2000);
    } catch {
      setMessage({ type: "error", text: "Error al remover producto" });
    }
  };

  const handleUpdateQuantity = async (cartItemId: string, delta: number) => {
    if (!isAuthenticated()) {
      const idx = parseInt(cartItemId.replace("guest-", ""), 10);
      const guestItems = getGuestCart();
      const guestItem = guestItems[idx];
      if (!guestItem) return;
      const next = Math.min(
        MAX_QUANTITY,
        Math.max(1, guestItem.quantity + delta),
      );
      updateGuestCartQuantity(
        guestItem.productId,
        next,
        guestItem.variationId ?? 0,
      );
      setItems((prev) =>
        prev.map((item) =>
          item.id === cartItemId ? { ...item, quantity: next } : item,
        ),
      );
      return;
    }

    const item = items.find((i) => i.id === cartItemId);
    if (!item) return;
    const stock = item.product.stock ?? MAX_QUANTITY;
    const next = Math.min(stock, Math.max(1, item.quantity + delta));
    if (next === item.quantity) return;

    try {
      await apiFetch(`/cart/${cartItemId}`, {
        method: "PATCH",
        body: JSON.stringify({ quantity: next }),
      });
      window.dispatchEvent(new Event("cart-change"));
      setItems((prev) =>
        prev.map((i) =>
          i.id === cartItemId ? { ...i, quantity: next } : i,
        ),
      );
    } catch (err) {
      setMessage({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Error al actualizar cantidad",
      });
    }
  };

  const handleClearCart = () => {
    if (!isAuthenticated()) {
      items.forEach((item) => {
        const idx = parseInt(item.id.replace("guest-", ""), 10);
        const guestItems = getGuestCart();
        if (guestItems[idx]) {
          removeFromGuestCart(
            guestItems[idx].productId,
            guestItems[idx].variationId ?? 0,
          );
        }
      });
      setItems([]);
      setMessage({ type: "success", text: "Carrito vaciado" });
      setTimeout(() => setMessage(null), 2000);
      return;
    }
    setMessage({ type: "error", text: "Función disponible solo para usuarios registrados" });
  };

  const checkoutFieldId = (field: CheckoutField) => `checkout-${field}`;

  function focusFirstCheckoutError(errors: CheckoutFormErrors) {
    const field = firstCheckoutErrorField(errors);
    if (!field) return;

    // El error ya quedo en el estado, pero el elemento con el id siempre esta
    // montado. `requestAnimationFrame` deja que el navegador pinte el borde
    // rojo antes de mover el foco.
    requestAnimationFrame(() => {
      document.getElementById(checkoutFieldId(field))?.focus();
    });
  }

  function markAllCheckoutFieldsTouched() {
    const touched: Partial<Record<CheckoutField, boolean>> = {};
    for (const field of CHECKOUT_FIELD_ORDER) touched[field] = true;
    setShippingTouched(touched);
  }

  /**
   * Guarda el formulario y revalida solo los campos que ya fueron tocados (o
   * todos, si ya se intento enviar). Asi el cliente no ve errores rojos antes
   * de escribir, pero cuando corrige un dato ve el resultado de inmediato.
   */
  function commitCheckoutForm(
    nextForm: CheckoutFormValues,
    fieldsToValidate: CheckoutField[],
    fieldsToClear: CheckoutField[] = [],
  ) {
    const options = { isGuest: !isAuthenticated() };

    setShippingForm(nextForm);
    setShippingErrors((prev) => {
      const next = { ...prev };
      for (const field of fieldsToClear) delete next[field];

      for (const field of fieldsToValidate) {
        if (!submitAttempted && !shippingTouched[field]) continue;
        const error = validateCheckoutField(field, nextForm, options);
        if (error) next[field] = error;
        else delete next[field];
      }

      return next;
    });
  }

  function handleShippingChange(field: CheckoutField, rawValue: string) {
    if (field === "shippingState") {
      // Cambiar de departamento invalida la ciudad y el codigo postal que se
      // habian elegido para el anterior.
      const next: CheckoutFormValues = {
        ...shippingForm,
        shippingState: rawValue,
        shippingCity: "",
        shippingZip: "",
      };
      zipTouchedRef.current = false;
      commitCheckoutForm(
        next,
        ["shippingState", "shippingCity"],
        ["shippingZip"],
      );
      return;
    }

    if (field === "shippingDocType") {
      const nextType = canonicalDocType(rawValue);
      const next: CheckoutFormValues = {
        ...shippingForm,
        shippingDocType: nextType,
        // Al cambiar de pasaporte a cedula (o al contrario) se descartan los
        // caracteres que ya no aplican.
        shippingDocNumber: sanitizeDocNumberTyping(
          shippingForm.shippingDocNumber,
          nextType,
        ),
      };
      commitCheckoutForm(next, ["shippingDocType", "shippingDocNumber"]);
      return;
    }

    let value = rawValue;
    if (field === "shippingPhone") value = sanitizePhoneTyping(rawValue);
    if (field === "shippingDocNumber") {
      value = sanitizeDocNumberTyping(rawValue, shippingForm.shippingDocType);
    }
    if (field === "shippingZip") {
      value = sanitizeZipTyping(rawValue);
      zipTouchedRef.current = value.length > 0;
    }

    const next: CheckoutFormValues = { ...shippingForm, [field]: value };
    commitCheckoutForm(next, [field]);
  }

  function handleShippingBlur(field: CheckoutField) {
    setShippingTouched((prev) => ({ ...prev, [field]: true }));

    let nextForm = shippingForm;

    // La lista de municipios es la que entiende Dropi. Si el cliente escribio
    // "Medellin" o "San Jose de Cucuta", se guarda el nombre canonico.
    if (field === "shippingCity") {
      const canonical = resolveMunicipality(
        shippingForm.shippingState,
        shippingForm.shippingCity,
      );
      if (canonical && canonical !== shippingForm.shippingCity) {
        nextForm = { ...shippingForm, shippingCity: canonical };
        setShippingForm(nextForm);
        zipTouchedRef.current = false;
      }
    }

    const error = validateCheckoutField(field, nextForm, {
      isGuest: !isAuthenticated(),
    });
    setShippingErrors((prev) => {
      const next = { ...prev };
      if (error) next[field] = error;
      else delete next[field];
      return next;
    });
  }

  function handleCloseCheckout() {
    setShowCheckout(false);
    setShippingErrors({});
    setShippingTouched({});
    setSubmitAttempted(false);
    setMessage(null);
  }

  const handleOpenCheckout = () => {
    // Comprar no exige cuenta: el invitado llena sus datos de envio y el
    // backend recibe sus lineas de carrito en el cuerpo de la peticion.
    setShippingForm({
      shippingName: "",
      shippingPhone: "",
      shippingEmail: "",
      shippingDocType: "CC",
      shippingDocNumber: "",
      shippingAddress: "",
      shippingCity: "",
      shippingState: "",
      shippingZip: "",
      notes: "",
    });
    // El formulario arranca de cero: el codigo postal vuelve a ser automatico.
    zipTouchedRef.current = false;
    setShippingErrors({});
    setShippingTouched({});
    setSubmitAttempted(false);
    setMessage(null);
    void trackMetaEvent("InitiateCheckout", {
      num_items: items.reduce((acc, item) => acc + item.quantity, 0),
      value: items.reduce(
        (acc, item) =>
          acc + Number(item.product.price) * item.quantity,
        0,
      ),
      currency: "COP",
    });
    setShowCheckout(true);
  };

  const handleCheckoutSubmit = async (
    event?: FormEvent<HTMLFormElement>,
  ) => {
    event?.preventDefault();
    const registrado = isAuthenticated();
    const errors = validateCheckoutForm(shippingForm, {
      isGuest: !registrado,
    });

    if (Object.keys(errors).length > 0) {
      setShippingErrors(errors);
      markAllCheckoutFieldsTouched();
      setSubmitAttempted(true);
      setMessage({
        type: "error",
        text: "Revisa los campos marcados: hay datos que faltan o no son válidos.",
      });
      focusFirstCheckoutError(errors);
      return;
    }

    // Normalizacion final: telefono en 10 digitos, tipo de documento que
    // entiende Dropi, ciudad canonica del catalogo, etc.
    const cleanForm = canonicalizeCheckoutForm(shippingForm);
    setShippingForm(cleanForm);
    setShippingErrors({});
    setSubmitAttempted(true);

    setCheckoutLoading(true);
    try {
      if (!idempotencyRef.current) {
        idempotencyRef.current = crypto.randomUUID();
      }
      // El invitado no tiene carrito en el servidor (el suyo vive en este
      // navegador), asi que manda sus lineas en el cuerpo. Precios, stock y
      // presentaciones los valida y calcula el backend, nunca el cliente.
      const guestItems = registrado
        ? undefined
        : getGuestCart().map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            variationId: item.variationId ?? 0,
          }));
      const res = await apiFetch("/orders/checkout", {
        method: "POST",
        body: JSON.stringify({
          ...cleanForm,
          idempotencyKey: idempotencyRef.current,
          ...(guestItems ? { items: guestItems } : {}),
        }),
      });
      idempotencyRef.current = null;

      const dropiStatus = res?.dropi?.success;
      const rechazado = dropiStatus === false && res?.dropi?.rechazo === true;
      const emailsStatus = res?.emails ?? {};
      const warnings: string[] = [];
      if (dropiStatus === false) {
        warnings.push(`No se envió a Dropi: ${res?.dropi?.message || "error desconocido"}`);
      }
      if (emailsStatus.customer === "failed") {
        warnings.push("No se pudo enviar la factura al cliente por correo.");
      }
      if (emailsStatus.admin === "failed") {
        warnings.push("No se notificó al correo de la tienda (revisa SMTP).");
      }

      if (rechazado) {
        // Dropi dijo "no": el pedido quedó cancelado, así que no tiene sentido
        // decirle al cliente que salió bien ni vaciarle el carrito (necesita
        // corregir e intentar de nuevo).
        setMessage({
          type: "error",
          text: `✗ El proveedor no pudo aceptar el pedido: ${
            res?.dropi?.message || "motivo desconocido"
          }. No se envió nada; ajusta la cantidad o los datos e inténtalo de nuevo.`,
        });
        void loadOrders();
        return;
      }

      const dropiOrderId = res?.dropi?.orderId ?? null;

      setShowCheckout(false);
      setMessage({
        type: "success",
        text: warnings.length > 0
          ? `✓ Pedido realizado. Pagarás contra entrega. ${dropiOrderId ? `Orden #${dropiOrderId}.` : ""} ${warnings.join(" ")}`
          : dropiOrderId
          ? "✓ Pedido realizado con éxito. Pagarás contra entrega. Orden #" + dropiOrderId
          : "✓ Pedido realizado con éxito. Pagarás contra entrega.",
      });
      setItems([]);
      if (registrado) {
        window.dispatchEvent(new Event("cart-change"));
      } else {
        // El carrito del invitado vive en localStorage: hay que vaciarlo ahi
        // (tambien dispara `cart-change` para el contador de la cabecera).
        clearGuestCart();
      }
      void trackMetaEvent("Purchase", {
        value: items.reduce(
          (acc, item) =>
            acc + Number(item.product.price) * item.quantity,
          0,
        ),
        currency: "COP",
        num_items: items.reduce(
          (acc, item) => acc + item.quantity,
          0,
        ),
        content_ids: items.map((item) => item.product.id),
        email: cleanForm.shippingEmail || getUser()?.email || undefined,
        phone: cleanForm.shippingPhone || undefined,
      });
      await loadOrders();
    } catch (err: unknown) {
      // El API devuelve `errors` por campo cuando el esquema rechaza un dato.
      // Se pintan en el formulario para que el cliente sepa exactamente que
      // corregir, en vez de leer un mensaje generico.
      if (err instanceof ApiError && err.errors.length > 0) {
        const fieldErrors = mapCheckoutApiErrors(err.errors);
        if (Object.keys(fieldErrors).length > 0) {
          setShippingErrors((prev) => ({ ...prev, ...fieldErrors }));
          setSubmitAttempted(true);
          setShippingTouched((prev) => {
            const next = { ...prev };
            for (const field of Object.keys(fieldErrors)) {
              next[field as CheckoutField] = true;
            }
            return next;
          });
          setMessage({
            type: "error",
            text: "Revisa los campos marcados: el servidor encontró datos que no son válidos.",
          });
          focusFirstCheckoutError(fieldErrors);
          return;
        }
      }

      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Error al procesar compra",
      });
    } finally {
      setCheckoutLoading(false);
    }
  };

  const total = items.reduce((acc, item) => acc + Number(item.product.price) * item.quantity, 0);

  const totalFormatted = total.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
  });

  if (loading) {
    return (
      <main className="min-h-dvh bg-gradient-to-b from-orange-50 to-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-gray-200 border-t-orange-500 rounded-full animate-spin" />
          <p className="text-gray-500">Cargando carrito...</p>
        </div>
      </main>
    );
  }

  if (items.length === 0) {
    return (
      <main className="min-h-dvh bg-gradient-to-b from-orange-50 to-white">
        <div className="max-w-4xl mx-auto px-6 py-20">
          {message && (
            <div
              className={`mb-6 p-4 rounded-xl text-sm font-medium flex items-center gap-3 ${
                message.type === "success"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}
            >
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                  message.type === "success" ? "bg-emerald-200" : "bg-red-200"
                }`}
              >
                {message.type === "success" ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </span>
              {message.text}
            </div>
          )}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 text-center">
            <div className="w-20 h-20 mx-auto mb-6 bg-orange-100 rounded-full flex items-center justify-center">
              <svg className="w-10 h-10 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {message?.type === "success" ? "¡Compra realizada!" : "Tu carrito está vacío"}
            </h2>
            <p className="text-gray-500 mb-8 max-w-md mx-auto">
              {message?.type === "success"
                ? "Gracias por tu compra. Te enviaremos un correo con los detalles de tu pedido."
                : "Agrega productos para comenzar a comprar. Tenemos todo lo que necesitas."}
            </p>
            <Link
              href="/products"
              className="inline-flex items-center gap-2 bg-gray-900 text-white px-8 py-3.5 rounded-xl font-semibold hover:bg-gray-800 transition-all hover:-translate-y-0.5 shadow-lg shadow-gray-900/20"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
              </svg>
              Explorar productos
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-gradient-to-b from-orange-50 to-white">
      {/* `pb-28` en movil deja aire para la barra fija de "finalizar compra",
          que si no taparia el ultimo bloque (los pedidos recientes). */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 pb-28 lg:pb-12">

        {message && !showCheckout && (
          <div className={`mb-6 p-4 rounded-xl text-sm font-medium flex items-center gap-3 ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
              message.type === "success" ? "bg-emerald-200" : "bg-red-200"
            }`}>
              {message.type === "success" ? (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </span>
            {message.text}
          </div>
        )}

        {!isAuthenticated() && items.length > 0 && (
          <div className="mb-8 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl text-center">
            <p className="text-blue-800 text-sm">
              Compra sin cuenta o{" "}
              <Link href="/login" className="font-semibold underline">
                inicia sesión
              </Link>{" "}
              para ver tus pedidos en tu perfil.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Carrito de compras</h1>
          {items.length > 0 && (
            <span className="text-sm text-gray-500 bg-white px-4 py-1.5 rounded-full border border-gray-200">
              {items.length} {items.length === 1 ? "producto" : "productos"}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-100">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-stretch gap-4 sm:gap-6 p-4 sm:p-6 transition hover:bg-orange-50/50"
                  >
                    <div className="relative w-20 h-20 sm:w-24 sm:h-24 bg-gray-50 rounded-xl overflow-hidden border border-gray-100 shrink-0">
                      <ProductImage
                        src={item.product.image}
                        alt={item.product.name}
                        sizes="(max-width: 640px) 96px, 160px"
                        className="object-cover"
                      />
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-center py-0.5">
                      <Link
                        href={`/products/${item.product.slug}`}
                        className="text-sm sm:text-base font-semibold text-gray-900 hover:text-blue-600 transition-colors line-clamp-1 sm:line-clamp-2"
                      >
                        {item.product.name}
                      </Link>
                      {item.variationName && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          Presentación: {item.variationName}
                        </p>
                      )}
                      <p className="text-xs sm:text-sm text-gray-400 mt-0.5">{formatPrice(item.product.price)} c/u</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        {/* 40x40 en vez de 28x28: con 28px el dedo tapa el
                            boton y casi siempre se falla el primer toque.
                            Es el control que mas se usa en el movil. */}
                        <button
                          onClick={() => handleUpdateQuantity(item.id, -1)}
                          className="w-10 h-10 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 active:bg-gray-200 flex items-center justify-center text-gray-700 text-base font-bold transition disabled:opacity-40"
                          aria-label="Disminuir cantidad"
                        >
                          −
                        </button>
                        <span className="min-w-8 text-center text-sm font-semibold text-gray-700">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => handleUpdateQuantity(item.id, 1)}
                          className="w-10 h-10 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 active:bg-gray-200 flex items-center justify-center text-gray-700 text-base font-bold transition disabled:opacity-40"
                          aria-label="Aumentar cantidad"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col items-end justify-center gap-1 shrink-0">
                      <p className="font-bold text-sm sm:text-base text-gray-900 whitespace-nowrap">
                        {formatPrice(Number(item.product.price) * item.quantity)}
                      </p>
                      <button
                        onClick={() => handleRemoveItem(item.id)}
                        className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Quitar
                      </button>
                    </div>
                  </div>
                ))}

                <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 bg-gray-50/50">
                  <Link href="/products" className="flex items-center gap-2 text-xs sm:text-sm text-gray-500 hover:text-gray-900 transition-colors font-medium">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Seguir comprando
                  </Link>

                  <button
                    onClick={handleClearCart}
                    className="flex items-center gap-1.5 text-xs sm:text-sm text-red-400 hover:text-red-600 transition-colors font-medium"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Vaciar carrito
                  </button>
                </div>
              </div>
            </div>

          {items.length > 0 && (
            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sticky top-6 space-y-5">
                <h2 className="text-lg font-bold text-gray-900">Resumen del pedido</h2>

                <div className="space-y-3 pb-5 border-b border-gray-100">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Subtotal</span>
                    <span className="text-gray-900 font-medium">{totalFormatted}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Envío</span>
                    <span className="text-emerald-600 font-semibold">Gratis</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Pago</span>
                    <span className="text-gray-700 font-medium">Contra entrega</span>
                  </div>
                </div>

                <div className="flex justify-between text-lg font-bold">
                  <span className="text-gray-900">Total</span>
                  <span className="text-gray-900">{totalFormatted}</span>
                </div>

                <button
                  onClick={handleOpenCheckout}
                  disabled={checkoutLoading}
                  className={`w-full py-3.5 px-4 rounded-xl font-semibold text-white transition flex items-center justify-center gap-2 ${
                    checkoutLoading
                      ? "bg-gray-300 cursor-not-allowed"
                      : "bg-gray-900 hover:bg-gray-800 active:bg-gray-700 shadow-lg shadow-gray-900/20 hover:-translate-y-0.5"
                  }`}
                >
                  {checkoutLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Procesando...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Finalizar compra
                    </>
                  )}
                </button>

                <div className="pt-4 border-t border-gray-100 space-y-2.5">
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                      <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </span>
                    <span>Paga cuando recibas</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                      <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                      </svg>
                    </span>
                    <span>Envío gratis a todo Colombia</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                      <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                    </span>
                    <span>Soporte 24/7</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {isAuthenticated() && orders.length > 0 && (
          <div className="mt-16">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Tus pedidos recientes</h2>
              <Link href="/orders" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                Ver todos →
              </Link>
            </div>
            <div className="space-y-4">
              {orders.map((order) => (
                <div key={order.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
                  <div className="p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                        <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-mono text-gray-500">#{order.id.slice(0, 12)}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(order.createdAt).toLocaleDateString("es-CO", {
                            year: "numeric", month: "long", day: "numeric",
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${STATUS_COLORS[order.status] || "bg-gray-100 text-gray-700"}`}>
                        {STATUS_LABELS[order.status] || order.status}
                      </span>
                      <span className="font-bold text-gray-900 text-sm">
                        {formatPrice(order.total)}
                      </span>
                    </div>
                  </div>

                  {order.shippingName && (
                    <div className="border-t border-gray-50 px-5 py-3 bg-gray-50/50">
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span><span className="font-medium text-gray-600">Enviar a:</span> {order.shippingName} — {order.shippingAddress}, {order.shippingCity}</span>
                      </div>
                    </div>
                  )}

                  <div className="border-t border-gray-50 px-5 py-3">
                    <div className="flex gap-3 overflow-x-auto scrollbar-none">
                      {order.items.slice(0, 5).map((item) => (
                        <div key={item.id} className="flex-shrink-0 flex items-center gap-2.5 bg-gray-50 rounded-lg px-3 py-2">
                          <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-white">
                            <ProductImage
                              src={item.product.image}
                              alt={item.product.name}
                              sizes="36px"
                              className="object-cover"
                            />
                          </div>
                          <span className="text-xs text-gray-600 max-w-[120px] truncate font-medium">
                            {item.product.name}
                            {item.variationName ? ` · ${item.variationName}` : ""}
                          </span>
                        </div>
                      ))}
                      {order.items.length > 5 && (
                        <div className="flex-shrink-0 flex items-center text-xs text-gray-400 font-medium bg-gray-50 rounded-lg px-3">
                          +{order.items.length - 5} más
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Barra fija de compra (solo movil).

            En movil el resumen del pedido queda debajo de la lista de
            productos, asi que el boton de finalizar compra quedaba fuera
            de la pantalla hasta que el cliente llegaba al final del scroll.
            Esta barra lo deja siempre a la vista.

            En escritorio no se muestra: ahi el resumen va en una columna
            lateral que ya esta visible. */}
        {bottomBarVisible && (
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom,0px))] shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur lg:hidden">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-gray-500">
                  Total · {items.length}{" "}
                  {items.length === 1 ? "producto" : "productos"}
                </p>
                <p className="truncate text-sm font-bold text-gray-900">
                  {totalFormatted}
                </p>
              </div>

              {/* El invitado también compra: el checkout acepta sesión
                  opcional, así que el botón se muestra igual para todos. */}
              <button
                type="button"
                onClick={handleOpenCheckout}
                disabled={checkoutLoading}
                className={`flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold text-white transition active:scale-[0.99] ${
                  checkoutLoading
                    ? "bg-gray-300 cursor-not-allowed"
                    : "bg-gray-900 shadow-lg shadow-gray-900/20"
                }`}
              >
                {checkoutLoading ? (
                  <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                Finalizar compra
              </button>
            </div>
          </div>
        )}

        {showCheckout && (
          <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/60 backdrop-blur-sm p-4 pt-8 sm:pt-12 overflow-y-auto">
            {/* `animate-modal-in` es la animacion propia del proyecto.
                Antes se usaba `animate-in slide-in-from-bottom-4`, que viene
                del plugin `tailwindcss-animate`: ese plugin no esta
                instalado, asi que esas dos clases no existian y el modal
                aparecia de golpe, sin ningun efecto. */}
            <form
              onSubmit={handleCheckoutSubmit}
              noValidate
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-modal-in"
            >
              {/* Header */}
              <div className="relative bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 px-6 sm:px-8 py-6 text-white overflow-hidden">
                <div className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/10" />
                <div className="absolute right-12 bottom-0 h-20 w-20 rounded-full bg-white/10" />
                <div className="relative flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-blue-200">
                      Checkout
                    </p>
                    <h2 className="mt-1 text-2xl font-bold">Datos de env&iacute;o</h2>
                    <p className="mt-1 text-sm text-blue-100">
                      Pago contra entrega &middot; entregas a todo Colombia
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCloseCheckout}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white transition hover:bg-white/20 active:bg-white/30"
                    aria-label="Cerrar"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="relative mt-5 flex items-center gap-2">
                  {["Contacto", "Envío", "Pago"].map((step, i) => (
                    <div key={step} className="flex items-center gap-2">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${i < 2 ? "bg-white text-indigo-700" : "bg-white/20 text-white"}`}>
                        {i + 1}
                      </span>
                      <span className="hidden text-xs font-medium sm:block">{step}</span>
                      {i < 2 && <span className="h-px w-6 bg-white/30 sm:w-10" />}
                    </div>
                  ))}
                </div>
              </div>

              {message && (
                <div
                  role={message.type === "error" ? "alert" : "status"}
                  aria-live="polite"
                  className={`mx-6 mt-5 mb-0 p-4 rounded-xl text-sm font-medium flex items-center gap-3 ${
                    message.type === "success"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-red-50 text-red-700 border border-red-200"
                  }`}
                >
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                    message.type === "success" ? "bg-emerald-200" : "bg-red-200"
                  }`}>
                    {message.type === "success" ? (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </span>
                  {message.text}
                </div>
              )}

              <div className="px-6 sm:px-8 py-6 space-y-7">
                {/* Contacto */}
                <section>
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-indigo-700">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    Datos de contacto
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="checkout-shippingName"
                        className="mb-1.5 block text-sm font-medium text-gray-700"
                      >
                        Nombre completo *
                      </label>
                      <input
                        id="checkout-shippingName"
                        type="text"
                        autoComplete="name"
                        maxLength={100}
                        value={shippingForm.shippingName}
                        onChange={(e) =>
                          handleShippingChange("shippingName", e.target.value)
                        }
                        onBlur={() => handleShippingBlur("shippingName")}
                        aria-invalid={Boolean(shippingErrors.shippingName)}
                        aria-describedby={
                          shippingErrors.shippingName
                            ? "checkout-shippingName-error"
                            : undefined
                        }
                        aria-required="true"
                        className={checkoutInputClass(
                          Boolean(shippingErrors.shippingName),
                        )}
                        placeholder="Juan Pérez"
                      />
                      <CheckoutFieldError
                        id="checkout-shippingName-error"
                        message={shippingErrors.shippingName}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="checkout-shippingPhone"
                        className="mb-1.5 block text-sm font-medium text-gray-700"
                      >
                        Teléfono *
                      </label>
                      <input
                        id="checkout-shippingPhone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        maxLength={20}
                        value={shippingForm.shippingPhone}
                        onChange={(e) =>
                          handleShippingChange("shippingPhone", e.target.value)
                        }
                        onBlur={() => handleShippingBlur("shippingPhone")}
                        aria-invalid={Boolean(shippingErrors.shippingPhone)}
                        aria-describedby={
                          shippingErrors.shippingPhone
                            ? "checkout-shippingPhone-error"
                            : undefined
                        }
                        aria-required="true"
                        className={checkoutInputClass(
                          Boolean(shippingErrors.shippingPhone),
                        )}
                        placeholder="300 123 4567"
                      />
                      <CheckoutFieldError
                        id="checkout-shippingPhone-error"
                        message={shippingErrors.shippingPhone}
                      />
                    </div>
                  </div>
                  <div className="mt-4">
                    <label
                      htmlFor="checkout-shippingEmail"
                      className="mb-1.5 block text-sm font-medium text-gray-700"
                    >
                      Correo electrónico{!isAuthenticated() && " *"}
                    </label>
                    <input
                      id="checkout-shippingEmail"
                      type="email"
                      autoComplete="email"
                      maxLength={254}
                      value={shippingForm.shippingEmail}
                      onChange={(e) =>
                        handleShippingChange("shippingEmail", e.target.value)
                      }
                      onBlur={() => handleShippingBlur("shippingEmail")}
                      aria-invalid={Boolean(shippingErrors.shippingEmail)}
                      aria-describedby={
                        shippingErrors.shippingEmail
                          ? "checkout-shippingEmail-error checkout-shippingEmail-help"
                          : "checkout-shippingEmail-help"
                      }
                      aria-required={!isAuthenticated()}
                      className={checkoutInputClass(
                        Boolean(shippingErrors.shippingEmail),
                      )}
                      placeholder="cliente@correo.com"
                    />
                    <CheckoutFieldError
                      id="checkout-shippingEmail-error"
                      message={shippingErrors.shippingEmail}
                    />
                    <p
                      id="checkout-shippingEmail-help"
                      className="mt-1.5 text-xs text-gray-400"
                    >
                      {isAuthenticated()
                        ? "Si no lo llenas, la factura llega a tu correo registrado."
                        : "Sin cuenta, aquí recibirás la factura y las novedades del pedido."}
                    </p>
                  </div>
                </section>

                {/* Documento */}
                <section className="border-t border-gray-100 pt-6">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-indigo-700">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                    </svg>
                    Documento de identidad
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="checkout-shippingDocType"
                        className="mb-1.5 block text-sm font-medium text-gray-700"
                      >
                        Tipo de documento *
                      </label>
                      <select
                        id="checkout-shippingDocType"
                        value={shippingForm.shippingDocType}
                        onChange={(e) =>
                          handleShippingChange(
                            "shippingDocType",
                            e.target.value,
                          )
                        }
                        onBlur={() => handleShippingBlur("shippingDocType")}
                        aria-invalid={Boolean(shippingErrors.shippingDocType)}
                        aria-describedby={
                          shippingErrors.shippingDocType
                            ? "checkout-shippingDocType-error"
                            : undefined
                        }
                        aria-required="true"
                        className={checkoutInputClass(
                          Boolean(shippingErrors.shippingDocType),
                        )}
                      >
                        {DOCUMENT_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <CheckoutFieldError
                        id="checkout-shippingDocType-error"
                        message={shippingErrors.shippingDocType}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="checkout-shippingDocNumber"
                        className="mb-1.5 block text-sm font-medium text-gray-700"
                      >
                        Número de documento *
                      </label>
                      <input
                        id="checkout-shippingDocNumber"
                        type="text"
                        inputMode={
                          documentTypeMeta(shippingForm.shippingDocType)
                            .inputMode
                        }
                        maxLength={
                          documentTypeMeta(shippingForm.shippingDocType)
                            .maxLength
                        }
                        value={shippingForm.shippingDocNumber}
                        onChange={(e) =>
                          handleShippingChange(
                            "shippingDocNumber",
                            e.target.value,
                          )
                        }
                        onBlur={() => handleShippingBlur("shippingDocNumber")}
                        aria-invalid={Boolean(shippingErrors.shippingDocNumber)}
                        aria-describedby={
                          shippingErrors.shippingDocNumber
                            ? "checkout-shippingDocNumber-error checkout-shippingDocNumber-help"
                            : "checkout-shippingDocNumber-help"
                        }
                        aria-required="true"
                        className={checkoutInputClass(
                          Boolean(shippingErrors.shippingDocNumber),
                        )}
                        placeholder={
                          documentTypeMeta(shippingForm.shippingDocType)
                            .placeholder
                        }
                      />
                      <CheckoutFieldError
                        id="checkout-shippingDocNumber-error"
                        message={shippingErrors.shippingDocNumber}
                      />
                    </div>
                  </div>
                  <p
                    id="checkout-shippingDocNumber-help"
                    className="mt-2 text-xs text-gray-400"
                  >
                    {documentTypeMeta(shippingForm.shippingDocType).help} Lo
                    piden las transportadoras para la entrega y el cobro contra
                    entrega.
                  </p>
                </section>

                {/* Dirección */}
                <section className="border-t border-gray-100 pt-6">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-indigo-700">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Dirección de entrega
                  </h3>
                  <div>
                    <label
                      htmlFor="checkout-shippingAddress"
                      className="mb-1.5 block text-sm font-medium text-gray-700"
                    >
                      Dirección *
                    </label>
                    <input
                      id="checkout-shippingAddress"
                      type="text"
                      autoComplete="street-address"
                      maxLength={300}
                      value={shippingForm.shippingAddress}
                      onChange={(e) =>
                        handleShippingChange("shippingAddress", e.target.value)
                      }
                      onBlur={() => handleShippingBlur("shippingAddress")}
                      aria-invalid={Boolean(shippingErrors.shippingAddress)}
                      aria-describedby={
                        shippingErrors.shippingAddress
                          ? "checkout-shippingAddress-error"
                          : undefined
                      }
                      aria-required="true"
                      className={checkoutInputClass(
                        Boolean(shippingErrors.shippingAddress),
                      )}
                      placeholder="Calle 123 # 45-67, casa / apto 3"
                    />
                    <CheckoutFieldError
                      id="checkout-shippingAddress-error"
                      message={shippingErrors.shippingAddress}
                    />
                  </div>
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="checkout-shippingState"
                        className="mb-1.5 block text-sm font-medium text-gray-700"
                      >
                        Departamento *
                      </label>
                      <select
                        id="checkout-shippingState"
                        value={shippingForm.shippingState}
                        onChange={(e) =>
                          handleShippingChange(
                            "shippingState",
                            e.target.value,
                          )
                        }
                        onBlur={() => handleShippingBlur("shippingState")}
                        aria-invalid={Boolean(shippingErrors.shippingState)}
                        aria-describedby={
                          shippingErrors.shippingState
                            ? "checkout-shippingState-error"
                            : undefined
                        }
                        aria-required="true"
                        className={checkoutInputClass(
                          Boolean(shippingErrors.shippingState),
                        )}
                      >
                        <option value="">Selecciona un departamento</option>
                        {DEPARTMENTS.map((d) => (
                          <option key={d.value} value={d.value}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                      <CheckoutFieldError
                        id="checkout-shippingState-error"
                        message={shippingErrors.shippingState}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="checkout-shippingCity"
                        className="mb-1.5 block text-sm font-medium text-gray-700"
                      >
                        Ciudad / municipio *
                      </label>
                      <input
                        id="checkout-shippingCity"
                        type="text"
                        list="ciudades-colombia"
                        autoComplete="address-level2"
                        maxLength={120}
                        value={shippingForm.shippingCity}
                        onChange={(e) =>
                          handleShippingChange("shippingCity", e.target.value)
                        }
                        onBlur={() => handleShippingBlur("shippingCity")}
                        disabled={!shippingForm.shippingState}
                        aria-invalid={Boolean(shippingErrors.shippingCity)}
                        aria-describedby={
                          shippingErrors.shippingCity
                            ? "checkout-shippingCity-error"
                            : undefined
                        }
                        aria-required="true"
                        className={checkoutInputClass(
                          Boolean(shippingErrors.shippingCity),
                          "disabled:cursor-not-allowed disabled:opacity-60",
                        )}
                        placeholder={
                          shippingForm.shippingState
                            ? "Ej: Medellín"
                            : "Primero elige el departamento"
                        }
                      />
                      <CheckoutFieldError
                        id="checkout-shippingCity-error"
                        message={shippingErrors.shippingCity}
                      />
                      <datalist id="ciudades-colombia">
                        {(MUNICIPALITIES[shippingForm.shippingState] ?? []).map(
                          (c) => (
                            <option key={c} value={c} />
                          ),
                        )}
                      </datalist>
                    </div>
                  </div>
                  <AddressMap
                    address={shippingForm.shippingAddress}
                    city={shippingForm.shippingCity}
                    state={shippingForm.shippingState}
                  />
                  <div className="mt-4">
                    <label
                      htmlFor="checkout-shippingZip"
                      className="mb-1.5 block text-sm font-medium text-gray-700"
                    >
                      C&oacute;digo postal{" "}
                      <span className="font-normal text-gray-400">
                        (opcional)
                      </span>
                    </label>
                    <input
                      id="checkout-shippingZip"
                      type="text"
                      inputMode="numeric"
                      autoComplete="postal-code"
                      maxLength={6}
                      value={shippingForm.shippingZip}
                      onChange={(e) =>
                        handleShippingChange("shippingZip", e.target.value)
                      }
                      onBlur={() => handleShippingBlur("shippingZip")}
                      aria-invalid={Boolean(shippingErrors.shippingZip)}
                      aria-describedby={
                        [
                          shippingErrors.shippingZip
                            ? "checkout-shippingZip-error"
                            : null,
                          !shippingForm.shippingZip
                            ? "checkout-shippingZip-help"
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" ") || undefined
                      }
                      className={checkoutInputClass(
                        Boolean(shippingErrors.shippingZip),
                      )}
                      placeholder="110111"
                    />
                    <CheckoutFieldError
                      id="checkout-shippingZip-error"
                      message={shippingErrors.shippingZip}
                    />
                    {!shippingForm.shippingZip && (
                      <p
                        id="checkout-shippingZip-help"
                        className="mt-1.5 text-xs text-gray-400"
                      >
                        Se completa solo con la direcci&oacute;n;
                        ed&iacute;talo si no coincide.
                      </p>
                    )}
                  </div>
                  <div className="mt-4">
                    <label
                      htmlFor="checkout-notes"
                      className="mb-1.5 block text-sm font-medium text-gray-700"
                    >
                      Notas del pedido
                    </label>
                    <textarea
                      id="checkout-notes"
                      maxLength={1000}
                      value={shippingForm.notes}
                      onChange={(e) =>
                        handleShippingChange("notes", e.target.value)
                      }
                      onBlur={() => handleShippingBlur("notes")}
                      aria-invalid={Boolean(shippingErrors.notes)}
                      aria-describedby={
                        shippingErrors.notes
                          ? "checkout-notes-error"
                          : undefined
                      }
                      rows={2}
                      className={checkoutInputClass(
                        Boolean(shippingErrors.notes),
                        "resize-none",
                      )}
                      placeholder="Indicaciones adicionales para la entrega..."
                    />
                    <CheckoutFieldError
                      id="checkout-notes-error"
                      message={shippingErrors.notes}
                    />
                  </div>
                </section>

                <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 p-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-200">
                    <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">Pago contra entrega</p>
                    <p className="text-sm text-emerald-600">Pagas en efectivo cuando recibas el producto</p>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 bg-gray-50/70 px-6 sm:px-8 py-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <p className="text-sm text-gray-500">
                    Total a pagar <span className="text-gray-400">(contra entrega)</span>
                  </p>
                  <p className="text-2xl font-bold text-gray-900">{totalFormatted}</p>
                </div>
                <button
                  type="submit"
                  disabled={checkoutLoading}
                  className={`w-full sm:w-auto px-8 py-3.5 rounded-xl font-semibold text-white transition flex items-center justify-center gap-2 shadow-lg ${
                    checkoutLoading
                      ? "bg-gray-300 cursor-not-allowed shadow-none"
                      : "bg-gradient-to-r from-blue-600 to-indigo-600 shadow-blue-600/25 hover:from-blue-700 hover:to-indigo-700 hover:-translate-y-0.5 active:translate-y-0"
                  }`}
                >
                  {checkoutLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Procesando...
                    </>
                  ) : (
                    <>
                      Confirmar pedido
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
