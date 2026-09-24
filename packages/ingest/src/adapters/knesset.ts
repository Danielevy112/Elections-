import type { Fetcher } from "../http";
import { parseODataDate } from "../http";
import { FieldReport, idFilterChunks, odataCollect, pickInt, pickString, type Row } from "../odata";
import { normalizeHebrewName } from "../match";

/**
 * Adapter for the Knesset's OData service — the source of record for everything that
 * happened inside the Knesset: who served, in which faction, on which committee, and
 * which bills they put their name to.
 *
 * The exact field casing of this service could not be confirmed from the build
 * environment (its host is unreachable there), so every read goes through `pick` with the
 * plausible spellings and a `FieldReport` that surfaces what upstream really sent. The
 * first live sync is the confirmation step; its recorded fixtures then pin the shape.
 */
export interface KnessetPerson {
  knessetPersonId: number;
  nameHe: string;
  /** "last first" — the order the Elections Committee lists candidates in. */
  nameHeReversed?: string;
  gender: "male" | "female" | "unknown";
  photoUrl: string | undefined;
}

export interface KnessetPosition {
  knessetPersonId: number;
  knessetNumber: number;
  factionId: number | undefined;
  factionNameHe: string | undefined;
  startDate: string | undefined;
  endDate: string | undefined;
}

export interface KnessetCommittee {
  knessetCommitteeId: number;
  nameHe: string;
  knessetNumber: number | undefined;
}

export interface KnessetBill {
  knessetBillId: number;
  nameHe: string;
  knessetNumber: number | undefined;
  /** KNS_Bill.StatusID — a numeric code; the text lives in the KNS_Status lookup. */
  statusId: number | undefined;
  /** Resolved from KNS_Status when that lookup is available. */
  statusRawHe: string | undefined;
  /** "ממשלתית" / "פרטית" — whether the bill is a government or private member's bill. */
  billTypeHe: string | undefined;
}

export interface KnessetBillInitiator {
  knessetBillId: number;
  knessetPersonId: number;
  isPrimary: boolean;
}

/** KNS_Status lookup row: the text behind KNS_Bill.StatusID. */
export interface KnessetStatus {
  statusId: number;
  descHe: string;
}

export interface KnessetPull {
  persons: KnessetPerson[];
  positions: KnessetPosition[];
  committees: KnessetCommittee[];
  bills: KnessetBill[];
  billInitiators: KnessetBillInitiator[];
  report: FieldReport;
}

function readGender(row: Row, report: FieldReport): "male" | "female" | "unknown" {
  const raw = pickString(row, ["GenderDesc", "GenderID", "Gender"], report);
  if (!raw) return "unknown";
  if (raw.includes("זכר") || raw === "251") return "male";
  if (raw.includes("נקבה") || raw === "250") return "female";
  return "unknown";
}

