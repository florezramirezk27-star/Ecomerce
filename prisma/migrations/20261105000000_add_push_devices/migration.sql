-- Tabla de dispositivos registrados para notificaciones push (FCM).
-- Un administrador asocia su token FCM con su cuenta para recibir alertas
-- de pedidos, cambios de estado y cancelaciones.
CREATE TABLE "PushDevice" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL UNIQUE,
    "platform" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

-- Indices para consultas frecuentes.
CREATE INDEX "PushDevice_userId_idx" ON "PushDevice"("userId");
CREATE INDEX "PushDevice_token_idx" ON "PushDevice"("token");

-- Tabla de eventos de notificacion (patron Outbox) para envio fiable via FCM.
-- Se persiste dentro de la misma transaccion que modifica el pedido, de modo
-- que una caida temporal de Firebase nunca pierde una notificacion.
CREATE TABLE "NotificationEvent" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    "eventId" TEXT NOT NULL UNIQUE,
    "type" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "numericId" INTEGER NOT NULL,
    "payload" JSON NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lastError" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE
);

-- Indices para el worker de reintentos y deduplicacion.
CREATE INDEX "NotificationEvent_status_createdAt_idx" ON "NotificationEvent"("status", "createdAt");
CREATE INDEX "NotificationEvent_eventId_idx" ON "NotificationEvent"("eventId");
