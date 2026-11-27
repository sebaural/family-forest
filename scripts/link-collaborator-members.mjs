// One-off backfill: gives every collaborator who joined before invitations
// created person nodes a Member in that tree, the way invitations.accept now does.
//
//   node --env-file=.env.local scripts/link-collaborator-members.mjs --dry-run
//   node --env-file=.env.local scripts/link-collaborator-members.mjs
//
// Point --env-file at the environment to fix (e.g. a pulled production env).
// Idempotent. Self-contained on purpose (the app's modules are server-only):
// keep the rules in step with src/server/collaborator-member.ts.
import { PrismaClient } from "@prisma/client";

const dryRun = process.argv.includes("--dry-run");
const db = new PrismaClient();

function splitDisplayName(name, email) {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { firstName: email.split("@")[0] || email, lastName: "" };
  if (words.length === 1) return { firstName: words[0], lastName: "" };
  return { firstName: words.slice(0, -1).join(" "), lastName: words[words.length - 1] };
}

const counts = { linked: 0, created: 0, skipped: 0 };

try {
  const collaborators = await db.treeCollaborator.findMany({
    select: { treeId: true, role: true, user: { select: { id: true, name: true, email: true } } },
  });
  console.log(`${collaborators.length} collaborators${dryRun ? " (dry run)" : ""}`);

  for (const { treeId, role, user } of collaborators) {
    const existing = await db.member.findFirst({ where: { treeId, userId: user.id }, select: { id: true } });
    if (existing) {
      counts.skipped++;
      continue;
    }
    const { firstName, lastName } = splitDisplayName(user.name, user.email);
    const fullName = [firstName, lastName].filter(Boolean).join(" ");
    const sameName = await db.member.findMany({
      where: {
        treeId,
        userId: null,
        firstName: { equals: firstName, mode: "insensitive" },
        lastName: { equals: lastName, mode: "insensitive" },
      },
      select: { id: true },
      take: 2,
    });

    if (sameName.length === 1) {
      console.log(`link   ${fullName} → member ${sameName[0].id} (tree ${treeId})`);
      if (!dryRun) await db.member.update({ where: { id: sameName[0].id }, data: { userId: user.id, role } });
      counts.linked++;
      continue;
    }

    console.log(`create ${fullName} (tree ${treeId})`);
    if (!dryRun) {
      await db.$transaction([
        db.member.create({ data: { treeId, firstName, lastName, userId: user.id, role } }),
        db.activityLog.create({
          data: { treeId, actorId: user.id, action: "MEMBER_ADDED", description: `${fullName} joined the tree` },
        }),
      ]);
    }
    counts.created++;
  }
  console.log(counts);
} finally {
  await db.$disconnect();
}
