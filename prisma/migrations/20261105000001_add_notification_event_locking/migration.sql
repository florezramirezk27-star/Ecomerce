-- Columnas de bloqueo distribuido y reintentos para NotificationEvent.
-- lockedAt / lockedBy / lockedUntil: permiten que una instancia de Railway
-- reclame un evento de forma exclusiva (FOR UPDATE SKIP LOCKED) y que otra
-- instancia recupere eventos cuyo bloqueo haya expirado tras una caída.
-- nextAttemptAt: momento a partir del cual un evento puede ser reintentado
-- (backoff exponencial con jitter).
ALTER TABLE "NotificationEvent"
    ADD COLUMN "nextAttemptAt" TIMESTAMP(3),
    ADD COLUMN "lockedAt" TIMESTAMP(3),
    ADD COLUMN "lockedBy" TEXT,
    ADD COLUMN "lockedUntil" TIMESTAMP(3);

-- Índice para consultar eventos pendientes por estado y fecha de próximo intento.
CREATE INDEX "NotificationEvent_status_nextAttemptAt_idx"
    ON "NotificationEvent"("status", "nextAttemptAt");
