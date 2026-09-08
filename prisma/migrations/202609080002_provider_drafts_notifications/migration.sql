ALTER TABLE "ProviderProfile" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "ProviderProfile" ADD COLUMN "invitationId" TEXT;
ALTER TABLE "ProviderProfile" ADD COLUMN "emailNotifications" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "ProviderProfile_invitationId_key" ON "ProviderProfile"("invitationId");
ALTER TABLE "ProviderProfile" ADD CONSTRAINT "ProviderProfile_invitationId_fkey"
  FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderProfile" ADD CONSTRAINT "provider_has_one_owner"
  CHECK (("userId" IS NOT NULL) <> ("invitationId" IS NOT NULL));
-- Preserve existing accounts and prepare profiles for previously sent invitations.
INSERT INTO "ProviderProfile" ("id", "invitationId")
SELECT 'draft_' || "id", "id" FROM "Invitation"
WHERE "role" = 'PROVIDER' AND "status" = 'OPEN';
