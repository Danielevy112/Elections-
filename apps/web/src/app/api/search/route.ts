import { parseSearchQuery, QUERY_LIMITS } from "@elections26/data";
import { search } from "@/lib/search";

/**
 * GET /api/search?q=… — public, read-only, returns public fields only.
 *
 * The query is validated before anything else (2–40 characters of the kinds found in
 * names; anything else is a 400), and answers are cached on the CDN per query, so repeated
 * and bursty traffic is served from the edge. A rate limit on /api/* sits in front of this
 * in the Vercel Firewall.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = parseSearchQuery(url.searchParams.get("q"));
  if (!q) {
    return Response.json(
      { error: `q must be ${QUERY_LIMITS.minLength}-${QUERY_LIMITS.maxLength} characters of a name` },
      { status: 400, headers: { "Cache-Control": "public, max-age=3600" } },
    );
  }
  try {
    const results = await search(q, QUERY_LIMITS.maxResults);
    return Response.json(
      { q, results },
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=3600" } },
    );
  } catch (err) {
    console.error("[search] failed:", err);
    return Response.json({ error: "search unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
