import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { truncate, visualRtl } from "./bidi";

/**
 * Shared pieces of the link-preview cards (opengraph-image routes). Rendered by Satori,
 * which has no right-to-left layout: every string goes through visualRtl, and rows are
 * laid out with row-reverse so the first item sits on the right.
 */
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

export const C = {
  page: "#000000",
  card: "rgb(21,30,35)",
  row: "rgb(9,17,20)",
  line: "rgb(34,44,50)",
  fg: "#ffffff",
  muted: "rgb(138,150,156)",
  dim: "rgb(93,104,110)",
  accent: "#2094fb",
  safe: "#3ddc84",
  edge: "#f5b83d",
  out: "#3a454b",
  warn: "rgb(251,191,36)",
};

export const BAND_COLOR = { safe: C.safe, borderline: C.edge, out: C.out } as const;
export const BAND_TEXT = { safe: "צפוי להיכנס", borderline: "על הגבול", out: "כרגע מחוץ לכנסת" } as const;

// Heebo (SIL OFL 1.1, assets/fonts/OFL.txt). Hebrew and Latin subsets are registered under
// different names because Satori uses only the first font of a given name for a weight.
let fonts: Promise<{ name: string; data: Buffer; weight: 400 | 700 | 800; style: "normal" }[]> | undefined;
export function ogFonts() {
  fonts ??= Promise.all(
    ([400, 700, 800] as const).flatMap((weight) =>
      (["hebrew", "latin"] as const).map(async (subset) => ({
        name: subset === "hebrew" ? "Heebo" : "HeeboLatin",
        data: await readFile(join(process.cwd(), "assets", "fonts", `heebo-${subset}-${weight}-normal.woff`)),
        weight,
        style: "normal" as const,
      })),
    ),
  );
  return fonts;
}

/** One right-aligned line of Hebrew, truncated to `max` characters. */
export function Line({
  text,
  size,
  color = C.fg,
  weight = 700,
  max = 60,
}: {
  text: string;
  size: number;
  color?: string;
  weight?: 400 | 700 | 800;
  max?: number;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", fontSize: size, color, fontWeight: weight, lineHeight: 1.25 }}>
      {visualRtl(truncate(text, max))}
    </div>
  );
}

/** Card frame: site name, a "preliminary" badge while the data is not final, footer line. */
export function Frame({ children, preliminary, footer }: { children: React.ReactNode; preliminary: boolean; footer: string }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: C.page,
        color: C.fg,
        fontFamily: "Heebo, HeeboLatin",
        padding: "44px 56px",
      }}
    >
      <div style={{ display: "flex", flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }}>
        <Line text="בחירות 2026 · הכנסת ה-26" size={30} weight={800} />
        {preliminary ? (
          <div style={{ display: "flex", border: `2px solid ${C.warn}`, color: C.warn, borderRadius: 999, padding: "4px 18px" }}>
            <Line text="נתונים מקדימים · טרם אושר סופית" size={22} color={C.warn} />
          </div>
        ) : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, marginTop: 28 }}>{children}</div>
      <Line text={footer} size={20} color={C.dim} weight={400} max={110} />
    </div>
  );
}

export function Dot({ color, size = 18 }: { color: string; size?: number }) {
  return <div style={{ width: size, height: size, borderRadius: size, background: color, flexShrink: 0 }} />;
}
