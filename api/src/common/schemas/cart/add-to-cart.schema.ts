import { z } from 'zod';

export const addToCartSchema = z.object({
  productId: z.string().min(1, 'El ID del producto es requerido'),
  quantity: z.number().int().min(1, 'La cantidad debe ser al menos 1'),
  /**
   * Presentacion elegida (`variation_id` de Dropi). 0/ausente = producto simple
   * o sin presentacion seleccionada. El servidor valida contra las
   * presentaciones del producto: no se confia en lo que manda el cliente.
   */
  variationId: z
    .number()
    .int('La presentación debe ser un número entero')
    .min(0, 'Presentación inválida')
    .optional(),
});
