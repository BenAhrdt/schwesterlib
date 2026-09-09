CREATE TABLE "PushConfiguration" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "publicKey" TEXT NOT NULL,
  "privateKeyEncrypted" TEXT NOT NULL,
  CONSTRAINT "PushConfiguration_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PushSubscription" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "reminders" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");
ALTER TABLE "Appointment" ADD COLUMN "pushReminderAt" TIMESTAMPTZ(3);
CREATE INDEX "Appointment_push_reminder_due" ON "Appointment"("startsAt") WHERE "pushReminderAt" IS NULL AND "status" IN ('PENDING', 'CONFIRMED');
