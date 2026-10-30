import { z } from 'zod';

/**
 * Limites de longitud por campo.
 *
 * El cuerpo de la peticion esta limitado a 1 MB por `express.json()`, asi que
 * sin estos topes un solo checkout podia meter casi un megabyte de texto libre
 * en `Order.shippingAddress` o `Order.notes`. Eso infla la tabla, ensucia los
 * indices y hace que cada consulta que carga pedidos arrastre el peso.
 *
 * Los limites son holgados para el caso real (una direccion larga en Colombia
 * no pasa de 200 caracteres) y justos para cortar el abuso.
 */
const MAX_NAME = 100;
const NAME_PART_MAX = 50;
const MAX_PHONE = 30;
const MAX_ADDRESS = 300;
const MAX_CITY = 120;
const MAX_ZIP = 20;
const MAX_EMAIL = 254; // RFC 5321, limite Practico de la especificacion.
const MAX_DOC = 40;
const MAX_NOTES = 1000;

/**
 * Dropi valida nombre y apellido con este mismo conjunto de letras: separa
 * `name` y `surname` y no acepta numeros, apostrofos, guiones ni otros simbolos
 * en esos campos.
 */
const NAME_RE = /^[A-Za-záéíóúÁÉÍÓÚñÑüÜ]+(?:\s[A-Za-záéíóúÁÉÍÓÚñÑüÜ]+)*$/;
const PHONE_ALLOWED_RE = /^[\d\s+()-]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]{2,})+$/;

const DOC_TYPES = new Set(['CC', 'CE', 'NIT', 'PP']);

const DOC_PATTERNS: Record<string, { regex: RegExp; message: string }> = {
  CC: {
    regex: /^\d{6,10}$/,
    message: 'La cédula debe tener entre 6 y 10 dígitos',
  },
  CE: {
    regex: /^\d{6,12}$/,
    message: 'La cédula de extranjería debe tener entre 6 y 12 dígitos',
  },
  NIT: {
    regex: /^\d{9,15}$/,
    message: 'El NIT debe tener entre 9 y 15 dígitos',
  },
  PP: {
    regex: /^[A-Z0-9]{5,20}$/,
    message: 'El pasaporte debe tener entre 5 y 20 letras o números',
  },
};

