import { z } from 'zod';

export const ToolResultSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
});
export type ToolResult = z.infer<typeof ToolResultSchema>;

export interface AgentTool<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  parameters: z.ZodType<TInput>;
  execute: (args: TInput, context: ToolContext) => Promise<TOutput>;
}

export type ToolInputType<T> = T extends z.ZodType<infer U> ? U : never;
export type ToolOutputType<T extends z.ZodType> = z.infer<T>;

export interface ToolContext {
  userId?: string;
  sessionId: string;
  isAdmin: boolean;
}

export const StockPriceInput = z.object({
  productId: z.string().optional(),
  slug: z.string().optional(),
  query: z.string().optional(),
});
export type StockPriceInput = z.infer<typeof StockPriceInput>;

export const StockPriceOutput = z.object({
  success: z.boolean(),
  products: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      price: z.number(),
      oldPrice: z.number().nullable(),
      stock: z.number(),
      image: z.string().nullable(),
      categoryName: z.string(),
    }),
  ),
});
export type StockPriceOutput = z.infer<typeof StockPriceOutput>;

export const TrackingInput = z.object({
  guideId: z.string().min(1),
  orderId: z.string().optional(),
});
export type TrackingInput = z.infer<typeof TrackingInput>;

export const TrackingOutput = z.object({
  success: z.boolean(),
  status: z.string().optional(),
  lastEvent: z.string().optional(),
  carrier: z.string().optional(),
  error: z.string().optional(),
});
export type TrackingOutput = z.infer<typeof TrackingOutput>;

export const DiscountInput = z.object({
  sessionId: z.string(),
  userId: z.string().optional(),
  cartTotal: z.number().optional(),
});
export type DiscountInput = z.infer<typeof DiscountInput>;

export const DiscountOutput = z.object({
  success: z.boolean(),
  code: z.string().optional(),
  discountValue: z.number().optional(),
  discountType: z.string().optional(),
  expiresAt: z.string().optional(),
  message: z.string().optional(),
  error: z.string().optional(),
});
export type DiscountOutput = z.infer<typeof DiscountOutput>;

export interface GenerativeUI {
  type:
    | 'product_card'
    | 'product_carousel'
    | 'coupon'
    | 'quick_replies'
    | 'tracking_update'
    | 'order_summary';
  data: Record<string, unknown>;
}

export interface AIStreamMessage {
  type: 'text' | 'ui' | 'tool_call' | 'error';
  content: string;
  ui?: GenerativeUI[];
  toolName?: string;
  toolArgs?: unknown;
}
