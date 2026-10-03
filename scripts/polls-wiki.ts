import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadManualBundle, stableJson } from "@elections26/ingest";
import { checkPoll, toManualPoll, type PollInput } from "./add-poll";

/**
 * Finds new seat polls in the English Wikipedia table "Opinion polling for the 2026 Israeli
 * legislative election" and turns them into poll entries.
 *
 * Wikipedia is only the index. A poll is written only when
 *   - its source is the publisher's own article (a URL on the publisher's domain), and
 *   - a person has checked the row's figures against that article and recorded the check in
 *     data/review/poll_checks.json (publisher and fieldwork end as the table gives them,
 *     the article URL, and what was compared).
 * Everything else — rows cited to another outlet, broadcasts, unchecked rows — is listed for
 * review and never written.
 *
 *   npx tsx scripts/polls-wiki.ts <api-response.json | wikitext> [--write]
 *
 * The page is fetched through a fetch/* branch (see AGENTS.md), since this environment
 * cannot reach Wikipedia directly.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANUAL_DIR = join(ROOT, "data", "manual_overrides");

/**
 * The 2026 table's seat columns, left to right, as party keys. Checked against the
 * Midgam / Channel 12 poll of 22.9.2026, which was entered by hand from the article: all
 * thirteen figures match. "RZP-Zehut" and "Reservists-NEP" span two header columns but one
 * cell per row (colspan=2).
 */
export const SEAT_COLUMNS = [
  "k26-29", // Likud
  "k26-01", // Together (ביחד)
  "k26-31", // RZP-Zehut (הציונות הדתית)
  "k26-14", // Otzma Yehudit
  "k26-30", // Blue & White
  "k26-19", // Shas
  "k26-37", // UTJ
  "k26-11", // Yisrael Beiteinu
  "k26-18", // Ra'am
  "k26-35", // Joint List
  "k26-17", // The Democrats
  "k26-02", // Yashar
  "k26-16", // Reservists-NEP (המילואימניקים והכלכלית)
  "k26-06", // Amcha Yisrael
  "k26-20", // Haredi Public (הציבור החרדי)
] as const;

/** Publisher as the table names it → Hebrew name and the domains of its own articles. */
export const PUBLISHERS: Record<string, { nameHe: string; domains: string[] }> = {
  "HaHadashot 12": { nameHe: "חדשות 12", domains: ["mako.co.il", "n12.co.il"] },
  "Channel 12": { nameHe: "חדשות 12", domains: ["mako.co.il", "n12.co.il"] },
  "Channel 13": { nameHe: "חדשות 13", domains: ["13tv.co.il"] },
  "Channel 14": { nameHe: "חדשות 14", domains: ["c14.co.il", "now14.co.il"] },
  "Kan 11": { nameHe: "כאן חדשות", domains: ["kan.org.il"] },
  Kan: { nameHe: "כאן חדשות", domains: ["kan.org.il"] },
  Maariv: { nameHe: "מעריב", domains: ["maariv.co.il"] },
  "i24 News": { nameHe: "i24NEWS", domains: ["i24news.tv"] },
  "Zman Yisrael": { nameHe: "זמן ישראל", domains: ["zman.co.il"] },
  "Israel Hayom": { nameHe: "ישראל היום", domains: ["israelhayom.co.il"] },
  Walla: { nameHe: "וואלה", domains: ["walla.co.il"] },
  "Yedioth Ahronoth": { nameHe: "ידיעות אחרונות", domains: ["ynet.co.il"] },
  Ynet: { nameHe: "ynet", domains: ["ynet.co.il"] },
};

/** Polling firms as the table abbreviates them (its "Pollsters and publishers" key). */
export const POLLSTERS: Record<string, string> = {
  "MP+TM+SN+A": "המדד (עם סטט-נט, פרויקט המדגם ואסקריא)",
  "Midgam R&C": "מדגם ייעוץ ומחקר",
  // The same name as the Channel 14 poll entered by hand from the article, so the projection
  // (newest poll per pollster) does not count Channel 14 twice.
  "SF+ND": "NEXT DATA",
  "Direct Polls": "דיירקט פולס",
  Kantar: "מכון קנטאר",
  "LRI+P4A": "לזר מחקרים ו-Panel4All",
  "Yossi Tatika": "יוסי טטיקה",
  "Maagar Mochot": "מאגר מוחות",
};

