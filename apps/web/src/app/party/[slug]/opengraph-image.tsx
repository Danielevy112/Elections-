import { ImageResponse } from "next/og";
import { BAND_COLOR, BAND_TEXT, C, Dot, Frame, Line, OG_CONTENT_TYPE, OG_SIZE, ogFonts } from "@/lib/og";
import { displayName } from "@/lib/extras";
import { formatDate, formatSeats, site } from "@/lib/site";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "הרשימה, התחזית וקו הכניסה";
export const revalidate = 3600;

/** List card: projected seats and range, then the first names coloured by seat band. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await site();
  const view = data.parties.find((v) => v.party.slug === slug);
  if (!view) return new Response("not found", { status: 404 });
  const p = view.projection;
  const shown = view.candidates.slice(0, Math.min(12, Math.max(6, (p?.borderlineThrough ?? 0) + 2)));
  const half = Math.ceil(shown.length / 2);
  const columns = [shown.slice(0, half), shown.slice(half)];
  const summary = !p
    ? "אין עדיין סקרים שמודדים את הרשימה"
    : !p.qualifies
      ? `מתחת לאחוז החסימה בממוצע הסקרים · ${p.pollCount} סקרים`
      : `${formatSeats(p.projectedSeats)} מנדטים בממוצע · טווח ${p.min}–${p.max} ב-${p.pollCount} סקרים`;

  return new ImageResponse(
    (
      <Frame
        preliminary={data.snapshot.meta.dataset !== "real"}
        footer={`רשימה כפי שהוגשה · סקר אחרון ${data.projection.latestPollDate ? formatDate(data.projection.latestPollDate) : "—"}`}
      >
        <Line text={view.party.nameHe} size={50} weight={800} max={38} />
        <Line text={summary} size={30} color={C.muted} weight={400} />
        <div style={{ display: "flex", flexDirection: "row-reverse", gap: 36, marginTop: 22 }}>
          {columns.map((col, c) => (
            <div key={c} style={{ display: "flex", flexDirection: "column", flex: 1, gap: 8 }}>
              {col.map((row) => (
                <div key={row.candidacy.id} style={{ display: "flex", flexDirection: "row-reverse", alignItems: "center", gap: 14 }}>
                  <div style={{ display: "flex", width: 40, justifyContent: "flex-end", fontSize: 24, color: C.dim }}>{row.candidacy.position}</div>
                  <Dot color={BAND_COLOR[row.band]} />
                  <Line text={displayName(row.person.nameHe, view.party.id, row.candidacy.position)} size={27} max={26} />
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "row-reverse", gap: 26, marginTop: 18 }}>
          {(["safe", "borderline", "out"] as const).map((b) => (
            <div key={b} style={{ display: "flex", flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
              <Dot color={BAND_COLOR[b]} size={12} />
              <Line text={BAND_TEXT[b]} size={20} color={C.muted} weight={400} />
            </div>
          ))}
        </div>
      </Frame>
    ),
    { ...size, fonts: await ogFonts() },
  );
}
