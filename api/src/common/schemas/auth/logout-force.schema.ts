import { z } from 'zod';

export const logoutForceSchema = z.object({
  token: z.string().min(1, 'Token requerido'),
});
