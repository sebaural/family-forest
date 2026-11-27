import "server-only";
import type { DigestTree } from "@/emails/DigestEmail";
import { db } from "@/lib/db";
import { appUrl, sendDigestEmail } from "@/lib/email";

const DIGEST_WINDOW_MS = 24 * 60 * 60 * 1000;
const ENTRIES_PER_TREE = 10;

export interface DigestPlanEntry {
  userId: string;
  email: string;
  trees: { treeId: string; entries: number }[];
}

export interface DigestResult {
  since: string;
  treesWithActivity: number;
  recipients: DigestPlanEntry[];
  sent: number;
  failed: number;
  dryRun: boolean;
}

function timeUtc(date: Date): string {
  return `${date.toISOString().slice(11, 16)} UTC`;
}

/**
 * Daily digest: for each tree with activity in the last 24 hours, emails its
 * owner and collaborators who have the digest on. Entries a person made
 * themselves are left out, so nobody is told about their own changes, and
 * people with nothing left aren't emailed.
 */
export async function runDigest(options: { dryRun?: boolean; now?: Date } = {}): Promise<DigestResult> {
  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - DIGEST_WINDOW_MS);

  const trees = await db.familyTree.findMany({
    where: { activity: { some: { createdAt: { gte: since, lt: now } } } },
    select: {
      id: true,
      name: true,
      owner: { select: { id: true, email: true, name: true, digestEnabled: true } },
      collaborators: {
        where: { approvedAt: { not: null } },
        select: { user: { select: { id: true, email: true, name: true, digestEnabled: true } } },
      },
      activity: {
        where: { createdAt: { gte: since, lt: now } },
        orderBy: { createdAt: "asc" },
        select: { actorId: true, description: true, createdAt: true },
      },
    },
  });

  type Person = { id: string; email: string; name: string | null };
  const byRecipient = new Map<string, { person: Person; trees: (DigestTree & { treeId: string })[] }>();

  for (const tree of trees) {
    const people = [tree.owner, ...tree.collaborators.map((c) => c.user)];
    for (const person of people) {
      if (!person.digestEnabled) continue;
      const others = tree.activity.filter((entry) => entry.actorId !== person.id);
      if (others.length === 0) continue;

      const shown = others.slice(-ENTRIES_PER_TREE);
      const recipient = byRecipient.get(person.id) ?? { person, trees: [] };
      recipient.trees.push({
        treeId: tree.id,
        treeName: tree.name,
        treeUrl: appUrl(`/tree/${tree.id}`),
        entries: shown.map((entry) => ({ description: entry.description, at: timeUtc(entry.createdAt) })),
        more: others.length - shown.length,
      });
      byRecipient.set(person.id, recipient);
    }
  }

  const recipients = Array.from(byRecipient.values());
  let sent = 0;
  let failed = 0;
  if (!options.dryRun) {
    for (const { person, trees: digestTrees } of recipients) {
      const ok = await sendDigestEmail({
        to: person.email,
        name: person.name,
        trees: digestTrees,
      });
      if (ok) sent++;
      else failed++;
    }
  }

  return {
    since: since.toISOString(),
    treesWithActivity: trees.length,
    recipients: recipients.map(({ person, trees: digestTrees }) => ({
      userId: person.id,
      email: person.email,
      trees: digestTrees.map((tree) => ({ treeId: tree.treeId, entries: tree.entries.length + tree.more })),
    })),
    sent,
    failed,
    dryRun: options.dryRun ?? false,
  };
}
