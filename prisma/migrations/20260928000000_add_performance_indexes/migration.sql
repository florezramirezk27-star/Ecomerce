-- Indices de rendimiento para carga alta.
--
-- Objetivo: eliminar los seq scan de catalogo y de "mis pedidos" cuando hay
-- ~1000 usuarios concurrentes.
--
-- Product no tenia ningun indice (solo el @unique de slug). findAll filtra por
-- `active`, opcionalmente por `categoryId`, y ordena por `price`, por lo que
-- cada visita al catalogo recorria la tabla completa.
--
-- Order solo tenia `[status]` y `[createdAt]`. No habia indice por `userId`, asi
-- que "mis pedidos" hacia seq scan sobre toda la tabla de ordenes.
--
-- `Order_status_idx` se reemplaza por el indice compuesto `(status, createdAt)`:
-- el compuesto sirve cualquier consulta por prefijo de `status`, asi que el
-- indice simple queda redundante y solo anadiria costo de escritura.
--
-- Se usa `IF NOT EXISTS` para que la migracion sea re-ejecutable sin efectos.
--
-- Nota: `CREATE INDEX` sin CONCURRENTLY bloquea escrituras sobre la tabla
-- mientras se construye. Aceptable para el tamano actual de catalogo/ordenes.
-- Si alguna vez estas tablas crecen mucho, migrar a CONCURRENTLY fuera de la
-- transaccion de Prisma.

-- DropIndex
DROP INDEX IF EXISTS "Order_status_idx";

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Product_active_idx" ON "Product"("active");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Product_categoryId_active_idx" ON "Product"("categoryId", "active");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Product_price_idx" ON "Product"("price");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Product_active_createdAt_idx" ON "Product"("active", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Product_dropiProductId_idx" ON "Product"("dropiProductId");

-- Indice trigram para la busqueda de catalogo.
--
-- La busqueda usa `ILIKE '%texto%'`, que un B-tree no puede acelerar. Sin esto
-- cada busqueda escanea todos los productos.
--
-- Va envuelto en un DO block porque `CREATE EXTENSION` puede fallar si el rol de
-- la base de datos no tiene permiso. Fallar toda la migracion por un indice
-- opcional seria peor que registrarlo y seguir.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE INDEX IF NOT EXISTS "Product_name_trgm_idx"
    ON "Product" USING gin (name gin_trgm_ops);
  CREATE INDEX IF NOT EXISTS "Product_description_trgm_idx"
    ON "Product" USING gin (description gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Indice trigram de Product omitido: %', SQLERRM;
END $$;
