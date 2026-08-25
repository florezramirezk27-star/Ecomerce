import { z } from 'zod';

const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token requerido'),
  password: z
    .string()
    .min(8, 'La contrase\u00f1a debe tener al menos 8 caracteres')
    .regex(
      passwordRegex,
      'La contrase\u00f1a debe incluir al menos una may\u00fascula, una min\u00fascula y un n\u00famero',
    ),
});
