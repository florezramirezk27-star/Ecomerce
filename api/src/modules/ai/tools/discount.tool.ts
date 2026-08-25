import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  AgentTool,
  ToolContext,
  DiscountInput,
  DiscountOutput,
} from '../interfaces/agent.types';

type DiscountIn = z.infer<typeof DiscountInput>;
type DiscountOut = z.infer<typeof DiscountOutput>;

@Injectable()
export class DiscountTool implements AgentTool<DiscountIn, DiscountOut> {
  name = 'aplicarDescuentoScarcity';
  description =
    'Genera un cupón de descuento tipo oferta flash para usuarios con alta intención de compra que dudan por el precio. Solo debe usarse cuando el usuario haya mostrado intención de compra clara y esté evaluando el precio.';
  parameters = DiscountInput;

  private readonly logger = new Logger(DiscountTool.name);

  constructor(private readonly prisma: PrismaService) {}

  async execute(args: DiscountIn, _context: ToolContext): Promise<DiscountOut> {
    try {
      const existingDiscount = await this.prisma.discountCode.findFirst({
        where: {
          isFlashDeal: true,
          active: true,
          flashDealExpiresAt: { gte: new Date() },
        },
      });

      if (existingDiscount) {
        return {
          success: true,
          code: existingDiscount.code,
          discountValue: Number(existingDiscount.discountValue),
          discountType: existingDiscount.discountType,
          expiresAt: existingDiscount.flashDealExpiresAt?.toISOString(),
          message: `Tienes un descuento del ${existingDiscount.discountValue}% con el código: ${existingDiscount.code}. ¡Válido hasta ${existingDiscount.flashDealExpiresAt?.toLocaleTimeString('es-CO')}!`,
        };
      }

      const code = `FLASH${randomBytes(3).toString('hex').toUpperCase()}`;
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      const discount = await this.prisma.discountCode.create({
        data: {
          code,
          description: 'Oferta flash generada por IA',
          discountType: 'PERCENTAGE',
          discountValue: 10,
          minPurchase: 50000,
          maxUses: 50,
          isFlashDeal: true,
          flashDealExpiresAt: expiresAt,
          active: true,
        },
      });

      if (args.sessionId) {
        await this.prisma.chatSession.update({
          where: { id: args.sessionId },
          data: { appliedDiscountId: discount.id },
        });
      }

      return {
        success: true,
        code: discount.code,
        discountValue: Number(discount.discountValue),
        discountType: discount.discountType,
        expiresAt: expiresAt.toISOString(),
        message: `🎉 ¡Oferta flash exclusiva! Usa el código **${code}** y obtén un ${discount.discountValue}% de descuento. ¡Válido por 30 minutos!`,
      };
    } catch (error: any) {
      this.logger.error(`Error creating discount: ${error.message}`);
      return {
        success: false,
        error: 'Error al generar el descuento. Intenta de nuevo.',
      };
    }
  }
}
