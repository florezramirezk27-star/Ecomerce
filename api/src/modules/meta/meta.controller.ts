import { Body, Controller, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { MetaService, MetaUserContext } from './meta.service';

const trackSchema = z.object({
  event: z.enum([
    'PageView',
    'Search',
    'ViewContent',
    'AddToCart',
    'InitiateCheckout',
    'Purchase',
  ] as const),
  eventId: z.string().min(1),
  value: z.number().min(0).optional(),
  currency: z.string().max(8).optional(),
  contentIds: z.array(z.string().min(1)).optional(),
  contentName: z.string().max(500).optional(),
  contentType: z.string().max(50).optional(),
  numItems: z.number().int().min(0).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(30).optional(),
});

@Controller('meta')
export class MetaController {
  constructor(private readonly metaService: MetaService) {}

  @Post('track')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async track(
    @Body(new ZodValidationPipe(trackSchema)) dto: z.infer<typeof trackSchema>,
    @Req() req: Request,
  ): Promise<{ delivered: boolean; reason?: string }> {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = Array.isArray(forwarded)
      ? forwarded[0]
      : forwarded?.split(',')[0].trim() || req.ip;

    const context: MetaUserContext = {
      ip,
      userAgent: req.headers['user-agent'],
      fbp: typeof req.cookies?._fbp === 'string' ? req.cookies._fbp : undefined,
      fbc:
        typeof req.cookies?._fbc === 'string' ? req.cookies._fbc : undefined,
    };

    return this.metaService.track({ ...dto }, context);
  }
}