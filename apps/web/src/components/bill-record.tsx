import { knessetBillSourceUrl, type BillRecord, type BillRecordItem } from "@elections26/data";
import { Card, SourceLink } from "@/components/ui";

/**
 * "What they did in the Knesset": the actual bills behind the counts, each linked to the
 * Knesset's own record of it. Statuses are printed as the Knesset words them, verbatim.
 */
export function BillRecordSection({ record, sourceHref }: { record: BillRecord; sourceHref: string }) {
  const { counts } = record;
  if (counts.initiated === 0) return null;
  return (
    <Card className="overflow-hidden" id="record">
      <div className="px-4 pb-2 pt-4">
        <h2 className="text-sm font-bold">מה עשה/תה בכנסת</h2>
        <p className="mt-1 text-[12px] leading-5 text-ink-muted">
          יזם/ה <span className="tabular font-semibold text-fg">{counts.initiated}</span> הצעות חוק, מהן{" "}
          <span className="tabular font-semibold text-fg">{counts.lead}</span> כיוזם/ת ראשי/ת (
          <span className="tabular">{counts.privateLead}</span> פרטיות). <span className="tabular font-semibold text-fg">{counts.passed}</span>{" "}
          עברו בקריאה שלישית.
        </p>
      </div>

      {record.passed.length > 0 ? (
        <BillList
          title="חוקים שעברו"
          items={record.passed}
          total={counts.passed}
        />
      ) : null}

      {record.recentLead.length > 0 ? (
        <BillList title="הצעות חוק פרטיות אחרונות שיזם/ה כיוזם/ת ראשי/ת" items={record.recentLead} total={counts.privateLead} showStatus />
      ) : null}

      <div className="px-4 pb-3 pt-2">
        <SourceLink href={sourceHref}>מקור: המאגר הפרלמנטרי של הכנסת (כל הצעות החוק)</SourceLink>
      </div>
    </Card>
  );
}

const SHOWN = 10;

function row(bill: BillRecordItem, i: number, showStatus: boolean) {
  return (
    <li key={bill.knessetBillId ?? i} className="flex items-start justify-between gap-3 px-4 py-2">
      <span className="min-w-0">
        <span className="block text-[13px] leading-5">{bill.nameHe}</span>
        <span className="block text-[11px] text-ink-dim">
          {bill.knessetNumber ? `הכנסת ה-${bill.knessetNumber}` : null}
          {showStatus && bill.statusRawHe ? ` · ${bill.statusRawHe}` : null}
          {!bill.isPrimary ? " · יוזם/ת שותף/ה" : null}
        </span>
      </span>
      {bill.knessetBillId ? (
        <span className="shrink-0 pt-0.5">
          <SourceLink href={knessetBillSourceUrl(bill.knessetBillId)}>רשומה</SourceLink>
        </span>
      ) : null}
    </li>
  );
}

function BillList({ title, items, total, showStatus = false }: { title: string; items: BillRecordItem[]; total: number; showStatus?: boolean }) {
  const toRow = (bill: BillRecordItem, i: number) => row(bill, i, showStatus);
  return (
    <div className="border-t border-ink-line/60">
      <h3 className="px-4 pb-1 pt-3 text-[12px] font-semibold text-ink-muted">
        {title}
        {total > items.length ? <span className="font-normal text-ink-dim"> · {items.length} האחרונים מתוך {total}</span> : null}
      </h3>
      <ol>{items.slice(0, SHOWN).map(toRow)}</ol>
      {items.length > SHOWN ? (
        <details className="group">
          <summary className="cursor-pointer list-none px-4 py-2 text-[12px] text-accent group-open:hidden">
            עוד {items.length - SHOWN}
          </summary>
          <ol>{items.slice(SHOWN).map((b, i) => toRow(b, i + SHOWN))}</ol>
        </details>
      ) : null}
    </div>
  );
}
