import type { Fetcher } from "../http";
import { parseODataDate } from "../http";
import { FieldReport, odataCollect, pickInt, pickString, type Row } from "../odata";

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
  statusRawHe: string | undefined;
}

export interface KnessetBillInitiator {
  knessetBillId: number;
  knessetPersonId: number;
  isPrimary: boolean;
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
  options: { knessetNumbers: number[]; billLimit?: number },
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

  const billRows = await odataCollect(fetcher, "KNS_Bill", {
    filter: knessetFilter,
    hardLimit: options.billLimit ?? 40_000,
  });
  const bills: KnessetBill[] = [];
  const billIds = new Set<number>();
  for (const row of billRows) {
    const id = pickInt(row, ["BillID", "billID", "BillId"], report);
    const nameHe = pickString(row, ["Name", "BillName", "name"], report);
    if (id === undefined || !nameHe) continue;
    billIds.add(id);
    bills.push({
      knessetBillId: id,
      nameHe,
      knessetNumber: pickInt(row, ["KnessetNum", "knessetNum"], report),
      statusRawHe: pickString(row, ["StatusDesc", "SubTypeDesc", "StatusID"], report),
    });
  }

  const initiatorRows = await odataCollect(fetcher, "KNS_BillInitiator", {
    hardLimit: 200_000,
    pageSize: 5_000,
  });
  const billInitiators: KnessetBillInitiator[] = [];
  for (const row of initiatorRows) {
    const billId = pickInt(row, ["BillID", "billID", "BillId"], report);
    const personId = pickInt(row, ["PersonID", "personID", "PersonId"], report);
    if (billId === undefined || personId === undefined) continue;
    // Only keep initiators of bills we actually pulled, or the join explodes.
    if (!billIds.has(billId)) continue;
    const ordinal = pickInt(row, ["Ordinal", "IsInitiator", "ordinal"], report);
    billInitiators.push({
      knessetBillId: billId,
      knessetPersonId: personId,
      isPrimary: ordinal === 1,
    });
  }

  return { persons, positions, committees, bills, billInitiators, report };
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
