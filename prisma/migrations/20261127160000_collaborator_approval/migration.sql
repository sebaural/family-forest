-- AlterTable
ALTER TABLE "TreeCollaborator" ADD COLUMN     "approvedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "TreeCollaborator_treeId_approvedAt_idx" ON "TreeCollaborator"("treeId", "approvedAt");

-- Everyone with access today keeps it.
UPDATE "TreeCollaborator" SET "approvedAt" = "createdAt";
