/**
 * Visual order for one line of right-to-left text, for renderers without bidi support.
 *
 * Satori (behind next/og's ImageResponse) lays every string out left to right, so Hebrew
 * comes out reversed. This returns the line as it should appear on screen, read left to
 * right: the order of units is reversed, Latin words and numbers (including ranges such as
 * "18–32" and "6.5%") stay intact as left-to-right units, and brackets are mirrored.
 * Single lines only; callers truncate before converting.
 */
const LTR_RUN = /[0-9](?:[0-9.,:%/–\-]*[0-9%])?|[A-Za-z][A-Za-z.'-]*(?: [A-Za-z][A-Za-z.'-]*)*/g;
const MIRROR: Record<string, string> = { "(": ")", ")": "(", "[": "]", "]": "[", "<": ">", ">": "<", "«": "»", "»": "«" };

export function visualRtl(text: string): string {
  const units: string[] = [];
  let last = 0;
  for (const m of text.matchAll(LTR_RUN)) {
    for (const ch of text.slice(last, m.index)) units.push(MIRROR[ch] ?? ch);
    units.push(m[0]);
    last = (m.index ?? 0) + m[0].length;
  }
  for (const ch of text.slice(last)) units.push(MIRROR[ch] ?? ch);
  return units.reverse().join("");
}

/** Cut to at most `max` characters on a word boundary, with an ellipsis. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trim()}…`;
}
