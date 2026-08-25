import { z } from 'zod';

export const updateUserSchema = z.object({
  role: z
    .enum(['ADMIN', 'CUSTOMER'], {
      message: 'Rol inv\u00e1lido. Debe ser ADMIN o CUSTOMER',
    })
    .optional(),
});
