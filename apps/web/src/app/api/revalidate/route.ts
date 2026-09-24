import { revalidateTag } from "next/cache";
import { timingSafeEqual } from "node:crypto";

/**
 * Called by the sync job right after it publishes a new data version. Drops the cached
 * data and every page built from it; the next visitor gets a freshly rendered page.
 */
export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET ?? "";
  const given = request.headers.get("x-revalidate-secret") ?? "";
  const ok = secret.length > 0 && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return new Response("forbidden", { status: 403 });
  revalidateTag("data");
  return Response.json({ revalidated: true, at: new Date().toISOString() });
}
