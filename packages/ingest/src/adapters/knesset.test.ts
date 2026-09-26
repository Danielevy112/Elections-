import { describe, expect, it } from "vitest";
import { mapBillStatus, mapBillType } from "./knesset";

describe("mapBillType", () => {
  it("reads the real SubTypeDesc values the service sends", () => {
    expect(mapBillType("ממשלתית")).toBe("government");
    expect(mapBillType("פרטית")).toBe("private");
  });

  it("falls back to unknown rather than guessing", () => {
    expect(mapBillType(undefined)).toBe("unknown");
    expect(mapBillType("משהו אחר")).toBe("unknown");
  });
});

describe("mapBillStatus", () => {
  it("returns unknown when the Knesset supplied no status text", () => {
    // KNS_Bill carries only a numeric StatusID; if the KNS_Status lookup is unavailable
    // the honest answer is unknown, and unknown is never counted as a passed law.
    expect(mapBillStatus(undefined)).toBe("unknown");
    expect(mapBillStatus("")).toBe("unknown");
  });

  it("never reads a bill's type as its status", () => {
    // The bug this pins: SubTypeDesc was in the status alias list, so "ממשלתית" — a bill
    // being a government bill — was matched against status patterns.
    expect(mapBillStatus("ממשלתית")).not.toBe("passed");
    expect(mapBillStatus("פרטית")).not.toBe("passed");
  });

  it("maps status text onto the enum", () => {
    expect(mapBillStatus("התקבל בקריאה שלישית")).toBe("passed");
    expect(mapBillStatus("הונח על שולחן הכנסת")).toBe("proposed");
    expect(mapBillStatus("נדחה")).toBe("rejected");
    expect(mapBillStatus("בוועדה")).toBe("committee");
  });

  it("counts only a third reading as a law, never a merged bill", () => {
    // Every status text the synced bills actually carry (KNS_Status, recorded 24.9.2026).
    const real: [string, string][] = [
      ["התקבלה בקריאה שלישית", "passed"],
      ["מוזגה עם הצעת חוק אחרת", "merged"],
      ["הונחה על שולחן הכנסת לדיון מוקדם", "proposed"],
      ["במליאה לדיון מוקדם", "preliminary"],
      ["לדיון במליאה לקראת הקריאה הראשונה", "first_reading"],
      ["הכנה לקריאה ראשונה", "first_reading"],
      ["אושרה בוועדה לקריאה ראשונה", "committee"],
      ["הכנה לקריאה שנייה ושלישית", "second_third_reading"],
      ["לדיון במליאה לקראת קריאה שנייה-שלישית", "second_third_reading"],
      ["נעצרה", "unknown"],
      ["הוסבה להצעה לסדר היום", "unknown"],
    ];
    for (const [text, status] of real) expect([text, mapBillStatus(text)]).toEqual([text, status]);
  });

  it("leaves anything unrecognised as unknown", () => {
    expect(mapBillStatus("סטטוס שלא ראינו מעולם")).toBe("unknown");
  });
});
