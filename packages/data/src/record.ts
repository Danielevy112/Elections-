import type { BillStatus, BillType, Snapshot } from "@elections26/schema";

/**
 * One candidate's legislative record, read per person rather than carried in the site-wide
 * data blob: the synced record runs to tens of thousands of bills, which a single cached
 * snapshot cannot hold. The database path (packages/db loadBillRecord) and the JSON
 * fallback below produce this same shape from the same definitions.
 */
export interface BillRecordItem {
  knessetBillId?: number;
  nameHe: string;
  knessetNumber?: number;
  status: BillStatus;
  statusRawHe?: string;
  billType: BillType;
  /** Lead initiator (first signature) rather than a co-initiator. */
  isPrimary: boolean;
}

export interface BillRecord {
  counts: {
    /** Bills the person initiated, as lead or co-initiator (IsInitiator true). */
    initiated: number;
    /** Of those, where the person is the lead initiator. */
    lead: number;
    /** Of those, bills that passed a third reading. */
    passed: number;
    /** Private member's bills the person led: their own initiative, not the cabinet's. */
    privateLead: number;
  };
  /** Laws that passed, newest Knesset first. */
  passed: BillRecordItem[];
  /** Private bills the person led, newest first, whatever their fate. */
  recentLead: BillRecordItem[];
}

export const RECORD_LIMITS = { passed: 60, recentLead: 12 } as const;

/** Collections served per person instead of inside the site-wide snapshot. */
export const RECORD_COLLECTIONS = ["bills", "bill_initiators"] as const;

export function newestFirst(a: BillRecordItem, b: BillRecordItem): number {
  return (b.knessetNumber ?? 0) - (a.knessetNumber ?? 0) || (b.knessetBillId ?? 0) - (a.knessetBillId ?? 0);
}

/** Build a record from one person's rows. The database path computes the same in SQL. */
export function billRecordFromItems(items: BillRecordItem[], limits = RECORD_LIMITS): BillRecord {
  const sorted = [...items].sort(newestFirst);
  const passed = sorted.filter((i) => i.status === "passed");
  const lead = sorted.filter((i) => i.isPrimary);
  const privateLead = lead.filter((i) => i.billType === "private");
  return {
    counts: { initiated: items.length, lead: lead.length, passed: passed.length, privateLead: privateLead.length },
    passed: passed.slice(0, limits.passed),
    recentLead: privateLead.slice(0, limits.recentLead),
  };
}

/** Index a full snapshot's bills by person, for the JSON fallback (no database). */
export function indexBillItems(snapshot: Pick<Snapshot, "bills" | "bill_initiators">): Map<string, BillRecordItem[]> {
  const bills = new Map(snapshot.bills.map((b) => [b.id, b]));
  const byPerson = new Map<string, BillRecordItem[]>();
  for (const initiation of snapshot.bill_initiators) {
    const bill = bills.get(initiation.billId);
    if (!bill) continue;
    const item: BillRecordItem = {
      ...(bill.knessetBillId !== undefined ? { knessetBillId: bill.knessetBillId } : {}),
      nameHe: bill.nameHe,
      ...(bill.knessetNumber !== undefined ? { knessetNumber: bill.knessetNumber } : {}),
      status: bill.status,
      ...(bill.statusRawHe !== undefined ? { statusRawHe: bill.statusRawHe } : {}),
      billType: bill.billType,
      isPrimary: initiation.isPrimary,
    };
    const bucket = byPerson.get(initiation.personId);
    if (bucket) bucket.push(item);
    else byPerson.set(initiation.personId, [item]);
  }
  return byPerson;
}

/** The Knesset's own record of one bill: the same OData query shape the pipeline pulled. */
export function knessetBillSourceUrl(knessetBillId: number): string {
  return `https://knesset.gov.il/Odata/ParliamentInfo.svc/KNS_Bill?$format=json&$filter=BillID%20eq%20${knessetBillId}`;
}