export async function pullKnesset(
  fetcher: Fetcher,
  options: {
    knessetNumbers: number[];
    billLimit?: number;
    /**
     * Names of the people whose legislative record we actually need — the candidates on
     * the lists. Bills and initiators are fetched by filtering server-side on the Knesset
     * persons these resolve to, instead of pulling those entity sets whole.
     *
     * Matching here only narrows a query, so a loose hit costs a few extra rows and
     * nothing else; the authoritative person matching still happens in build.ts.
     */
    candidateNames?: string[];
  },
): Promise<KnessetPull> {
  const report = new FieldReport();
  const knessetFilter = options.knessetNumbers
    .map((n) => `KnessetNum eq ${n}`)
    .join(" or ");

  const personRows = await odataCollect(fetcher, "KNS_Person", { hardLimit: 20_000 });
  const persons: KnessetPerson[] = [];
  for (const row of personRows) {
    const id = pickInt(row, ["PersonID", "personID", "PersonId", "Id"], report);
    const first = pickString(row, ["FirstName", "firstName"], report);
    const last = pickString(row, ["LastName", "lastName"], report);
    const nameHe = [first, last].filter(Boolean).join(" ").trim();
    if (id === undefined || nameHe.length === 0) continue;
    persons.push({
      knessetPersonId: id,
      nameHe,
      ...(first && last ? { nameHeReversed: `${last} ${first}` } : {}),
      gender: readGender(row, report),
      photoUrl: pickString(row, ["PersonImagePath", "ImagePath", "PhotoUrl"], report),
    });
  }

  const positionRows = await odataCollect(fetcher, "KNS_PersonToPosition", {
    filter: knessetFilter,
    hardLimit: 30_000,
  });
  const positions: KnessetPosition[] = [];
  for (const row of positionRows) {
    const personId = pickInt(row, ["PersonID", "personID", "PersonId"], report);
    const knessetNumber = pickInt(row, ["KnessetNum", "knessetNum", "KnessetNumber"], report);
    if (personId === undefined || knessetNumber === undefined) continue;
    positions.push({
      knessetPersonId: personId,
      knessetNumber,
      factionId: pickInt(row, ["FactionID", "factionID", "FactionId"], report),
      factionNameHe: pickString(row, ["FactionName", "factionName"], report),
      startDate: parseODataDate(pickString(row, ["StartDate", "startDate"], report)),
      endDate: parseODataDate(pickString(row, ["FinishDate", "EndDate", "finishDate"], report)),
    });
  }

  const committeeRows = await odataCollect(fetcher, "KNS_Committee", {
    filter: knessetFilter,
    hardLimit: 5_000,
  });
  const committees: KnessetCommittee[] = [];
  for (const row of committeeRows) {
    const id = pickInt(row, ["CommitteeID", "committeeID", "CommitteeId"], report);
    const nameHe = pickString(row, ["Name", "CommitteeName", "name"], report);
    if (id === undefined || !nameHe) continue;
    committees.push({
      knessetCommitteeId: id,
      nameHe,
      knessetNumber: pickInt(row, ["KnessetNum", "knessetNum"], report),
    });
  }

  // Bills and initiators are the two entity sets that run to hundreds of thousands of
  // rows. Rather than pull them whole and discard almost everything, push the join to the
  // service: initiators for the people we track, then only the bills those rows name.
  const wantedNames = new Set((options.candidateNames ?? []).map(normalizeHebrewName));
  const tracked = persons
    .filter(
      (person) =>
        wantedNames.has(normalizeHebrewName(person.nameHe)) ||
        (person.nameHeReversed !== undefined &&
          wantedNames.has(normalizeHebrewName(person.nameHeReversed))),
    )
    .map((person) => person.knessetPersonId);

  if (wantedNames.size > 0 && tracked.length === 0) {
    // Worth saying out loud: it means no candidate on any list has ever sat in the
    // Knesset, which is possible with example data and very unlikely with real lists.
    report.miss("__matched_candidates__");
  }
  const billInitiators: KnessetBillInitiator[] = [];
  const wantedBillIds = new Set<number>();

  for (const filter of idFilterChunks("PersonID", tracked)) {
    const rows = await odataCollect(fetcher, "KNS_BillInitiator", {
      filter,
      hardLimit: 50_000,
    });
    for (const row of rows) {
      const billId = pickInt(row, ["BillID", "billID", "BillId"], report);
      const personId = pickInt(row, ["PersonID", "personID", "PersonId"], report);
      if (billId === undefined || personId === undefined) continue;

      // IsInitiator marks a real initiator rather than another kind of signatory;
      // Ordinal is the position in the signature list, so first place is the lead.
      const isInitiator = row.IsInitiator;
      if (isInitiator === false) continue;
      report.hit("IsInitiator", "IsInitiator");

      wantedBillIds.add(billId);
      billInitiators.push({
        knessetBillId: billId,
        knessetPersonId: personId,
        isPrimary: pickInt(row, ["Ordinal", "ordinal"], report) === 1,
      });
    }
  }

  const bills: KnessetBill[] = [];
  const billLimit = options.billLimit ?? 40_000;
  for (const filter of idFilterChunks("BillID", [...wantedBillIds])) {
    const rows = await odataCollect(fetcher, "KNS_Bill", { filter, hardLimit: billLimit });
    for (const row of rows) {
      const id = pickInt(row, ["BillID", "billID", "BillId"], report);
      const nameHe = pickString(row, ["Name", "BillName", "name"], report);
      if (id === undefined || !nameHe) continue;
      bills.push({
        knessetBillId: id,
        nameHe,
        knessetNumber: pickInt(row, ["KnessetNum", "knessetNum"], report),
        statusId: pickInt(row, ["StatusID", "statusID"], report),
        statusRawHe: undefined,
        billTypeHe: pickString(row, ["SubTypeDesc", "subTypeDesc"], report),
      });
    }
  }

  // Resolve the numeric StatusID against the lookup table. Without this a bill's status is
  // unknown, which is the correct answer: KNS_Bill carries no status text of its own, and
  // an earlier version of this adapter read SubTypeDesc ("ממשלתית"/"פרטית") as though it
  // were a status, turning a bill's type into a confident claim about it becoming law.
  const statuses = await pullStatuses(fetcher, report);
  for (const bill of bills) {
    if (bill.statusId !== undefined) bill.statusRawHe = statuses.get(bill.statusId);
  }

  return { persons, positions, committees, bills, billInitiators, report };
}

/** Map KNS_Bill.SubTypeDesc ("ממשלתית" / "פרטית" / "ועדה") onto our enum. */
export function mapBillType(raw: string | undefined): string {
  if (!raw) return "unknown";
  if (/ממשלתית/.test(raw)) return "government";
  if (/פרטית/.test(raw)) return "private";
  if (/ועדה|ועדת/.test(raw)) return "committee";
  return "unknown";
}

/**
 * Read the KNS_Status lookup. Failure is not fatal: bills then keep a numeric statusId and
 * a status of `unknown`, which is honest, where guessing from another field is not.
 */
export async function pullStatuses(
  fetcher: Fetcher,
  report: FieldReport,
): Promise<Map<number, string>> {
  const statuses = new Map<number, string>();
  try {
    for (const row of await odataCollect(fetcher, "KNS_Status", { hardLimit: 5_000 })) {
      const id = pickInt(row, ["StatusID", "statusID"], report);
      const desc = pickString(row, ["Desc", "StatusDesc", "Name", "TypeDesc"], report);
      if (id !== undefined && desc) statuses.set(id, desc);
    }
  } catch {
    // Entity set absent or unreachable — leave the map empty.
  }
  return statuses;
}

/**
 * Map the Knesset's free-text bill status onto our enum. Anything unrecognised stays
 * `unknown` and keeps its raw text, so a status we mis-read is visible rather than
 * quietly counted as a passed law.
 */
export function mapBillStatus(raw: string | undefined): string {
  if (!raw) return "unknown";
  const text = raw.trim();
  if (/התקבל|אושר.*קריאה שלישית|חוק/.test(text)) return "passed";
  if (/קריאה שלישית|קריאה שנייה/.test(text)) return "second_third_reading";
  if (/ועדה/.test(text)) return "committee";
  if (/קריאה ראשונה/.test(text)) return "first_reading";
  if (/טרומית/.test(text)) return "preliminary";
  if (/נדחה|לא אושר/.test(text)) return "rejected";
  if (/הוסר|הוסרה|משיכה/.test(text)) return "withdrawn";
  if (/הוקפא/.test(text)) return "frozen";
  if (/הונח|הוגש/.test(text)) return "proposed";
  return "unknown";
}
