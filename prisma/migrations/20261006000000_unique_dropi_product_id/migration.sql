-- Un producto de Dropi solo se puede importar una vez.
--
-- Antes `dropiProductId` tenia un indice simple, asi que importar dos veces el
-- mismo producto creaba dos filas: la segunda entraba con el slug
-- "<slug>-<id>" para no chocar con el @unique de slug, y en la tienda quedaban
-- dos fichas identicas. Ahora es la base de datos la que lo impone: cada id de
-- Dropi puede estar en un solo producto.
--
-- Los productos creados a mano no traen id de Dropi y quedan en NULL, y
-- Postgres permite NULL repetidos en un indice unico, asi que no se afecta a
-- nadie mas.
--
-- Precondicion verificada sobre esta base antes de crear el indice: 10
-- productos, ningun dropiProductId repetido. Si la migracion fallara aqui,
-- primero hay que eliminar los duplicados a mano.
--
-- El indice simple se elimina: el unico cubre las mismas busquedas
-- (`dropiProductId` y `dropiProductId IS NOT NULL`) y ademas no admite
-- repetidos, asi que mantener los dos solo costaria escrituras.
--
-- IF NOT EXISTS / DROP IF EXISTS para que la migracion sea re-ejecutable.

-- DropIndex
DROP INDEX IF EXISTS "Product_dropiProductId_idx";

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Product_dropiProductId_key" ON "Product"("dropiProductId");
