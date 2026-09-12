import type { Fetcher } from "../http";
import { FieldReport, pickInt, pickString } from "../odata";

export const CKAN_BASE = "https://data.gov.il/api/3/action";

/** The Central Elections Committee's candidate-list dataset on data.gov.il. */
export const CANDIDATES_DATASET = "candidates-lists";

export interface CkanResource {
  id: string;
  name: string;
  format: string;
  /**
   * Whether the rows are queryable through datastore_search. The portal publishes these
   * as XLSX uploads that it then indexes, so the source format says nothing useful; this
   * flag is what decides whether we can read the rows at all.
   */
  datastoreActive: boolean;
}

/**
 * CKAN wraps every reply as `{success, result}`; a failed action still returns HTTP 200,
 * so the envelope has to be checked rather than the status code.
 */
function ckanResult(payload: unknown, action: string): Record<string, unknown> {
  if (typeof payload !== "object" || payload === null) {
    throw new Error(`CKAN ${action}: unexpected payload`);
  }
  const body = payload as Record<string, unknown>;
  if (body.success !== true) {
    throw new Error(`CKAN ${action} reported failure: ${JSON.stringify(body.error ?? {})}`);
  }
  if (typeof body.result !== "object" || body.result === null) {
    throw new Error(`CKAN ${action}: missing result`);
  }
  return body.result as Record<string, unknown>;
}

export async function listResources(
  fetcher: Fetcher,
  datasetId = CANDIDATES_DATASET,
): Promise<CkanResource[]> {
  const result = ckanResult(
    await fetcher.json(`${CKAN_BASE}/package_show?id=${encodeURIComponent(datasetId)}`),
    "package_show",
  );
  const resources = Array.isArray(result.resources) ? result.resources : [];
  return resources
    .map((raw) => raw as Record<string, unknown>)
    .filter((raw) => typeof raw.id === "string")
    .map((raw) => ({
      id: raw.id as string,
      name: typeof raw.name === "string" ? raw.name : "",
      format: typeof raw.format === "string" ? raw.format.toUpperCase() : "",
      datastoreActive: raw.datastore_active === true,
    }));
}

/**
 * Page through a datastore resource. The Israeli portal caps `limit` well below what it
 * advertises and sits behind a WAF that rejects large pages, so 1000 is deliberate.
 */
export async function datastoreSearch(
  fetcher: Fetcher,
  resourceId: string,
  options: { limit?: number; hardLimit?: number } = {},
): Promise<Record<string, unknown>[]> {
  const limit = options.limit ?? 1000;
  const hardLimit = options.hardLimit ?? 20_000;
  const rows: Record<string, unknown>[] = [];
  let offset = 0;

  while (rows.length < hardLimit) {
    const url = `${CKAN_BASE}/datastore_search?resource_id=${encodeURIComponent(resourceId)}&limit=${limit}&offset=${offset}`;
    const result = ckanResult(await fetcher.json(url), "datastore_search");
    const page = Array.isArray(result.records) ? (result.records as Record<string, unknown>[]) : [];
    rows.push(...page);
    if (page.length < limit) break;
    offset += limit;
  }

  return rows.slice(0, hardLimit);
}

/* ------------------------------------------------------------------------------------
 * Candidate lists for a specific Knesset
 *
 * The 26th-Knesset lists are not in this dataset yet — it currently carries earlier
 * elections. Rather than have someone check the portal by hand every week, this half of
 * the adapter watches for the resource to appear and ingests it the moment it does.
 * ---------------------------------------------------------------------------------- */

const HEBREW_ONES = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
const HEBREW_TENS = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];

/** Hebrew numeral for a Knesset number, e.g. 26 -> "כו" (written "כ״ו"). */
export function hebrewNumeral(n: number): string {
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  if (tens >= HEBREW_TENS.length || ones >= HEBREW_ONES.length) return String(n);
  return `${HEBREW_TENS[tens] ?? ""}${HEBREW_ONES[ones] ?? ""}`;
}

/**
 * Whether a resource name refers to a given Knesset. The portal labels resources
 * inconsistently — "הכנסת ה-25", "כנסת כ״ה", "candidates_25" have all appeared — so both
 * the digits and the Hebrew numeral are accepted, the latter with optional gershayim.
 */
export function resourceMatchesKnesset(name: string, knessetNumber: number): boolean {
  if (new RegExp(`(?<!\\d)${knessetNumber}(?!\\d)`).test(name)) return true;

  const numeral = hebrewNumeral(knessetNumber);
  if (numeral.length !== 2) return false;
  const [tens, ones] = numeral;
  return new RegExp(`${tens}["״']?${ones}(?![\\u0590-\\u05FF])`).test(name);
}

