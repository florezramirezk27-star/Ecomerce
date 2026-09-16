-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "numericId" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "OrderTracking" ADD COLUMN     "guidePdfUrl" TEXT,
ADD COLUMN     "trackingUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_numericId_key" ON "Order"("numericId");