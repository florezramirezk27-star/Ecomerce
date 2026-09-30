import { Module, Global } from '@nestjs/common';
import { AIService } from './ai.service';
import { StockPriceTool } from './tools/stock-price.tool';
import { TrackingTool } from './tools/tracking.tool';
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
    PromptInjectionGuard,
  ],
  exports: [AIService],
})
export class AIModule {}

export { AIService } from './ai.service';
