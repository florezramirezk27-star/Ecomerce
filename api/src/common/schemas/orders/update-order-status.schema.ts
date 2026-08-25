import { z } from 'zod';

export const updateOrderStatusSchema = z.object({
  status: z.enum(['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED'], {
    message:
      'Estado inv\u00e1lido. Debe ser: PENDING, PAID, SHIPPED, DELIVERED o CANCELLED',
  }),
});
