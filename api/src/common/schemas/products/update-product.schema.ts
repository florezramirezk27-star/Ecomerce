import { z } from 'zod';

export const updateProductSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  description: z.string().optional(),
  price: z.number().min(0).optional(),
  oldPrice: z.number().min(0).optional(),
  stock: z.number().int().min(0).optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
  image: z.string().optional(),
  gallery: z.array(z.string()).optional(),
  video: z.string().optional(),
  customCode: z.string().optional(),
  categoryId: z.string().optional(),
  active: z.boolean().optional(),
});
