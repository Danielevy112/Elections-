"use client";

/** A changed list must update the comparison, not merely the control above stale results. */
export function PartyPicker({
  name,
  value,
  parties,
  color,
}: {
  name: "a" | "b";
  value: string;
  parties: { slug: string; nameHe: string }[];
  color: string;
}) {
  return (
    <select
      name={name}
      aria-label={name === "a" ? "רשימה ראשונה להשוואה" : "רשימה שנייה להשוואה"}
      defaultValue={value}
      onChange={(event) => event.currentTarget.form?.requestSubmit()}
      className={`w-full min-w-0 rounded-xl border-b-2 bg-ink-row px-2 py-2 text-[13px] font-semibold text-fg ${color}`}
    >
      {parties.map((party) => (
        <option key={party.slug} value={party.slug}>
          {party.nameHe}
        </option>
      ))}
    </select>
  );
}
