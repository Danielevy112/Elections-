/** Coverage report: how many candidates have a photo, a sourced bio and a Knesset record. */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildSite, loadSnapshot, repoRoot } from "@elections26/data";
import { verifyKnessetLink } from "@elections26/schema";

const root = repoRoot();
const ov = (f: string) => JSON.parse(readFileSync(join(root, "data", "manual_overrides", f), "utf8"));
const norm = (s: string) => s.replace(/״/g, '"').replace(/׳/g, "'").replace(/–/g, "-").replace(/\s+/g, " ").trim();
const profiles: Record<string, { knessetTerms: number[]; linkReason?: string }> = ov("knesset_profiles.json").profiles;
const photos = new Set<string>(ov("photos.json").photos.map((p: any) => `${p.partyKey}:${p.position}`));
const bioPages = new Map<string, string>(ov("bios.json").bios.map((b: any) => [`${b.partyKey}:${b.position}`, b.sourcePage]));
const bios = new Set(bioPages.keys());

/** A record counts only when the site would show it (same rule as extras.knessetProfile). */
function hasVerifiedRecord(name: string, key: string): boolean {
  const p = profiles[norm(name)];
  if (!p) return false;
  return verifyKnessetLink(Math.max(0, ...p.knessetTerms) || undefined, {
    manualReason: p.linkReason,
    bioSourcePage: bioPages.get(key),
  }).accepted;
}

const site = buildSite(loadSnapshot());
const rows = site.candidates.map((c) => {
  const key = `${(c.party?.id ?? "").replace(/^party:/, "")}:${c.position}`;
  return {
    key, name: c.person.nameHe, band: c.band ?? "out",
    record: hasVerifiedRecord(c.person.nameHe, key), photo: photos.has(key), bio: bios.has(key),
  };
});
function stats(rs: typeof rows) {
  return {
    n: rs.length,
    photo: rs.filter((r) => r.photo).length,
    bio: rs.filter((r) => r.bio).length,
    record: rs.filter((r) => r.record).length,
    recordOrBio: rs.filter((r) => r.record || r.bio).length,
    empty: rs.filter((r) => !r.record && !r.bio).length,
  };
}
const inSeats = rows.filter((r) => r.band !== "out");
console.log(JSON.stringify({ projected: stats(inSeats), all: stats(rows) }));
writeFileSync("/tmp/coverage_rows.json", JSON.stringify(rows));
