import { z } from 'zod';

export const createProductSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  slug: z.string().min(1, 'El slug es requerido'),
  description: z.string().optional(),
  price: z.number().min(0, 'El precio debe ser mayor o igual a 0'),
  oldPrice: z.number().min(0).optional(),
  stock: z.number().int().min(0, 'El stock debe ser mayor o igual a 0'),
  image: z.string().optional(),
  gallery: z.array(z.string()).optional(),
  video: z.string().optional(),
  customCode: z.string().optional(),
  categoryId: z.string().min(1, 'La categor\u00eda es requerida'),
});
