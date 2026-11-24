"use server";

import { signOut } from "@/lib/auth";

/** Ends this device's session and goes to the home page. */
export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
