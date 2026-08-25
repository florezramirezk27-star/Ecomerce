import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Correo electr\u00f3nico inv\u00e1lido'),
  password: z
    .string()
    .min(8, 'La contrase\u00f1a debe tener al menos 8 caracteres'),
});
