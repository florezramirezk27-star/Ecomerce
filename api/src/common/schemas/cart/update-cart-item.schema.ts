import { z } from 'zod';

export const updateCartItemSchema = z.object({
  quantity: z.number().int().min(1, 'La cantidad debe ser al menos 1'),
});
