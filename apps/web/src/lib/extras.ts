import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@elections26/data";

/**
 * Side data that is not (yet) part of the snapshot schema: Knesset records fetched
 * straight from the Knesset OData service, and party-published photos. Both are keyed
 * by the candidate's name exactly as filed, so nothing here is matched by guesswork.
 */
export interface KnessetRole {
  title: string;
  of: string | null;
  knesset: number;
  knessets?: number[];
  start: string | null;
  end: string | null;
}

export interface KnessetProfile {
  knessetPersonId: number;
  nameKnesset?: string;
  knessetTerms: number[];
  firstMkDate: string;
  yearsAsMk: number;
  roles: KnessetRole[];
  factions: { knesset: number; name: string }[];
  billsInitiated: number;
  billsPassed: number;
  parliamentaryQuestions: number | null;
  sources: { positions: string; bills: string; questions: string };
}

export interface PartyPhoto {
  partyKey: string;
  position: number;
  nameHe: string;
  nameAsPrinted: string;
  path: string;
  imageUrl: string;
  sourcePage: string;
  credit: string;
}

function readJson<T>(file: string, fallback: T): T {
  const path = join(repoRoot(), "data", "manual_overrides", file);
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : fallback;
}

let profiles: Record<string, KnessetProfile> | undefined;
let photos: Map<string, PartyPhoto> | undefined;

const norm = (s: string) =>
  s.replace(/״/g, '"').replace(/׳/g, "'").replace(/–/g, "-").replace(/\s+/g, " ").trim();

export function knessetProfile(filedName: string): KnessetProfile | undefined {
  profiles ??= readJson<{ profiles: Record<string, KnessetProfile> }>("knesset_profiles.json", { profiles: {} }).profiles;
  return profiles[norm(filedName)];
}

export function partyPhoto(partyId: string | undefined, position: number | undefined): PartyPhoto | undefined {
  if (!partyId || position === undefined) return undefined;
  if (!photos) {
    photos = new Map();
    for (const p of readJson<{ photos: PartyPhoto[] }>("photos.json", { photos: [] }).photos) {
      photos.set(`${p.partyKey}:${p.position}`, p);
    }
  }
  return photos.get(`${partyId.replace(/^party:/, "")}:${position}`);
}

export interface PartyBio {
  partyKey: string;
  position: number;
  nameHe: string;
  nameAsPrinted: string;
  text: string;
  sourcePage: string;
  credit: string;
}

let bios: Map<string, PartyBio> | undefined;

/** The party's own bio paragraph for this candidate, verbatim (see scripts/party_bios.py). */
export function partyBio(partyId: string | undefined, position: number | undefined): PartyBio | undefined {
  if (!partyId || position === undefined) return undefined;
  if (!bios) {
    bios = new Map();
    for (const b of readJson<{ bios: PartyBio[] }>("bios.json", { bios: [] }).bios) bios.set(`${b.partyKey}:${b.position}`, b);
  }
  return bios.get(`${partyId.replace(/^party:/, "")}:${position}`);
}

/** First sentence of the party's bio, verbatim, for the table's role line. */
export function bioLine(b: PartyBio | undefined): string | undefined {
  if (!b) return undefined;
  const m = b.text.match(/^.+?[.!?](?=\s|$)/);
  return (m ? m[0] : b.text).trim();
}

/**
 * The name to show. The filed lists write "last first"; where the Knesset or the party's
 * own page prints the same person's name, that ("first last") form is shown instead.
 */
export function displayName(filedName: string, partyId?: string, position?: number): string {
  return knessetProfile(filedName)?.nameKnesset ?? partyPhoto(partyId, position)?.nameAsPrinted ?? filedName;
}

/** Most senior role for the table's "role" column. */
const RANK = ["ראש הממשלה", "ראש הממשלה החילופי", 'מ"מ ראש הממשלה', "משנה לראש הממשלה", "סגן ראש הממשלה", "סגנית ראש הממשלה", "יושב ראש הכנסת", "יושבת ראש הכנסת", "ראש האופוזיציה", "ראשת האופוזיציה", "שר", "שרה", "סגן שר", "סגנית שר", 'יו"ר ועדה', "יושב ראש הקואליציה", "יושבת ראש הקואליציה", "סגן יושב ראש הכנסת", "סגנית יושב ראש הכנסת", 'יו"ר סיעה'];

export function topRole(p: KnessetProfile | undefined): KnessetRole | undefined {
  if (!p || p.roles.length === 0) return undefined;
  return [...p.roles].sort((a, b) => {
    const r = RANK.indexOf(a.title) - RANK.indexOf(b.title);
    return r !== 0 ? r : (b.start ?? "").localeCompare(a.start ?? "");
  })[0];
}

export function roleLabel(r: KnessetRole): string {
  if (!r.of) return r.title;
  if (/^(שר|שרה|סגן שר|סגנית שר|סגן שרה)$/.test(r.title)) return `${r.title} ${r.of.replace(/^משרד\s+/, "")}`;
  if (r.title === 'יו"ר ועדה') return `יו"ר ${r.of}`;
  return r.title;
}

export function initials(name: string): string {
  const parts = name.split(" ").filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]).join("");
}
