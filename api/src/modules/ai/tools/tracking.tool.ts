import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../../prisma/prisma.service';
import { DropiService } from '../../dropi/dropi.service';
import {
  AgentTool,
  ToolContext,
  TrackingInput,
  TrackingOutput,
} from '../interfaces/agent.types';

type TrackingIn = z.infer<typeof TrackingInput>;
type TrackingOut = z.infer<typeof TrackingOutput>;

@Injectable()
export class TrackingTool implements AgentTool<TrackingIn, TrackingOut> {
  name = 'rastrearPedidoDropi';
  description =
    'Rastrea el estado de envío de un pedido usando la guía de Dropi. Úsala cuando el usuario pregunte "dónde está mi pedido", "estado del envío", o proporcione un número de guía.';
  parameters = TrackingInput;

  private readonly logger = new Logger(TrackingTool.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dropiService: DropiService,
  ) {}

  async execute(args: TrackingIn, context: ToolContext): Promise<TrackingOut> {
    try {
      let guideId = args.guideId;
      const orderId = args.orderId;

      if (!guideId && orderId) {
        const tracking = await this.prisma.orderTracking.findUnique({
          where: { orderId },
        });
        if (tracking?.dropiGuideId) {
          guideId = tracking.dropiGuideId;
        } else {
          return {
            success: false,
            error: 'No se encontró guía de rastreo para esta orden',
          };
        }
      }

      if (!guideId) {
        return {
          success: false,
          error: 'Se requiere un número de guía o ID de orden',
        };
      }

      const now = new Date();
      const result = await this.dropiService.getDropiProducts({
        search_type: 'guide',
        keywords: guideId,
      });

      if (result?.isSuccess && result?.objects?.length > 0) {
        const trackingData = result.objects[0];
        const status = trackingData.status || 'UNKNOWN';

        if (orderId) {
          await this.prisma.orderTracking.upsert({
            where: { orderId },
            create: {
              orderId,
              dropiGuideId: guideId,
              status,
              lastEvent: trackingData.last_event || trackingData.status_detail,
              rawResponse: trackingData,
              checkedAt: now,
            },
            update: {
              status,
              lastEvent: trackingData.last_event || trackingData.status_detail,
              rawResponse: trackingData,
              checkedAt: now,
            },
          });
        }

        return {
          success: true,
          status: this.mapDropiStatus(status),
          lastEvent:
            trackingData.last_event ||
            trackingData.status_detail ||
            'Sin eventos registrados',
          carrier: 'Dropi',
        };
      }

      return {
        success: false,
        error: 'No se encontró información de rastreo para esta guía',
      };
    } catch (error: any) {
      this.logger.error(`Error tracking order: ${error.message}`);
      return {
        success: false,
        error: 'Error al consultar el estado del pedido. Intenta de nuevo.',
      };
    }
  }

  private mapDropiStatus(status: string): string {
    const map: Record<string, string> = {
      PENDING: 'Pendiente',
      CONFIRMED: 'Confirmado',
      IN_TRANSIT: 'En tránsito',
      DELIVERED: 'Entregado',
      CANCELLED: 'Cancelado',
      RETURNED: 'Devuelto',
    };
    return map[status] || status;
  }
}
