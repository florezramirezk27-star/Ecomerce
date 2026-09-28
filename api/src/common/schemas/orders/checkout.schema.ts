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
const MAX_NAME = 120;
const MAX_PHONE = 30;
const MAX_ADDRESS = 300;
const MAX_CITY = 120;
const MAX_ZIP = 20;
const MAX_EMAIL = 254; // RFC 5321, limite Practico de la especificacion.
const MAX_DOC = 40;
const MAX_NOTES = 1000;

export const checkoutSchema = z.object({
  idempotencyKey: z
    .string()
    .uuid('La clave de idempotencia no es valida')
    .max(64, 'La clave de idempotencia es demasiado larga')
    .optional(),
  shippingName: z
    .string()
    .min(1, 'El nombre es requerido')
    .max(MAX_NAME, `El nombre no puede pasar de ${MAX_NAME} caracteres`),
  shippingPhone: z
    .string()
    .min(1, 'El teléfono es requerido')
    .max(MAX_PHONE, `El teléfono no puede pasar de ${MAX_PHONE} caracteres`),
  shippingAddress: z
    .string()
    .min(1, 'La dirección es requerida')
    .max(
      MAX_ADDRESS,
      `La dirección no puede pasar de ${MAX_ADDRESS} caracteres`,
    ),
  shippingCity: z
    .string()
    .min(1, 'La ciudad es requerida')
    .max(MAX_CITY, `La ciudad no puede pasar de ${MAX_CITY} caracteres`),
  shippingState: z
    .string()
    .min(1, 'El departamento es requerido')
    .max(MAX_CITY, `El departamento no puede pasar de ${MAX_CITY} caracteres`),
  shippingZip: z
    .string()
    .max(MAX_ZIP, `El código postal no puede pasar de ${MAX_ZIP} caracteres`)
    .optional(),
  shippingEmail: z
    .string()
    .email('El correo no es valido')
    .max(MAX_EMAIL)
    .optional()
    .or(z.literal('')),
  shippingDocType: z.string().max(MAX_DOC).optional(),
  shippingDocNumber: z.string().max(MAX_DOC).optional(),
  notes: z
    .string()
    .max(MAX_NOTES, `Las notas no pueden pasar de ${MAX_NOTES} caracteres`)
    .optional(),
});
