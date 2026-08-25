import { Module, Global } from '@nestjs/common';
import { AIService } from './ai.service';
import { StockPriceTool } from './tools/stock-price.tool';
import { TrackingTool } from './tools/tracking.tool';
import { DiscountTool } from './tools/discount.tool';
import { RAGService } from './rag/rag.service';
import { EmbeddingsService } from './rag/embeddings.service';
import { PromptInjectionGuard } from './guardrails/prompt-injection.guard';
import { DropiModule } from '../dropi/dropi.module';

@Global()
@Module({
  imports: [DropiModule],
  providers: [
    AIService,
    StockPriceTool,
    TrackingTool,
    DiscountTool,
    RAGService,
    EmbeddingsService,
    PromptInjectionGuard,
  ],
  exports: [AIService, EmbeddingsService],
})
export class AIModule {}

export { AIService } from './ai.service';
export { EmbeddingsService } from './rag/embeddings.service';
