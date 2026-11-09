-- Seguimiento de entrega por dispositivo para cada evento OUTBOX.
--
-- Permite saber qué dispositivos ya recibieron una notificación y cuáles
-- siguen pendientes de reintento. El historial sobrevive a la eliminación del
-- token: `deviceId` pasa a NULL (ON DELETE SET NULL) y `recipientKey` conserva
-- el hash SHA-256 del token original.
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "notificationEventId" TEXT NOT NULL,
    "deviceId" TEXT,
    "recipientKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "lastError" TEXT,
    "firebaseErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- Un evento solo puede tener una entrega por destinatario. Es la garantía
-- estructural contra duplicados incluso si dos workers intentan crear las
-- filas a la vez.
CREATE UNIQUE INDEX "NotificationDelivery_notificationEventId_recipientKey_key"
    ON "NotificationDelivery"("notificationEventId", "recipientKey");

-- Consulta del worker: entregas de un evento por estado.
CREATE INDEX "NotificationDelivery_notificationEventId_status_idx"
    ON "NotificationDelivery"("notificationEventId", "status");

-- Reintentos programados y barrido de entregas vencidas.
CREATE INDEX "NotificationDelivery_status_nextAttemptAt_idx"
    ON "NotificationDelivery"("status", "nextAttemptAt");

-- Búsqueda de entregas de un dispositivo (historial / diagnóstico).
CREATE INDEX "NotificationDelivery_deviceId_idx"
    ON "NotificationDelivery"("deviceId");

ALTER TABLE "NotificationDelivery"
    ADD CONSTRAINT "NotificationDelivery_notificationEventId_fkey"
    FOREIGN KEY ("notificationEventId") REFERENCES "NotificationEvent"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationDelivery"
    ADD CONSTRAINT "NotificationDelivery_deviceId_fkey"
    FOREIGN KEY ("deviceId") REFERENCES "PushDevice"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
