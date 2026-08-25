import { z } from 'zod';

export const forgotPasswordSchema = z.object({
  email: z.string().email('Correo electr\u00f3nico inv\u00e1lido'),
});