/** Publishers whose cited pages are broadcasts, not articles: the figures cannot be checked
 * against text, so their rows always go to review. */
const VIDEO_ONLY = new Set(["Channel 16"]);

export interface PollCheck {
  publisher: string;
  fieldworkEnd: string;
  sourceUrl: string;
  check: string;
  checkedAt: string;
  /** The article's own publication date, when the check read it. */
  publishedAt?: string;
}

export interface WikiPollRow {
  fieldworkStart: string;
  fieldworkEnd: string;
  pollster: string;
  publisher: string;
  sampleSize?: number;
  sourceUrl?: string;
  sourceDate?: string;
  seats: PollInput["seats"];
}

const MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

const pad = (n: string) => n.padStart(2, "0");

/** {{Opdrts|start|end|Mon|Year}} → [start, end]; an empty start means a single day. */
export function parseFieldwork(cell: string): [string, string] | undefined {
  const m = /\{\{Opdrts\|(\d*)\|(\d+)\|([A-Z][a-z]{2})\|(\d{4})\}\}/.exec(cell);
  if (!m) return undefined;
  const [, startDay, endDay, mon, year] = m;
  const month = MONTHS[mon!];
  if (!month) return undefined;
  const end = `${year}-${month}-${pad(endDay!)}`;
  if (!startDay) return [end, end];
  // A start day larger than the end day began in the previous month ("30|1|Oct").
  const startMonth = Number(startDay) > Number(endDay) ? pad(String(Number(month) - 1)) : month;
  return [`${year}-${startMonth}-${pad(startDay)}`, end];
}

/** "22 September 2026" → "2026-09-22". */
function parseRefDate(text: string): string | undefined {
  const m = /^\s*(\d{1,2}) ([A-Z][a-z]+) (\d{4})\s*$/.exec(text);
  if (!m) return undefined;
  const month = MONTHS[m[2]!.slice(0, 3)];
  return month ? `${m[3]}-${month}-${pad(m[1]!)}` : undefined;
}

