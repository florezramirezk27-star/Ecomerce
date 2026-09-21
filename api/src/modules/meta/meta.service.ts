import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { createHash } from 'crypto';

export const META_CAPI_EVENTS = [
  'PageView',
  'Search',
  'ViewContent',
  'AddToCart',
  'InitiateCheckout',
  'Purchase',
] as const;

export type MetaCapiEventName = (typeof META_CAPI_EVENTS)[number];

export interface MetaTrackPayload {
  event: MetaCapiEventName;
  eventId: string;
  value?: number;
  currency?: string;
  contentIds?: string[];
  contentName?: string;
  contentType?: string;
  numItems?: number;
  email?: string;
  phone?: string;
}

export interface MetaUserContext {
  ip?: string;
  userAgent?: string;
  fbp?: string;
  fbc?: string;
}

function sha256(value: string): string {
  return createHash('sha256')
    .update(value.trim().toLowerCase())
    .digest('hex');
}

function normalizePhone(phone: string): string {
  let normalized = phone.replace(/[\s\-().]/g, '');
  if (normalized.startsWith('00')) {
    normalized = `+${normalized.slice(2)}`;
  }
  if (!normalized.startsWith('+') && /^\d{8,}/.test(normalized)) {
    normalized = `+${normalized}`;
  }
  return normalized;
}

@Injectable()
export class MetaService {
  private readonly logger = new Logger(MetaService.name);

  get isConfigured(): boolean {
    return Boolean(
      process.env.META_PIXEL_ID && process.env.META_CAPI_ACCESS_TOKEN,
    );
  }

  async track(
    payload: MetaTrackPayload,
    context: MetaUserContext,
  ): Promise<{ delivered: boolean; reason?: string }> {
    if (!this.isConfigured) {
      return { delivered: false, reason: 'not_configured' };
    }

    const userData: Record<string, unknown> = {
      client_ip_address: context.ip || undefined,
      client_user_agent: context.userAgent || undefined,
      fbp: context.fbp || undefined,
      fbc: context.fbc || undefined,
    };

    if (payload.email) {
      userData.em = sha256(payload.email);
    }
    if (payload.phone) {
      userData.ph = sha256(normalizePhone(payload.phone));
    }

    const customData: Record<string, unknown> = {
      value: payload.value,
      currency: payload.currency || 'COP',
      content_ids: payload.contentIds,
      content_name: payload.contentName,
      content_type: payload.contentType,
      num_items: payload.numItems,
    };

    for (const key of Object.keys(customData)) {
      if (customData[key] === undefined) delete customData[key];
    }
    for (const key of Object.keys(userData)) {
      if (userData[key] === undefined) delete userData[key];
    }

    const event: Record<string, unknown> = {
      event_name: payload.event,
      event_time: Math.floor(Date.now() / 1000),
      event_id: payload.eventId,
      action_source: 'website',
      user_data: userData,
      custom_data: customData,
    };

    const testEventCode = process.env.META_CAPI_TEST_EVENT_CODE;
    const params = new URLSearchParams({
      access_token: process.env.META_CAPI_ACCESS_TOKEN || '',
    });
    if (testEventCode) params.set('test_event_code', testEventCode);

    const url = `https://graph.facebook.com/v21.0/${process.env.META_PIXEL_ID}/events?${params.toString()}`;

    try {
      const response = await axios.post(url, { data: [event] });
      const eventsReceived = response.data?.events_received ?? 0;
      if (eventsReceived !== 1) {
        this.logger.warn(
          `Meta CAPI: ${payload.event} no reconocido por Meta: ${JSON.stringify(response.data)}`,
        );
      }
      return { delivered: true };
    } catch (error) {
      const detail =
        axios.isAxiosError(error) && error.response
          ? JSON.stringify(error.response.data)
          : (error as Error).message;
      this.logger.warn(`Meta CAPI: error enviando ${payload.event}: ${detail}`);
      return { delivered: false, reason: 'error' };
    }
  }
}