"""Fetch Knesset records (terms, roles, bills, questions) for candidates on the filed lists.

Exact name match only (both "first last" and "last first"); a name that matches two
Knesset people is skipped. Output: data/manual_overrides/knesset_profiles.json
"""
import json, re, sys, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime

B = "https://knesset.gov.il/OdataV4/ParliamentInfo"
MK = {43, 61}
ROLE = {45: "ראש הממשלה", 73: "ראש הממשלה החילופי", 51: 'מ"מ ראש הממשלה', 50: "סגן ראש הממשלה", 65: "סגנית ראש הממשלה",
        31: "משנה לראש הממשלה", 39: "שר", 57: "שרה", 40: "סגן שר", 59: "סגנית שר", 285079: "סגן שר",
        122: "יושב ראש הכנסת", 123: "יושבת ראש הכנסת", 70: "סגן יושב ראש הכנסת", 71: "סגנית יושב ראש הכנסת",
        131: "ראש האופוזיציה", 130: "ראשת האופוזיציה", 41: 'יו"ר ועדה', 30: "יושב ראש הקואליציה", 29: "יושבת ראש הקואליציה", 48: 'יו"ר סיעה'}

def get(url, tries=7):
    for i in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=90) as r:
                return json.load(r)
        except Exception as e:
            if i == tries - 1: raise
            time.sleep(3 * (i + 1) ** 2)

def all_rows(path):
    url = f"{B}/{path}"; rows = []
    while url:
        d = get(url); rows += d["value"]; url = d.get("@odata.nextLink")
    return rows

def norm(s):
    s = s.replace("״", '"').replace("׳", "'").replace("–", "-")
    return re.sub(r"\s+", " ", s).strip()

def day(s): return datetime.fromisoformat(s[:10]).date() if s else None

RAW = {}

