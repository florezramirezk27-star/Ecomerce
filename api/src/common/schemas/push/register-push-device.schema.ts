import { z } from 'zod';

export const registerPushDeviceSchema = z.object({
  token: z.string().min(1, 'Token FCM requerido'),
  platform: z.enum(['android', 'ios'], {
    message: 'Plataforma invalida. Debe ser android o ios',
  }),
});

export type RegisterPushDeviceDto = z.infer<typeof registerPushDeviceSchema>;
