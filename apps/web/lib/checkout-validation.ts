import { DEPARTMENTS, MUNICIPALITIES } from "./colombia";

/**
 * Reglas de validacion del checkout.
 *
 * Dropi arma una orden con estos datos y varios de sus campos tienen reglas
 * propias: el telefono debe tener al menos 10 caracteres, el nombre y el
 * apellido viajan separados, la direccion no puede ir vacia y la ciudad debe
 * existir en el departamento. Validar aqui, antes de enviar, evita crear un
 * pedido que Dropi va a rechazar despues (cuando el cliente ya se fue).
 *
 * El modulo es puro: no toca React, red ni localStorage. Asi se puede probar y
 * reutilizar sin arrastrar el estado de la pagina.
 */

export interface CheckoutFormValues {
  shippingName: string;
  shippingPhone: string;
  shippingEmail: string;
  shippingDocType: string;
  shippingDocNumber: string;
  shippingAddress: string;
  shippingCity: string;
  shippingState: string;
  shippingZip: string;
  notes: string;
}

export type CheckoutField = keyof CheckoutFormValues;
export type CheckoutFormErrors = Partial<Record<CheckoutField, string>>;

export const CHECKOUT_FIELD_ORDER: CheckoutField[] = [
  "shippingName",
  "shippingPhone",
  "shippingEmail",
  "shippingDocType",
  "shippingDocNumber",
  "shippingAddress",
  "shippingState",
  "shippingCity",
  "shippingZip",
  "notes",
];

const NAME_MAX = 100;
const NAME_PART_MAX = 50;
const PHONE_MAX = 30;
const ADDRESS_MAX = 300;
const CITY_MAX = 120;
const EMAIL_MAX = 254;
const DOC_MAX = 20;
const ZIP_MAX = 6;
const NOTES_MAX = 1000;

/**
 * Dropi valida nombre y apellido con este mismo conjunto de letras. No se usa
 * `\p{L}` porque el target de TypeScript del frontend es ES2017 y las
 * propiedades Unicode del regex requieren ES2018.
 */
const NAME_RE = /^[A-Za-záéíóúÁÉÍÓÚñÑüÜ]+(?:\s[A-Za-záéíóúÁÉÍÓÚñÑüÜ]+)*$/;
const PHONE_ALLOWED_RE = /^[\d\s+()-]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]{2,})+$/;

export const DOCUMENT_TYPE_OPTIONS = [
  { value: "CC", label: "Cédula de ciudadanía" },
  { value: "CE", label: "Cédula de extranjería" },
  { value: "NIT", label: "NIT" },
  { value: "PP", label: "Pasaporte" },
] as const;

export type CheckoutDocType = (typeof DOCUMENT_TYPE_OPTIONS)[number]["value"];

export interface DocumentTypeMeta {
  inputMode: "numeric" | "text";
  placeholder: string;
  maxLength: number;
  help: string;
}

const DOCUMENT_TYPE_META: Record<CheckoutDocType, DocumentTypeMeta> = {
  CC: {
    inputMode: "numeric",
    placeholder: "1012345678",
    maxLength: 10,
    help: "Solo números, entre 6 y 10 dígitos.",
  },
  CE: {
    inputMode: "numeric",
    placeholder: "1234567890",
    maxLength: 12,
    help: "Solo números, entre 6 y 12 dígitos.",
  },
  NIT: {
    inputMode: "numeric",
    placeholder: "900123456",
    maxLength: 15,
    help: "Solo números, entre 9 y 15 dígitos.",
  },
  PP: {
    inputMode: "text",
    placeholder: "AB1234567",
    maxLength: 20,
    help: "Letras y números, entre 5 y 20 caracteres.",
  },
};

