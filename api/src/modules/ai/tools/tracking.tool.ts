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

      // El LLM elige que identificador pasar, asi que la pertenencia de la orden
      // se verifica siempre en base de datos. Sin esto, un invitado podria
      // pedir el tracking de cualquier pedido del sistema escribiendo su id, y
      // ademas modificarlo: ambas consultas iban sin acotar por propietario.
      if (orderId) {
        const owned = await this.prisma.order.findFirst({
          where: { id: orderId, userId: this.ownerFilter(context) },
          select: { id: true, tracking: { select: { dropiGuideId: true } } },
        });

        if (!owned) {
          this.logger.warn(
            `TrackingTool: acceso denegado a la orden ${orderId} (userId=${context.userId ?? 'invitado'})`,
          );
          return {
            success: false,
            error:
              'No encontramos un pedido asociado a tu cuenta con ese identificador.',
          };
        }

        // Una guia entregada por el usuario solo se consulta si pertenece a una
        // orden suya; si no hay orden, se resuelve la guia contra el catalogo
        // pero sin escribir nada en la base de datos.
        if (!guideId) {
          guideId = owned.tracking?.dropiGuideId ?? undefined;
        }
      }

      if (!guideId && !orderId) {
        return {
          success: false,
          error: 'Se requiere un número de guía o ID de orden',
        };
      }

      if (!guideId) {
        return {
          success: false,
          error: 'No se encontró guía de rastreo para esta orden',
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

        // Solo se escribe si la orden quedo verificada como propia. `orderId`
        // se anula cuando no vino del usuario, para que una guia suelta no
        // cree ni modifique el tracking de nadie.
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

  /**
   * Filtro de propietario. Un admin puede ver cualquier orden; el resto solo
   * las suyas. Los invitados no tienen `userId`, y como `Order.userId` es
   * obligatorio no pueden ser propietario de ninguna orden.
   */
  private ownerFilter(context: ToolContext): string | undefined {
    return context.isAdmin ? undefined : (context.userId ?? '__sin_usuario__');
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