def main(root):
    lists = json.load(open(f"{root}/data/manual_overrides/lists.json", encoding="utf8"))
    wanted = {norm(c["nameHe"]) for l in lists for c in l["candidates"]}
    persons = RAW["persons"] if RAW else all_rows("KNS_Person?$select=Id,FirstName,LastName")
    names = {p["Id"]: f'{norm(p["FirstName"] or "")} {norm(p["LastName"] or "")}'.strip() for p in persons}
    forms = {}
    for p in persons:
        f, l = norm(p["FirstName"] or ""), norm(p["LastName"] or "")
        if not f or not l: continue
        for form in {f"{l} {f}", f"{f} {l}"}:
            forms.setdefault(form, set()).add(p["Id"])
    matched, ambiguous = {}, {}
    for name in wanted:
        ids = forms.get(name, set())
        if len(ids) == 1: matched[name] = next(iter(ids))
        elif len(ids) > 1: ambiguous[name] = sorted(ids)
    # Reviewed manual links (data/manual_overrides/knesset_links.json) for filed legal names
    # that differ from the Knesset's form, e.g. an extra middle name. Never generated here.
    linked = {}
    try:
        for l in json.load(open(f"{root}/data/manual_overrides/knesset_links.json", encoding="utf8"))["links"]:
            n = norm(l["nameHe"])
            if n in wanted and n not in matched:
                matched[n] = l["knessetPersonId"]; linked[n] = l["reason"]; ambiguous.pop(n, None)
    except FileNotFoundError:
        pass
    print("persons", len(persons), "matched names", len(matched), "linked", len(linked), "ambiguous", len(ambiguous), file=sys.stderr)

    def profile(pid):
        try:
            return _profile(pid)
        except Exception as e:
            print("FAILED", pid, e, file=sys.stderr)
            return None

    def _profile(pid):
        if RAW:
            raw = RAW["people"].get(str(pid))
            if raw is None: return None
            pos = raw["pos"]
        else:
            pos = all_rows(f"KNS_PersonToPosition?$filter=PersonID eq {pid}".replace(" ", "%20"))
        mk = [r for r in pos if r["PositionID"] in MK]
        if not mk: return None
        today = date.today()
        spans = sorted((day(r["StartDate"]), day(r["FinishDate"]) or today) for r in mk if r["StartDate"])
        merged = []
        for s, e in spans:
            if merged and s <= merged[-1][1]: merged[-1][1] = max(merged[-1][1], e)
            else: merged.append([s, e])
        days = sum((e - s).days for s, e in merged)
        roles = []
        for r in pos:
            if r["PositionID"] in ROLE:
                what = r.get("GovMinistryName") or r.get("CommitteeName") or r.get("DutyDesc") or r.get("FactionName")
                roles.append({"title": ROLE[r["PositionID"]], "of": what, "knesset": r["KnessetNum"],
                              "start": (r["StartDate"] or "")[:10] or None, "end": (r["FinishDate"] or "")[:10] or None})
        # The Knesset records one row per government/Knesset term; merge back-to-back rows
        # of the same role (same title and ministry/committee) into one period.
        roles.sort(key=lambda x: x["start"] or "")
        merged_roles = []
        for r in roles:
            prev = next((m for m in reversed(merged_roles) if m["title"] == r["title"] and m["of"] == r["of"]), None)
            if prev and r["start"] and prev["end"] is not None and (day(r["start"]) - day(prev["end"])).days <= 45:
                prev["end"] = r["end"] if r["end"] is None or r["end"] > prev["end"] else prev["end"]
                if r["knesset"] not in prev["knessets"]: prev["knessets"].append(r["knesset"])
                prev["knesset"] = max(prev["knessets"])
            elif prev and r["start"] and prev["end"] is None:
                if r["knesset"] not in prev["knessets"]: prev["knessets"].append(r["knesset"])
                prev["knesset"] = max(prev["knessets"])
            else:
                merged_roles.append({**r, "knessets": [r["knesset"]]})
        roles = sorted(merged_roles, key=lambda x: x["start"] or "", reverse=True)
        if RAW:
            bills = {b["id"]: {"StatusID": b["s"]} for b in raw["bills"]}
        else:
          bi = all_rows(f"KNS_BillInitiator?$filter=PersonID eq {pid} and IsInitiator eq true&$select=BillID&$expand=KNS_Bill($select=StatusID,KnessetNum,SubTypeID)".replace(" ", "%20"))
          bills = {b["BillID"]: b.get("KNS_Bill") or {} for b in bi}
        passed = sum(1 for b in bills.values() if b.get("StatusID") == 118)
        if RAW:
            q = raw["q"]
        else:
          try:
            q = get(f"{B}/KNS_Query?$filter=PersonID%20eq%20{pid}&$count=true&$top=0")["@odata.count"]
          except Exception:
            q = None
        terms = sorted({r["KnessetNum"] for r in mk})
        factions = sorted({(r["KnessetNum"], r["FactionName"]) for r in pos if r.get("FactionName") and r["PositionID"] == 54}, reverse=True)
        return {"knessetPersonId": pid, "nameKnesset": names.get(pid), "knessetTerms": terms, "firstMkDate": merged[0][0].isoformat(),
                "yearsAsMk": round(days / 365.25, 1), "roles": roles,
                "factions": [{"knesset": k, "name": n} for k, n in factions],
                "billsInitiated": len(bills), "billsPassed": passed, "parliamentaryQuestions": q,
                "sources": {
                    "positions": f"{B}/KNS_PersonToPosition?$filter=PersonID%20eq%20{pid}",
                    "bills": f"{B}/KNS_BillInitiator?$filter=PersonID%20eq%20{pid}%20and%20IsInitiator%20eq%20true&$expand=KNS_Bill",
                    "questions": f"{B}/KNS_Query?$filter=PersonID%20eq%20{pid}",
                }}
    with ThreadPoolExecutor(2) as ex:
        res = dict(zip(matched, ex.map(lambda n: profile(matched[n]), matched)))
    out = {"retrievedAt": date.today().isoformat(), "source": B,
           "note": "Exact name match between the filed lists and KNS_Person; ambiguous names are left unmatched.",
           "profiles": {n: ({**p, "linkReason": linked[n]} if n in linked else p) for n, p in sorted(res.items()) if p}, "ambiguous": ambiguous}
    json.dump(out, open(f"{root}/data/manual_overrides/knesset_profiles.json", "w", encoding="utf8"), ensure_ascii=False, indent=1)
    print("profiles", len(out["profiles"]), file=sys.stderr)

if __name__ == "__main__":
    # Offline mode: python3 knesset_profiles.py ROOT persons.json people.json
    # (raw rows fetched elsewhere with the same queries; used when the Knesset blocks the host).
    if len(sys.argv) > 3:
        RAW["persons"] = json.load(open(sys.argv[2], encoding="utf8"))
        RAW["people"] = json.load(open(sys.argv[3], encoding="utf8"))
    main(sys.argv[1] if len(sys.argv) > 1 else ".")
