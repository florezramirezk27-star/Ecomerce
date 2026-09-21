-- DropColumn
ALTER TABLE "Product" DROP COLUMN "aveonlineProviderId",
    DROP COLUMN "aveonlineProductRef";

-- DropColumn
ALTER TABLE "OrderTracking" DROP COLUMN "aveonlineOrderId",
    DROP COLUMN "aveonlineGuideId";