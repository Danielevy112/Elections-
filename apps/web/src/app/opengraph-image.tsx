import { ImageResponse } from "next/og";
import { C, Dot, Frame, Line, OG_CONTENT_TYPE, OG_SIZE, ogFonts } from "@/lib/og";
import { formatDate, formatSeats, site } from "@/lib/site";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "ממוצע הסקרים לבחירות לכנסת ה-26";
export const revalidate = 3600;

/** Home card: the poll average, top ten lists. */
export default async function Image() {
  const data = await site();
  const { projection } = data;
  const rows = data.parties
    .filter((v) => v.projection?.qualifies)
    .sort((a, b) => (b.projection?.projectedSeats ?? 0) - (a.projection?.projectedSeats ?? 0))
    .slice(0, 10);
  const columns = [rows.slice(0, 5), rows.slice(5, 10)];

  return new ImageResponse(
    (
      <Frame
        preliminary={data.snapshot.meta.dataset !== "real"}
        footer={`ממוצע ${projection.polls.length} סקרים · אחרון ${projection.latestPollDate ? formatDate(projection.latestPollDate) : "—"} · כל נתון עם מקור`}
      >
        <Line text="מי נכנס לכנסת? ממוצע הסקרים" size={52} weight={800} />
        <div style={{ display: "flex", flexDirection: "row-reverse", gap: 40, marginTop: 20 }}>
          {columns.map((col, c) => (
            <div key={c} style={{ display: "flex", flexDirection: "column", flex: 1, gap: 8 }}>
              {col.map((v) => (
                <div
                  key={v.party.id}
                  style={{ display: "flex", flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", background: C.card, borderRadius: 14, padding: "7px 20px" }}
                >
                  <div style={{ display: "flex", flexDirection: "row-reverse", alignItems: "center", gap: 14 }}>
                    <Dot color={C.accent} size={12} />
                    <Line text={v.party.shortNameHe ?? v.party.nameHe} size={26} max={v.list?.status === "disqualified" ? 17 : 24} />
                    {/* A list the committee disqualified is still polled; the card must say so. */}
                    {v.list?.status === "disqualified" ? <Line text="נפסלה" size={20} color="rgb(251,113,133)" /> : null}
                  </div>
                  <div style={{ display: "flex", fontSize: 30, fontWeight: 800 }}>{formatSeats(v.projection!.projectedSeats)}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </Frame>
    ),
    { ...size, fonts: await ogFonts() },
  );
}
