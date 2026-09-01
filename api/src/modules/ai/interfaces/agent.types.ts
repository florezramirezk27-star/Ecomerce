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
  guideId: z.string().optional(),
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

export interface GenerativeUI {
  type:
    | 'product_card'
    | 'product_carousel'
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