function normalizeWord(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function collapseSpaces(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeGeoName(value: string): string {
  return stripAccents(String(value ?? ""))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(
      /\b(d c|dc|distrito capital|departamento|ciudad|municipio|corregimiento)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return dp[n];
}

export function canonicalDocType(value: string): CheckoutDocType | string {
  const normalized = normalizeWord(value);

  if (["PASSPORT", "PASAPORTE", "PASS", "PP"].includes(normalized)) {
    return "PP";
  }
  if (["CEDULA", "CEDULA DE CIUDADANIA", "CC"].includes(normalized)) {
    return "CC";
  }
  if (["CEDULA DE EXTRANJERIA", "CE"].includes(normalized)) return "CE";
  if (normalized === "NIT") return "NIT";

  return normalized;
}

export function documentTypeMeta(docType: string): DocumentTypeMeta {
  const type = canonicalDocType(docType);
  return DOCUMENT_TYPE_META[type as CheckoutDocType] ?? DOCUMENT_TYPE_META.CC;
}

/**
 * Deja solo lo que puede escribir el cliente en el campo de telefono. La
 * normalizacion real (quitar +57, espacios, etc.) se hace al validar/enviar.
 */
export function sanitizePhoneTyping(value: string): string {
  return value.replace(/[^\d\s+()-]/g, "").slice(0, 20);
}

/**
 * Deja un telefono colombiano en 10 digitos. Acepta las formas que escribe la
 * gente: "300 123 4567", "+57 300 123 4567", "0057...", "0 300...".
 */
export function normalizeCheckoutPhone(value: string): string {
  let digits = value.replace(/\D/g, "");

  if (digits.startsWith("0057")) digits = digits.slice(4);
  else if (digits.startsWith("57") && digits.length >= 12) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);

  return digits;
}

export function sanitizeDocNumberTyping(
  value: string,
  docType: string,
): string {
  const type = canonicalDocType(docType);

  if (type === "PP") {
    return value
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase()
      .slice(0, DOC_MAX);
  }

  const max = type === "NIT" ? 15 : type === "CE" ? 12 : 10;
  return value.replace(/\D/g, "").slice(0, max);
}

export function normalizeDocNumber(value: string, docType: string): string {
  return sanitizeDocNumberTyping(value, docType);
}

export function sanitizeZipTyping(value: string): string {
  return value.replace(/\D/g, "").slice(0, ZIP_MAX);
}

export function resolveDepartment(
  value: string,
): { value: string; label: string } | null {
  const wanted = normalizeGeoName(value);
  if (!wanted) return null;

  return (
    DEPARTMENTS.find(
      (department) =>
        normalizeGeoName(department.value) === wanted ||
        normalizeGeoName(department.label) === wanted,
    ) ?? null
  );
}

const municipalityIndex = new Map<
  string,
  Array<{ city: string; normalized: string }>
>();

function municipalitiesFor(stateValue: string) {
  const state = resolveDepartment(stateValue);
  if (!state) return [];

  const cached = municipalityIndex.get(state.value);
  if (cached) return cached;

  const items = (MUNICIPALITIES[state.value] ?? []).map((city) => ({
    city,
    normalized: normalizeGeoName(city),
  }));
  municipalityIndex.set(state.value, items);
  return items;
}

/**
 * Devuelve el nombre canonico del municipio o null si no pertenece al
 * departamento. Acepta diferencias de tilde/mayusculas, nombres compuestos
 * ("San Jose de Cucuta" -> "Cucuta") y errores pequenos de escritura. Dropi
 * recibe el nombre canonico, que es el que su catalogo reconoce.
 */
export function resolveMunicipality(
  state: string,
  city: string,
): string | null {
  const wanted = normalizeGeoName(city);
  if (!wanted) return null;

  const cities = municipalitiesFor(state);
  if (cities.length === 0) return null;

  const exact = cities.find((item) => item.normalized === wanted);
  if (exact) return exact.city;

  // Evita que un fragmento muy corto ("San") se convierta en el primer
  // municipio que lo contenga. Con 4 letras ya se puede desambiguar mejor.
  if (wanted.length < 4) return null;

  const contains = cities.find(({ normalized }) => {
    if (!normalized) return false;
    return (
      normalized.startsWith(`${wanted} `) ||
      normalized.endsWith(` ${wanted}`) ||
      normalized.includes(` ${wanted} `) ||
      wanted.startsWith(`${normalized} `) ||
      wanted.endsWith(` ${normalized}`) ||
      wanted.includes(` ${normalized} `)
    );
  });
  if (contains) return contains.city;

  // No se hacen coincidencias difusas con nombres muy cortos: "Cali" no debe
  // terminar convertida en otro municipio por una letra de diferencia.
  if (wanted.length <= 4) return null;

  const tolerance = wanted.length <= 8 ? 1 : 2;
  let best: { city: string; distance: number } | null = null;

  for (const item of cities) {
    if (!item.normalized) continue;
    const distance = levenshtein(item.normalized, wanted);
    if (!best || distance < best.distance) {
      best = { city: item.city, distance };
    }
  }

  return best && best.distance <= tolerance ? best.city : null;
}

function validateName(value: string): string | null {
  const name = collapseSpaces(value);

  if (!name) return "Escribe tu nombre y apellido.";
  if (name.length > NAME_MAX) {
    return `El nombre no puede pasar de ${NAME_MAX} caracteres.`;
  }

  const parts = name.split(" ");
  if (parts.length < 2) {
    return "Escribe el nombre completo, con nombre y apellido.";
  }
  if (!NAME_RE.test(name)) {
    return "El nombre solo puede tener letras y espacios (sin números ni símbolos).";
  }

  const firstName = parts[0];
  const surname = parts.slice(1).join(" ");
  if (firstName.length > NAME_PART_MAX || surname.length > NAME_PART_MAX) {
    return "El nombre y el apellido deben tener máximo 50 caracteres cada uno.";
  }

  return null;
}

function validatePhone(value: string): string | null {
  const raw = value.trim();
  if (!raw) return "Escribe un número de teléfono.";
  if (raw.length > PHONE_MAX) {
    return `El teléfono no puede pasar de ${PHONE_MAX} caracteres.`;
  }
  if (!PHONE_ALLOWED_RE.test(raw)) {
    return "El teléfono solo puede tener números y separadores.";
  }

  const phone = normalizeCheckoutPhone(raw);
  if (!/^\d{10}$/.test(phone)) {
    return "Escribe un teléfono de 10 dígitos (ej. 3001234567).";
  }

  return null;
}

function validateEmail(value: string, isGuest: boolean): string | null {
  const email = value.trim();

  if (!email) {
    return isGuest
      ? "Sin cuenta necesitamos un correo para enviarte la factura."
      : null;
  }
  if (email.length > EMAIL_MAX) {
    return `El correo no puede pasar de ${EMAIL_MAX} caracteres.`;
  }
  if (!EMAIL_RE.test(email)) {
    return "Escribe un correo válido (ej. nombre@correo.com).";
  }

  return null;
}

function validateDocType(value: string): string | null {
  const type = canonicalDocType(value);
  if (!DOCUMENT_TYPE_OPTIONS.some((option) => option.value === type)) {
    return "Selecciona un tipo de documento válido.";
  }
  return null;
}

function validateDocNumber(value: string, docType: string): string | null {
  const type = canonicalDocType(docType);
  const number = normalizeDocNumber(value, type);

  if (!number) return "Escribe el número de documento.";

  if (type === "CC") {
    return /^\d{6,10}$/.test(number)
      ? null
      : "La cédula debe tener entre 6 y 10 dígitos.";
  }
  if (type === "CE") {
    return /^\d{6,12}$/.test(number)
      ? null
      : "La cédula de extranjería debe tener entre 6 y 12 dígitos.";
  }
  if (type === "NIT") {
    return /^\d{9,15}$/.test(number)
      ? null
      : "El NIT debe tener entre 9 y 15 dígitos.";
  }
  if (type === "PP") {
    return /^[A-Z0-9]{5,20}$/.test(number)
      ? null
      : "El pasaporte debe tener entre 5 y 20 letras o números.";
  }

  return "Selecciona un tipo de documento válido.";
}

function validateAddress(value: string): string | null {
  const address = collapseSpaces(value);

  if (!address) return "Escribe la dirección de entrega.";
  if (address.length < 5) {
    return "La dirección es muy corta. Incluye calle, número y complemento.";
  }
  if (address.length > ADDRESS_MAX) {
    return `La dirección no puede pasar de ${ADDRESS_MAX} caracteres.`;
  }

  return null;
}

function validateCity(state: string, city: string): string | null {
  const canonicalState = resolveDepartment(state);
  if (!canonicalState) return "Primero selecciona el departamento.";

  const value = collapseSpaces(city);
  if (!value) return "Selecciona la ciudad o municipio.";
  if (value.length > CITY_MAX) {
    return `La ciudad no puede pasar de ${CITY_MAX} caracteres.`;
  }
  if (!resolveMunicipality(canonicalState.value, value)) {
    return `Esa ciudad no aparece en ${canonicalState.label}. Selecciona una de la lista.`;
  }

  return null;
}

function validateZip(value: string): string | null {
  const zip = value.trim();
  if (!zip) return null;
  return /^\d{6}$/.test(zip)
    ? null
    : "El código postal de Colombia debe tener 6 dígitos.";
}

export function validateCheckoutField(
  field: CheckoutField,
  values: CheckoutFormValues,
  options: { isGuest: boolean },
): string | null {
  switch (field) {
    case "shippingName":
      return validateName(values.shippingName);
    case "shippingPhone":
      return validatePhone(values.shippingPhone);
    case "shippingEmail":
      return validateEmail(values.shippingEmail, options.isGuest);
    case "shippingDocType":
      return validateDocType(values.shippingDocType);
    case "shippingDocNumber":
      return validateDocNumber(
        values.shippingDocNumber,
        values.shippingDocType,
      );
    case "shippingAddress":
      return validateAddress(values.shippingAddress);
    case "shippingState":
      return resolveDepartment(values.shippingState)
        ? null
        : "Selecciona el departamento.";
    case "shippingCity":
      return validateCity(values.shippingState, values.shippingCity);
    case "shippingZip":
      return validateZip(values.shippingZip);
    case "notes":
      return values.notes.trim().length > NOTES_MAX
        ? `Las notas no pueden pasar de ${NOTES_MAX} caracteres.`
        : null;
    default:
      return null;
  }
}

export function validateCheckoutForm(
  values: CheckoutFormValues,
  options: { isGuest: boolean },
): CheckoutFormErrors {
  const errors: CheckoutFormErrors = {};

  for (const field of CHECKOUT_FIELD_ORDER) {
    const message = validateCheckoutField(field, values, options);
    if (message) errors[field] = message;
  }

  return errors;
}

export function firstCheckoutErrorField(
  errors: CheckoutFormErrors,
): CheckoutField | null {
  return CHECKOUT_FIELD_ORDER.find((field) => Boolean(errors[field])) ?? null;
}

/**
 * Limpia y normaliza lo que se manda al backend. La ciudad se cambia por el
 * nombre canonico del municipio para que Dropi no tenga que adivinar.
 */
export function canonicalizeCheckoutForm(
  values: CheckoutFormValues,
): CheckoutFormValues {
  const docType = canonicalDocType(values.shippingDocType);
  const state = resolveDepartment(values.shippingState);

  return {
    shippingName: collapseSpaces(values.shippingName),
    shippingPhone: normalizeCheckoutPhone(values.shippingPhone),
    shippingEmail: values.shippingEmail.trim(),
    shippingDocType: docType,
    shippingDocNumber: normalizeDocNumber(values.shippingDocNumber, docType),
    shippingAddress: collapseSpaces(values.shippingAddress),
    shippingCity:
      resolveMunicipality(state?.value ?? values.shippingState, values.shippingCity) ??
      collapseSpaces(values.shippingCity),
    shippingState: state?.value ?? values.shippingState.trim().toUpperCase(),
    shippingZip: sanitizeZipTyping(values.shippingZip),
    notes: values.notes.trim(),
  };
}

export interface CheckoutApiErrorDetail {
  field?: string;
  message: string;
}

/**
 * Convierte los errores de campo que devuelve el API en errores del formulario.
 * Los campos desconocidos se ignoran: el mensaje general del API ya se muestra
 * aparte.
 */
export function mapCheckoutApiErrors(input: unknown): CheckoutFormErrors {
  if (!Array.isArray(input)) return {};

  const errors: CheckoutFormErrors = {};

  for (const item of input) {
    if (!item || typeof item !== "object") continue;

    const detail = item as CheckoutApiErrorDetail;
    if (typeof detail.field !== "string" || typeof detail.message !== "string") {
      continue;
    }

    if (CHECKOUT_FIELD_ORDER.includes(detail.field as CheckoutField)) {
      errors[detail.field as CheckoutField] = detail.message;
    }
  }

  return errors;
}
