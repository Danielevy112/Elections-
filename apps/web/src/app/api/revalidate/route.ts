import { revalidateTag } from "next/cache";
import { timingSafeEqual } from "node:crypto";

/**
 * Called by the sync job right after it publishes a new data version. Drops the cached
 * data and every page built from it; the next visitor gets a freshly rendered page.
 */
export async function POST(request: Request) {
  const secret = Buffer.from(process.env.REVALIDATE_SECRET ?? "");
  const given = Buffer.from(request.headers.get("x-revalidate-secret") ?? "");
  // Byte lengths, not string lengths: timingSafeEqual throws on a byte-length mismatch,
  // which a multi-byte header of the right string length would otherwise turn into a 500.
  const ok = secret.length > 0 && given.length === secret.length && timingSafeEqual(given, secret);
  if (!ok) return new Response("forbidden", { status: 403 });
  revalidateTag("data");
  return Response.json({ revalidated: true, at: new Date().toISOString() });
}
