import { z } from 'zod';

export const checkoutSchema = z.object({
  shippingName: z.string().min(1, 'El nombre es requerido'),
  shippingPhone: z.string().min(1, 'El tel\u00e9fono es requerido'),
  shippingAddress: z.string().min(1, 'La direcci\u00f3n es requerida'),
  shippingCity: z.string().min(1, 'La ciudad es requerida'),
  shippingState: z.string().min(1, 'El departamento es requerido'),
  shippingZip: z.string().optional(),
  shippingEmail: z.string().email().optional().or(z.literal('')),
  notes: z.string().optional(),
});
