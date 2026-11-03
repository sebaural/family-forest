/** Thrown by relationships.add when a link would close a parent/child loop. */
export const CYCLE_ERROR_MESSAGE = "This would make someone their own ancestor";

type ErrorLike = { message: string; data?: { code?: string } | null };

/** Turns a tRPC client error into text that is safe to show inline. */
export function getErrorMessage(error: ErrorLike): string {
  if (error.message === CYCLE_ERROR_MESSAGE) {
    return "This would create a circular ancestry. Please check your relationships.";
  }

  const code = error.data?.code;
  // No code means the request never got a tRPC response.
  if (!code) return "Couldn't reach the server. Check your connection and try again.";
  // Zod failures arrive with the raw issue list as a JSON message.
  if (code === "BAD_REQUEST" && error.message.startsWith("[")) {
    return "Some of those values aren't valid. Please check them and try again.";
  }
  if (code === "INTERNAL_SERVER_ERROR") return "Something went wrong. Please try again.";
  return error.message;
}
