import { z } from 'zod';

export const addToCartSchema = z.object({
  productId: z.string().min(1, 'El ID del producto es requerido'),
  quantity: z.number().int().min(1, 'La cantidad debe ser al menos 1'),
});
