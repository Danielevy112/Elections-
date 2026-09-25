import { ImageResponse } from "next/og";
import { BAND_COLOR, BAND_TEXT, C, Frame, Line, OG_CONTENT_TYPE, OG_SIZE, ogFonts } from "@/lib/og";
import { visualRtl } from "@/lib/bidi";
import { displayName, initials, knessetProfile } from "@/lib/extras";
import { formatDate, formatSeats, site } from "@/lib/site";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "המועמד/ת, המקום ברשימה והסיכוי להיכנס";
export const revalidate = 3600;

/**
 * Candidate card: name, list and position, seat band. Knesset figures appear only from a
 * verified link (knessetProfile applies verifyKnessetLink). No photo: the party photos are
 * WebP, which the renderer can't read, and several carry licences that require a credit.
 */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await site();
  const view = data.candidates.find((c) => c.person.slug === slug);
  if (!view) return new Response("not found", { status: 404 });
  const { person, party, position, band } = view;
  const name = displayName(person.nameHe, party?.id, position);
  const profile = knessetProfile(person.nameHe);

  return new ImageResponse(
    (
      <Frame
        preliminary={data.snapshot.meta.dataset !== "real"}
        footer={`סקר אחרון ${data.projection.latestPollDate ? formatDate(data.projection.latestPollDate) : "—"} · נתוני כהונה מהמאגר הפרלמנטרי של הכנסת`}
      >
        <div style={{ display: "flex", flexDirection: "row-reverse", alignItems: "center", gap: 40, marginTop: 20 }}>
          <div
            style={{ display: "flex", width: 200, height: 200, borderRadius: 200, background: C.card, alignItems: "center", justifyContent: "center", fontSize: 76, fontWeight: 800, color: C.muted }}
          >
            {visualRtl(initials(name))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 8 }}>
            <Line text={name} size={64} weight={800} max={26} />
            {party && position ? <Line text={`מקום ${position} ב${party.shortNameHe ?? party.nameHe}`} size={32} color={C.muted} weight={400} max={50} /> : null}
            {band ? (
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                <div style={{ display: "flex", background: BAND_COLOR[band], color: band === "out" ? C.fg : "#000", borderRadius: 999, padding: "6px 22px" }}>
                  <Line text={BAND_TEXT[band]} size={28} color={band === "out" ? C.fg : "#000"} />
                </div>
              </div>
            ) : null}
          </div>
        </div>
        {profile ? (
          <div style={{ display: "flex", flexDirection: "row-reverse", gap: 20, marginTop: 40 }}>
            {[
              [formatSeats(profile.yearsAsMk), "שנים כחבר/ת כנסת"],
              [String(profile.knessetTerms.length), "כנסות"],
              [String(profile.billsPassed), "הצעות חוק שעברו"],
            ].map(([value, label]) => (
              <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flex: 1, background: C.card, borderRadius: 16, padding: "14px 22px" }}>
                <div style={{ display: "flex", fontSize: 44, fontWeight: 800 }}>{value}</div>
                <Line text={label!} size={22} color={C.muted} weight={400} />
              </div>
            ))}
          </div>
        ) : null}
      </Frame>
    ),
    { ...size, fonts: await ogFonts() },
  );
}
