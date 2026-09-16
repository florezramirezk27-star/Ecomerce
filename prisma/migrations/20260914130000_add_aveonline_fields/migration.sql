-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "aveonlineProviderId" INTEGER,
ADD COLUMN     "aveonlineProductRef" TEXT;

-- AlterTable
ALTER TABLE "OrderTracking" ADD COLUMN     "aveonlineOrderId" TEXT,
ADD COLUMN     "aveonlineGuideId" TEXT;