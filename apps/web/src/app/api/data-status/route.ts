import { published } from "@/lib/site";

export const dynamic = "force-dynamic";

/** Which store served the current data, and its size. No personal data. */
export async function GET() {
  const { snapshot, extras, from } = await published();
  const e = extras as unknown as Record<string, unknown>;
  const size = (v: unknown) => (Array.isArray(v) ? v.length : v && typeof v === "object" ? Object.keys(v).length : 0);
  return Response.json({
    from,
    generatedAt: snapshot.meta.generatedAt,
    candidacies: snapshot.candidacies.length,
    photos: size(e.photos),
    bios: size(e.bios),
    knessetProfiles: size(e.knessetProfiles),
  });
}
