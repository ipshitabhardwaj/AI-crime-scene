import "server-only";
import { redirect, unstable_rethrow } from "next/navigation";

/**
 * Runs an admin/judge form action and sends the browser back to `path` with a
 * visible result (?ok=… or ?err=…), rendered by <Flash/>. In production,
 * Next.js hides the message of thrown errors, so without this an organiser
 * would only see "Something went wrong".
 * Throw UserError for messages meant for the organiser.
 */
export class UserError extends Error {}

export async function runAction(path: string, fn: () => Promise<string | void>): Promise<never> {
  let target: string;
  try {
    const msg = await fn();
    target = withParam(path, "ok", msg || "Done.");
  } catch (e) {
    unstable_rethrow(e); // let redirect()/notFound() through
    const msg = e instanceof UserError ? e.message : `Failed: ${e instanceof Error ? e.message : String(e)}`;
    console.error("[admin action]", path, e);
    target = withParam(path, "err", msg);
  }
  redirect(target);
}

function withParam(path: string, key: string, value: string) {
  const [base] = path.split("?");
  return `${base}?${key}=${encodeURIComponent(value.slice(0, 400))}&t=${Date.now()}`;
}

/** The page to come back to, from a hidden `back` field (same-site paths only). */
export function backTo(formData: FormData, fallback: string) {
  const b = String(formData.get("back") ?? "");
  return b.startsWith("/") && !b.startsWith("//") ? b : fallback;
}

export function confirmed(formData: FormData) {
  return formData.get("confirm") === "on" || formData.get("confirm") === "yes";
}