/**
 * Find the resource covering one Knesset. Returns undefined rather than falling back to
 * the nearest match: silently ingesting the 25th Knesset's lists as the 26th's would be a
 * far worse outcome than reporting that the data is not there yet.
 */
export function findElectionResource(
  resources: CkanResource[],
  knessetNumber: number,
): CkanResource | undefined {
  return resources.find((resource) => resourceMatchesKnesset(resource.name, knessetNumber));
}

export interface CandidateListRow {
  partyName: string;
  ballotLetters: string | undefined;
  candidateName: string;
  position: number;
}

export interface CandidateListPull {
  rows: CandidateListRow[];
  report: FieldReport;
}

/**
 * Read candidate lists out of a datastore resource.
 *
 * Column names on this portal are Hebrew and have never been stable between elections, so
 * each field lists the spellings that have appeared and the FieldReport records which one
 * actually matched. A live run therefore tells us the real shape instead of quietly
 * producing rows full of undefined.
 */
export async function fetchCandidateLists(
  fetcher: Fetcher,
  resourceId: string,
): Promise<CandidateListPull> {
  const report = new FieldReport();
  const records = await datastoreSearch(fetcher, resourceId);
  const rows: CandidateListRow[] = [];

  for (const record of records) {
    const partyName = pickString(
      record,
      ["שם הרשימה", "שם רשימה", "שם_הרשימה", "מפלגה", "list_name", "party_name"],
      report,
    );

    // Some editions carry a single name column, others split it in two.
    const fullName = pickString(
      record,
      ["שם המועמד", "שם מועמד", "שם_המועמד", "candidate_name", "שם"],
      report,
    );
    const firstName = pickString(record, ["שם פרטי", "first_name"], report);
    const lastName = pickString(record, ["שם משפחה", "last_name"], report);
    const candidateName = fullName ?? [firstName, lastName].filter(Boolean).join(" ").trim();

    const position = pickInt(
      record,
      ["מיקום", "מקום", "מספר סידורי", "סדר", "position", "order"],
      report,
    );

    if (!partyName || !candidateName || position === undefined) continue;

    rows.push({
      partyName,
      ballotLetters: pickString(record, ["אות", "אותיות", "סמל", "letters", "ballot"], report),
      candidateName,
      position,
    });
  }

  return { rows, report };
}

export interface CandidateListProbe {
  datasetId: string;
  knessetNumber: number;
  resources: CkanResource[];
  matched: CkanResource | undefined;
  rowCount: number;
}

/**
 * Check whether the official dataset covers a Knesset yet, without ingesting anything.
 * Run on every sync so the scheduled pull reports, in plain words, when real lists appear.
 */
export async function probeCandidateLists(
  fetcher: Fetcher,
  knessetNumber: number,
  datasetId = CANDIDATES_DATASET,
): Promise<CandidateListProbe> {
  const resources = await listResources(fetcher, datasetId);
  const matched = findElectionResource(resources, knessetNumber);
  // Only readable resources are worth counting; an un-indexed upload would otherwise
  // report zero rows and look indistinguishable from an empty list.
  const rowCount =
    matched?.datastoreActive === true
      ? (await fetchCandidateLists(fetcher, matched.id)).rows.length
      : 0;

  return { datasetId, knessetNumber, resources, matched, rowCount };
}

export function describeProbe(probe: CandidateListProbe): string {
  const lines = [
    `data.gov.il dataset "${probe.datasetId}": ${probe.resources.length} resource(s)`,
  ];
  for (const resource of probe.resources) {
    const mark = resource.id === probe.matched?.id ? "->" : "  ";
    const queryable = resource.datastoreActive ? "" : " (not queryable)";
    lines.push(
      `  ${mark} ${resource.name || "(unnamed)"} [${resource.format}]${queryable} ${resource.id}`,
    );
  }

  if (!probe.matched) {
    lines.push(
      `  Knesset ${probe.knessetNumber} is NOT covered yet; the manual lists remain in use.`,
    );
  } else if (!probe.matched.datastoreActive) {
    lines.push(
      `  Knesset ${probe.knessetNumber} has a resource but it is not queryable through ` +
        "datastore_search, so its rows cannot be read yet.",
    );
  } else {
    lines.push(
      `  Knesset ${probe.knessetNumber} IS covered — ${probe.rowCount} candidate row(s) available.`,
    );
  }
  return lines.join("\n");
}
