import { z } from 'zod';

export const sendMessageSchema = z.object({
  sessionId: z.string().max(100).optional(),
  message: z
    .string()
    .min(1, 'El mensaje no puede estar vacío')
    .max(2000, 'El mensaje no puede exceder 2000 caracteres'),
  guestId: z.string().max(100).optional(),
  guestSecret: z.string().min(20).max(200).optional(),
});

export type SendMessageDto = z.infer<typeof sendMessageSchema>;

export const getHistorySchema = z.object({
  sessionId: z.string().cuid(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().cuid().optional(),
});
