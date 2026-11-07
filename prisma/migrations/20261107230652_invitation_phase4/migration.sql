-- Invitation: store a hash of the invite token instead of the token, and
-- record who sent and who accepted. Renames keep any existing rows (there are none).

-- RenameColumn
ALTER TABLE "Invitation" RENAME COLUMN "token" TO "tokenHash";
ALTER TABLE "Invitation" RENAME COLUMN "usedAt" TO "acceptedAt";

-- RenameIndex
ALTER INDEX "Invitation_token_key" RENAME TO "Invitation_tokenHash_key";

-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN "invitedById" TEXT,
ADD COLUMN "acceptedById" TEXT;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
