-- CreateEnum
CREATE TYPE "ConversationState" AS ENUM ('EXPLORING', 'COMPARING', 'INTENT_TO_BUY', 'CHECKOUT_READY', 'ABANDONED', 'RESOLVED');

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "toolCalls" JSONB,
ADD COLUMN     "toolResults" JSONB;

-- AlterTable
ALTER TABLE "ChatSession" ADD COLUMN     "appliedDiscountId" TEXT,
ADD COLUMN     "state" "ConversationState" NOT NULL DEFAULT 'EXPLORING';