/** A seat cell: a number, a below-threshold share like {{small|(1.4%)}}, or n/a. */
export function parseSeatCell(cell: string): { mandates: number; belowThreshold: boolean } | undefined {
  const text = cell.replace(/^[^|]*\bstyle=[^|]*\|/, "").replace(/'''/g, "").trim();
  if (/\{\{\s*n\/a\s*\}\}/i.test(text) || text === "–" || text === "-" || text === "") return undefined;
  if (/\(/.test(text)) return { mandates: 0, belowThreshold: true };
  const n = /^(\d+)$/.exec(text);
  if (!n) return undefined;
  const mandates = Number(n[1]);
  return mandates === 0 ? { mandates: 0, belowThreshold: true } : { mandates, belowThreshold: false };
}

/** Split on "||" outside {{templates}}, [[links]] and <ref>s ("{{Opdrts||1|Oct|2026}}"). */
function splitInline(line: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inRef = false;
  let current = "";
  for (let i = 0; i < line.length; i += 1) {
    const two = line.slice(i, i + 2);
    if (line.startsWith("<ref", i)) inRef = true;
    if (inRef && (line.startsWith("</ref>", i) || line.startsWith("/>", i))) inRef = false;
    if (two === "{{" || two === "[[") depth += 1;
    if ((two === "}}" || two === "]]") && depth > 0) depth -= 1;
    if (two === "||" && depth === 0 && !inRef) {
      parts.push(current);
      current = "";
      i += 1;
      continue;
    }
    current += line[i];
  }
  parts.push(current);
  return parts;
}

/** Split a row into cells, keeping a cell's colspan so columns line up. */
function cells(row: string): { text: string; span: number }[] {
  const out: { text: string; span: number }[] = [];
  for (const line of row.split("\n")) {
    if (!line.startsWith("|") || line.startsWith("|-") || line.startsWith("|}")) continue;
    for (const raw of splitInline(line.slice(1))) {
      const span = /colspan\s*=\s*"?(\d+)"?/.exec(raw);
      const text = span ? raw.replace(/^[^|]*colspan[^|]*\|/, "") : raw;
      out.push({ text: text.trim(), span: span ? Number(span[1]) : 1 });
    }
  }
  return out;
}

/** Every poll row of the "=== 2026 ===" seat table. Event rows (one wide cell) are skipped. */
export function parseWikiPolls(wikitext: string): WikiPollRow[] {
  const start = wikitext.indexOf("=== 2026 ===");
  if (start < 0) throw new Error('no "=== 2026 ===" section in the page');
  const end = wikitext.indexOf("\n|}", start);
  const table = wikitext.slice(start, end < 0 ? undefined : end);

  const rows: WikiPollRow[] = [];
  for (const row of table.split(/\n\|-/).slice(1)) {
    const fieldwork = parseFieldwork(row);
    if (!fieldwork) continue;
    const c = cells(row);
    if (c.length < 5 || c.some((x) => x.span > 2)) continue; // an event row

    const [, firm, publisherCell, sample, ...seatCells] = c;
    const pollster = firm!.text.replace(/^[^|]*\bstyle=[^|]*\|/, "").replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1").trim();
    const publisher = publisherCell!.text
      .replace(/<ref[\s\S]*?(<\/ref>|\/>)/g, "")
      .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1")
      .replace(/''/g, "")
      .trim();
    const url = /\|\s*url\s*=\s*(https?:\/\/[^\s|}]+)/.exec(publisherCell!.text)?.[1];
    const refDate = /\|\s*date\s*=\s*([^|}]+)/.exec(publisherCell!.text)?.[1];

    const seats: PollInput["seats"] = {};
    let column = 0;
    for (const cell of seatCells) {
      if (column >= SEAT_COLUMNS.length) break;
      const key = SEAT_COLUMNS[column]!;
      const value = parseSeatCell(cell.text);
      if (value) seats[key] = value;
      // Header columns spanned by one cell (RZP-Zehut, Reservists-NEP) are one party here.
      column += 1;
    }

    const sampleSize = Number(sample!.text.replace(/[^\d]/g, ""));
    rows.push({
      fieldworkStart: fieldwork[0],
      fieldworkEnd: fieldwork[1],
      pollster,
      publisher,
      ...(sampleSize > 0 ? { sampleSize } : {}),
      ...(url ? { sourceUrl: url } : {}),
      ...(refDate && parseRefDate(refDate) ? { sourceDate: parseRefDate(refDate)! } : {}),
      seats,
    });
  }
  return rows;
}

const ascii = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** An ASCII key in the style of the hand-entered ones, e.g. "direct-polls-i24-news-2026-09-24". */
export function wikiPollKey(row: WikiPollRow, publishedAt: string): string {
  return `${ascii(row.pollster)}-${ascii(row.publisher)}-${publishedAt}`;
}

const host = (url: string) => new URL(url).hostname.replace(/^www\./, "");

/** A URL without its query string or trailing slash, for spotting a poll already entered. */
export const sameArticle = (url: string) => {
  const u = new URL(url);
  return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}`;
};

/** Whether the row cites the publisher's own article. */
export function isPrimarySource(row: WikiPollRow): boolean {
  if (VIDEO_ONLY.has(row.publisher)) return false;
  const publisher = PUBLISHERS[row.publisher];
  if (!publisher || !row.sourceUrl) return false;
  const h = host(row.sourceUrl);
  return publisher.domains.some((d) => h === d || h.endsWith(`.${d}`));
}

export function toPollInput(row: WikiPollRow): PollInput {
  const publishedAt = row.sourceDate && row.sourceDate >= row.fieldworkEnd ? row.sourceDate : row.fieldworkEnd;
  return {
    pollster: POLLSTERS[row.pollster] ?? row.pollster,
    publisher: PUBLISHERS[row.publisher]?.nameHe ?? row.publisher,
    publishedAt,
    sourceUrl: row.sourceUrl ?? "",
    fieldworkStart: row.fieldworkStart,
    fieldworkEnd: row.fieldworkEnd,
    ...(row.sampleSize ? { sampleSize: row.sampleSize } : {}),
    seats: row.seats,
  };
}

function readWikitext(path: string): string {
  const raw = readFileSync(path, "utf8");
  try {
    const json = JSON.parse(raw) as { parse?: { wikitext?: string | { "*": string } } };
    const w = json.parse?.wikitext;
    if (typeof w === "string") return w;
    if (w && typeof w === "object") return w["*"];
  } catch {
    // not JSON: plain wikitext
  }
  return raw;
}

function main(): void {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) throw new Error("usage: polls-wiki.ts <api-response.json | wikitext> [--write]");
  const write = args.includes("--write");

  const bundle = loadManualBundle(MANUAL_DIR);
  const knownUrls = new Set(bundle.polls.map((p) => sameArticle(p.sourceUrl)));
  const knownDates = new Set(bundle.polls.map((p) => `${p.publisher}:${p.fieldworkEnd ?? p.publishedAt}`));
  const latest = bundle.polls.map((p) => p.publishedAt).sort().at(-1) ?? "0000-00-00";
  const context = {
    partyKeys: new Set(bundle.parties.map((p) => p.key)),
    totalSeats: bundle.election.totalSeats,
    existingKeys: new Set(bundle.polls.map((p) => p.key)),
    today: new Date().toISOString().slice(0, 10),
  };

  const checks = JSON.parse(readFileSync(join(ROOT, "data", "review", "poll_checks.json"), "utf8")) as PollCheck[];
  const checkFor = (row: WikiPollRow) => checks.find((c) => c.publisher === row.publisher && c.fieldworkEnd === row.fieldworkEnd);

  const ready: (PollInput & { key: string })[] = [];
  const review: { row: WikiPollRow; reason: string }[] = [];
  for (const parsed of parseWikiPolls(readWikitext(file))) {
    if (parsed.fieldworkEnd < latest) continue;
    const check = checkFor(parsed);
    // A recorded check may name the publisher's own article where Wikipedia cites a report.
    // The cited report's date no longer applies once the source is the publisher's article.
    const row: WikiPollRow = check
      ? { ...parsed, sourceUrl: check.sourceUrl, ...(check.publishedAt ? { sourceDate: check.publishedAt } : {}) }
      : parsed;
    if (check && !check.publishedAt && check.sourceUrl !== parsed.sourceUrl) delete row.sourceDate;
    if (row.sourceUrl && knownUrls.has(sameArticle(row.sourceUrl))) continue;
    if (knownDates.has(`${PUBLISHERS[row.publisher]?.nameHe ?? row.publisher}:${row.fieldworkEnd}`)) continue;
    if (!isPrimarySource(row)) {
      const reason = VIDEO_ONLY.has(row.publisher)
        ? "cited to a broadcast, not an article; figures cannot be checked against text"
        : row.sourceUrl ? `cited to ${host(row.sourceUrl)}, not ${row.publisher}'s own article` : "no source URL";
      review.push({ row, reason });
      continue;
    }
    if (!check) {
      review.push({ row, reason: "not yet checked against the article (data/review/poll_checks.json)" });
      continue;
    }
    const input = toPollInput(row);
    const problems = checkPoll(input, context);
    if (problems.length) {
      review.push({ row, reason: problems.join("; ") });
      continue;
    }
    const key = wikiPollKey(row, input.publishedAt);
    if (context.existingKeys.has(key)) continue;
    context.existingKeys.add(key);
    ready.push({ ...input, key });
  }

  console.log(stableJson({ ready, review }));
  if (write && ready.length) {
    const path = join(MANUAL_DIR, "polls.json");
    const polls = JSON.parse(readFileSync(path, "utf8")) as unknown[];
    polls.push(...ready.map(({ key, ...input }) => ({ ...toManualPoll(input), key })));
    writeFileSync(path, stableJson(polls), "utf8");
    console.error(`polls-wiki: wrote ${ready.length} poll(s); review ${review.length}. Now: npm run ingest && npm run validate`);
  }
}

if (process.argv[1]?.endsWith("polls-wiki.ts")) {
  try {
    main();
  } catch (error) {
    console.error(`polls-wiki: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
