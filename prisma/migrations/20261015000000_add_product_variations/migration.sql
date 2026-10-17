-- Presentaciones (variaciones) de Dropi: la tienda ahora deja elegir la variante
-- en la ficha del producto y envia su `variation_id` al proveedor.

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "variations" JSONB;

-- AlterTable: `variationId` es NOT NULL DEFAULT 0 (0 = producto simple) para que
-- pueda entrar en un indice unico sin lidiar con NULLs.
ALTER TABLE "CartItem" ADD COLUMN "variationId" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "variationName" TEXT;

-- DropIndex
DROP INDEX "CartItem_cartId_productId_key";

-- CreateIndex: con la presentacion en la llave, el mismo producto puede estar dos
-- veces en el carrito (una por presentacion).
CREATE UNIQUE INDEX "CartItem_cartId_productId_variationId_key" ON "CartItem"("cartId", "productId", "variationId");

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN "variationId" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "variationName" TEXT;
