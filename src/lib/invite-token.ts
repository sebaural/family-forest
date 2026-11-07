import { createHash } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";
import { env } from "@/env";

export const INVITE_TTL_DAYS = 7;
const AUDIENCE = "familyforest:invite";

// A key separate from session tokens, derived from the same secret.
const key = createHash("sha256").update(`${env.NEXTAUTH_SECRET}:invite`).digest();

const claimsSchema = z.object({
  invitationId: z.string(),
  treeId: z.string(),
  role: z.enum(["EDITOR", "VIEWER"]),
});
export type InviteClaims = z.infer<typeof claimsSchema>;

export function signInviteToken(claims: InviteClaims): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${INVITE_TTL_DAYS}d`)
    .sign(key);
}

export type VerifyResult =
  | { ok: true; claims: InviteClaims }
  | { ok: false; reason: "expired" | "invalid" };

export async function verifyInviteToken(token: string): Promise<VerifyResult> {
  try {
    const { payload } = await jwtVerify(token, key, { audience: AUDIENCE, algorithms: ["HS256"] });
    const claims = claimsSchema.safeParse(payload);
    return claims.success ? { ok: true, claims: claims.data } : { ok: false, reason: "invalid" };
  } catch (error) {
    const expired = error instanceof Error && "code" in error && error.code === "ERR_JWT_EXPIRED";
    return { ok: false, reason: expired ? "expired" : "invalid" };
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function inviteUrl(token: string): string {
  return new URL(`/invite/${token}`, env.NEXT_PUBLIC_APP_URL).toString();
}
