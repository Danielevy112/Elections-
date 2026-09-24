
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
  /** Set when the filed name was linked to this record by a reviewed manual link. */
  linkReason?: string;
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

export interface ExtrasData {
  knessetProfiles: Record<string, KnessetProfile>;
  photos: PartyPhoto[];
  bios: PartyBio[];
}

/**
 * Set by site() from the published data version (database or committed JSON) before any
 * page reads it. Indexes are rebuilt only when a new version arrives.
 */
let current: ExtrasData | undefined;
let profiles: Record<string, KnessetProfile> = {};
let photos = new Map<string, PartyPhoto>();
let bios = new Map<string, PartyBio>();

export function setExtras(data: ExtrasData): void {
  if (current === data) return;
  current = data;
  profiles = data.knessetProfiles;
  photos = new Map(data.photos.map((p) => [`${p.partyKey}:${p.position}`, p]));
  bios = new Map(data.bios.map((b) => [`${b.partyKey}:${b.position}`, b]));
}

const norm = (s: string) =>
  s.replace(/״/g, '"').replace(/׳/g, "'").replace(/–/g, "-").replace(/\s+/g, " ").trim();

export function knessetProfile(filedName: string): KnessetProfile | undefined {
  return profiles[norm(filedName)];
}

export function partyPhoto(partyId: string | undefined, position: number | undefined): PartyPhoto | undefined {
  if (!partyId || position === undefined) return undefined;
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

/** The candidate's sourced bio (party page, own site, or Wikipedia), verbatim. */
export function partyBio(partyId: string | undefined, position: number | undefined): PartyBio | undefined {
  if (!partyId || position === undefined) return undefined;
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
