-- Separate serial reservations per client device
ALTER TABLE "SerialReservation"
ADD COLUMN "clientId" TEXT;

CREATE INDEX "SerialReservation_type_clientId_expiresAt_idx"
ON "SerialReservation"("type", "clientId", "expiresAt");
