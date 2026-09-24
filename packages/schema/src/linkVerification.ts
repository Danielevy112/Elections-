/**
 * When may a 2026 candidate be shown with a Knesset member's record?
 *
 * A name match alone ("same name, one person in the Knesset database") cannot tell a new
 * candidate from a former MK who happens to share the name. Measured on the real lists:
 * 38 of 167 name-linked candidates pointed at MKs whose last term was the 20th Knesset or
 * earlier, some as far back as the 4th (1959–61). Showing a 2026 newcomer with someone
 * else's 1960s bills is the exact failure this project exists to prevent.
 *
 * So a name match is trusted only for recent MKs. An older link needs a second,
 * independent source tying the Knesset record to this candidate; without one the link is
 * quarantined — not shown, and written to a review file for a person to check.
 *
 * One function, used by the site, the ingest pipeline and the build gate, so the three
 * can never disagree about who is linked.
 */

/** Oldest Knesset whose members are linked on an exact name match alone (2019 onward). */
export const AUTO_LINK_MIN_KNESSET = 21;

export interface LinkEvidence {
  /** Reason recorded on a reviewed manual link (knesset_links.json / person_links.json). */
  manualReason?: string | undefined;
  /**
   * Where a sourced bio for this exact list slot came from: a party's own page, or a
   * Wikipedia article admitted only when it ties the person to this list's 2026 run.
   */
  bioSourcePage?: string | undefined;
}

export type LinkVerdict =
  | { accepted: true; basis: "recent" | "manual" | "bio"; lastKnesset: number | undefined }
  | { accepted: false; lastKnesset: number | undefined; reason: string };

/**
 * @param lastKnesset The last Knesset the linked person served in, or undefined when the
 *   pulled record does not show them in any recent Knesset.
 */
export function verifyKnessetLink(lastKnesset: number | undefined, evidence: LinkEvidence = {}): LinkVerdict {
  if (lastKnesset !== undefined && lastKnesset >= AUTO_LINK_MIN_KNESSET) {
    return { accepted: true, basis: "recent", lastKnesset };
  }
  if (evidence.manualReason && evidence.manualReason.trim().length > 0) {
    return { accepted: true, basis: "manual", lastKnesset };
  }
  if (evidence.bioSourcePage && evidence.bioSourcePage.trim().length > 0) {
    return { accepted: true, basis: "bio", lastKnesset };
  }
  return {
    accepted: false,
    lastKnesset,
    reason:
      lastKnesset === undefined
        ? `אין כהונה מתועדת בכנסות האחרונות; התאמת שם בלבד, ללא מקור נוסף שמקשר למועמד/ת`
        : `כהונה אחרונה בכנסת ה-${lastKnesset}; התאמת שם בלבד, ללא מקור נוסף שמקשר למועמד/ת`,
  };
}
