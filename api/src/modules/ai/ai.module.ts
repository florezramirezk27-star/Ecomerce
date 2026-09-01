import { Module, Global } from '@nestjs/common';
import { AIService } from './ai.service';
import { StockPriceTool } from './tools/stock-price.tool';
import { TrackingTool } from './tools/tracking.tool';
import { RAGService } from './rag/rag.service';
import { EmbeddingsService } from './rag/embeddings.service';
import { PromptInjectionGuard } from './guardrails/prompt-injection.guard';
import { DropiModule } from '../dropi/dropi.module';
import { CartModule } from '../cart/cart.module';

@Global()
@Module({
  imports: [DropiModule, CartModule],
  providers: [
    AIService,
    StockPriceTool,
    TrackingTool,
    RAGService,
    EmbeddingsService,
    PromptInjectionGuard,
  ],
  exports: [AIService, EmbeddingsService],
})
export class AIModule {}

export { AIService } from './ai.service';
export { EmbeddingsService } from './rag/embeddings.service';
