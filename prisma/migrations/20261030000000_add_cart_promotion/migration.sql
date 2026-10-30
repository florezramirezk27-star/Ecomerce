-- La promocion de la landing solo debe cobrarse a quien la eligio alli.
-- Antes el precio de oferta se aplicaba por cantidad sola, asi que cualquiera
-- que comprara 2 o 3 unidades desde la ficha del producto pagaba el precio de
-- la promocion aunque nunca la hubiera visto. Con esta marca, la oferta aplica
-- unicamente a las lineas que llegan marcadas desde el selector de promociones.
ALTER TABLE "CartItem" ADD COLUMN "promotion" BOOLEAN NOT NULL DEFAULT false;

-- En el pedido queda registrado si esa linea se cobro con la promocion, para
-- poder auditar el precio guardado en "OrderItem"."price".
ALTER TABLE "OrderItem" ADD COLUMN "promotion" BOOLEAN NOT NULL DEFAULT false;
