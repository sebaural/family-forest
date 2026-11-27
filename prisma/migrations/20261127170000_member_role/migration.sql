-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "role" "CollabRole" NOT NULL DEFAULT 'VIEWER';

-- Members linked to a collaborator take that account's role.
UPDATE "Member" m SET "role" = c."role"
FROM "TreeCollaborator" c
WHERE c."treeId" = m."treeId" AND c."userId" = m."userId";
