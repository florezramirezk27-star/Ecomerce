-- Landing larga del producto pegada por el admin (HTML/CSS/JS).
-- Se renderiza en un iframe con sandbox en la ficha. No se reutiliza
-- "customCode" porque ese guarda el SKU del producto.
ALTER TABLE "Product" ADD COLUMN "landingCode" TEXT;
