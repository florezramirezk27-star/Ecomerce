-- Checkout como invitado: un pedido ya no exige cuenta asociada.
-- Solo se relaja la restriccion; las filas existentes conservan su userId.
-- Es compatible con el codigo anterior (sigue enviando userId siempre).
ALTER TABLE "Order" ALTER COLUMN "userId" DROP NOT NULL;
