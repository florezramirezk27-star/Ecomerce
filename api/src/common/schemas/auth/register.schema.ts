import { z } from 'zod';

const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

export const registerSchema = z.object({
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
  email: z.string().email('Correo electr\u00f3nico inv\u00e1lido'),
  password: z
    .string()
    .min(8, 'La contrase\u00f1a debe tener al menos 8 caracteres')
    .regex(
      passwordRegex,
      'La contrase\u00f1a debe incluir al menos una may\u00fascula, una min\u00fascula y un n\u00famero',
    ),
});