function collapseSpaces(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeWord(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function normalizeDocType(value: string): string {
  const normalized = normalizeWord(value);

  if (['PASSPORT', 'PASAPORTE', 'PASS', 'PP'].includes(normalized)) {
    return 'PP';
  }
  if (['CEDULA', 'CEDULA DE CIUDADANIA', 'CC'].includes(normalized)) {
    return 'CC';
  }
  if (['CEDULA DE EXTRANJERIA', 'CE'].includes(normalized)) return 'CE';
  if (normalized === 'NIT') return 'NIT';

  return normalized;
}

/**
 * Deja un telefono colombiano en 10 digitos. Acepta las formas que escribe la
 * gente: "300 123 4567", "+57 300 123 4567", "0057..." o "0 300...".
 */
function normalizePhone(value: string): string {
  let digits = value.replace(/\D/g, '');

  if (digits.startsWith('0057')) digits = digits.slice(4);
  else if (digits.startsWith('57') && digits.length >= 12) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  return digits;
}

function normalizeDocNumber(value: string, docType: string): string {
  const type = normalizeDocType(docType);

  if (type === 'PP') {
    return value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  }

  return value.replace(/\D/g, '');
}

const nameSchema = z
  .string()
  .superRefine((raw, ctx) => {
    const value = collapseSpaces(raw);

    if (!value) {
      ctx.addIssue({ code: 'custom', message: 'El nombre es requerido' });
      return;
    }
    if (value.length > MAX_NAME) {
      ctx.addIssue({
        code: 'custom',
        message: `El nombre no puede pasar de ${MAX_NAME} caracteres`,
      });
      return;
    }

    const parts = value.split(' ');
    if (parts.length < 2) {
      ctx.addIssue({
        code: 'custom',
        message: 'Escribe el nombre completo, con nombre y apellido',
      });
      return;
    }
    if (!NAME_RE.test(value)) {
      ctx.addIssue({
        code: 'custom',
        message:
          'El nombre solo puede tener letras y espacios (sin números ni símbolos)',
      });
      return;
    }

    const firstName = parts[0];
    const surname = parts.slice(1).join(' ');
    if (firstName.length > NAME_PART_MAX || surname.length > NAME_PART_MAX) {
      ctx.addIssue({
        code: 'custom',
        message: `El nombre y el apellido deben tener máximo ${NAME_PART_MAX} caracteres cada uno`,
      });
    }
  })
  .transform(collapseSpaces);

const phoneSchema = z
  .string()
  .superRefine((raw, ctx) => {
    const value = raw.trim();

    if (!value) {
      ctx.addIssue({ code: 'custom', message: 'El teléfono es requerido' });
      return;
    }
    if (value.length > MAX_PHONE) {
      ctx.addIssue({
        code: 'custom',
        message: `El teléfono no puede pasar de ${MAX_PHONE} caracteres`,
      });
      return;
    }
    if (!PHONE_ALLOWED_RE.test(value)) {
      ctx.addIssue({
        code: 'custom',
        message: 'El teléfono solo puede tener números y separadores',
      });
      return;
    }
    if (!/^\d{10}$/.test(normalizePhone(value))) {
      ctx.addIssue({
        code: 'custom',
        message: 'El teléfono debe tener 10 dígitos',
      });
    }
  })
  .transform(normalizePhone);

const addressSchema = z
  .string()
  .superRefine((raw, ctx) => {
    const value = collapseSpaces(raw);

    if (!value) {
      ctx.addIssue({ code: 'custom', message: 'La dirección es requerida' });
      return;
    }
    if (value.length < 5) {
      ctx.addIssue({
        code: 'custom',
        message:
          'La dirección es muy corta: incluye calle, número y complemento',
      });
      return;
    }
    if (value.length > MAX_ADDRESS) {
      ctx.addIssue({
        code: 'custom',
        message: `La dirección no puede pasar de ${MAX_ADDRESS} caracteres`,
      });
    }
  })
  .transform(collapseSpaces);

function requiredTextSchema(fieldName: string, max: number) {
  return z
    .string()
    .superRefine((raw, ctx) => {
      const value = collapseSpaces(raw);

      if (!value) {
        ctx.addIssue({
          code: 'custom',
          message: `Completa el campo ${fieldName}`,
        });
        return;
      }
      if (value.length > max) {
        ctx.addIssue({
          code: 'custom',
          message: `El campo ${fieldName} no puede pasar de ${max} caracteres`,
        });
      }
    })
    .transform(collapseSpaces);
}

const zipSchema = z
  .string()
  .trim()
  .max(MAX_ZIP, `El código postal no puede pasar de ${MAX_ZIP} caracteres`)
  .superRefine((value, ctx) => {
    if (value && !/^\d{6}$/.test(value)) {
      ctx.addIssue({
        code: 'custom',
        message: 'El código postal de Colombia debe tener 6 dígitos',
      });
    }
  })
  .optional();

const emailSchema = z
  .string()
  .trim()
  .max(MAX_EMAIL, `El correo no puede pasar de ${MAX_EMAIL} caracteres`)
  .optional()
  .refine((value) => !value || EMAIL_RE.test(value), {
    message: 'El correo no es válido',
  });

const docTypeSchema = z
  .string()
  .trim()
  .max(MAX_DOC, 'El tipo de documento es demasiado largo')
  .optional()
  .transform((value) => (value ? normalizeDocType(value) : value))
  .refine((value) => !value || DOC_TYPES.has(value), {
    message: 'El tipo de documento no es válido',
  });

/**
 * Items que manda el cliente en un checkout de invitado.
 *
 * El invitado no tiene carrito en el servidor (el suyo vive en
 * `localStorage`), asi que la linea de pedido viaja en el cuerpo. El precio
 * NUNCA viene de aqui: el servidor lo lee del producto en base de datos, igual
 * que en el camino con sesion. `variationName` tampoco se acepta: el nombre de
 * la presentacion se resuelve contra `product.variations` para no guardar
 * texto inventado ni mandar una variante inexistente a Dropi.
 */
const guestItemSchema = z.object({
  productId: z.string().min(1, 'El ID del producto es requerido'),
  quantity: z
    .number()
    .int()
    .min(1, 'La cantidad debe ser al menos 1')
    .max(999, 'La cantidad no puede pasar de 999'),
  variationId: z
    .number()
    .int('La presentación debe ser un número entero')
    .min(0, 'Presentación inválida')
    .optional(),
  /**
   * La linea salio del selector de promociones de la landing: solo entonces
   * el servidor le cobra el precio de oferta por cantidad. Ausente/false =
   * compra normal desde la ficha, a precio por unidad.
   */
  promotion: z.boolean().optional(),
});

const checkoutObjectSchema = z.object({
  idempotencyKey: z
    .string()
    .uuid('La clave de idempotencia no es valida')
    .max(64, 'La clave de idempotencia es demasiado larga')
    .optional(),
  shippingName: nameSchema,
  shippingPhone: phoneSchema,
  shippingAddress: addressSchema,
  shippingCity: requiredTextSchema('ciudad', MAX_CITY),
  shippingState: requiredTextSchema('departamento', MAX_CITY),
  shippingZip: zipSchema,
  shippingEmail: emailSchema,
  shippingDocType: docTypeSchema,
  shippingDocNumber: z
    .string()
    .trim()
    .max(MAX_DOC, 'El número de documento es demasiado largo')
    .optional(),
  notes: z
    .string()
    .trim()
    .max(MAX_NOTES, `Las notas no pueden pasar de ${MAX_NOTES} caracteres`)
    .optional(),
  /**
   * Solo lo manda el invitado. Sin min(1): si llega vacio el servicio responde
   * "Tu carrito esta vacio", el mismo mensaje que ve un usuario registrado sin
   * carrito (el validador de Zod no reemplaza esa regla de negocio).
   */
  items: z
    .array(guestItemSchema)
    .max(100, 'El carrito es demasiado grande')
    .optional(),
});

/**
 * Normaliza el documento y luego lo valida contra el tipo elegido. El tipo se
 * manda a Dropi como `PP` para pasaporte (su catalogo no usa `PASSPORT`), y el
 * numero se limpia de puntos/guiones para que el proveedor reciba solo el dato.
 */
export const checkoutSchema = checkoutObjectSchema
  .transform((data) => ({
    ...data,
    shippingDocType: data.shippingDocType
      ? normalizeDocType(data.shippingDocType)
      : data.shippingDocType,
    shippingDocNumber: data.shippingDocNumber
      ? normalizeDocNumber(data.shippingDocNumber, data.shippingDocType ?? '')
      : data.shippingDocNumber,
  }))
  .superRefine((data, ctx) => {
    const number = data.shippingDocNumber;
    if (!number) return;

    const type = data.shippingDocType ?? '';
    if (!type) {
      ctx.addIssue({
        code: 'custom',
        path: ['shippingDocType'],
        message: 'Selecciona el tipo de documento',
      });
      return;
    }

    const pattern = DOC_PATTERNS[type];
    if (!pattern) {
      ctx.addIssue({
        code: 'custom',
        path: ['shippingDocType'],
        message: 'El tipo de documento no es válido',
      });
      return;
    }

    if (!pattern.regex.test(number)) {
      ctx.addIssue({
        code: 'custom',
        path: ['shippingDocNumber'],
        message: pattern.message,
      });
    }
  });
