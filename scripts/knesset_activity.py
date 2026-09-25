"""Parliamentary activity per Knesset term, 20th-25th Knesset (2015-2026), from Knesset OData.

Writes data/manual_overrides/knesset_activity.json, keyed by the filed name (same keys as
knesset_profiles.json, so nothing is matched here). For every term in KNESSETS the person
served in:
  votesHeld     plenum votes held on days the person was an MK
  votesPresent  of those, votes where the Knesset recorded them (for/against/abstain/present)
  agendaMotions, billsInitiated, billsPassed, questions
  committees    committee memberships (names), committeeChairs
Every figure carries the OData query it came from.
"""
import json, os, sys, time, urllib.request
from datetime import date, datetime
from concurrent.futures import ThreadPoolExecutor

B = "https://knesset.gov.il/OdataV4/ParliamentInfo"
KNESSETS = [20, 21, 22, 23, 24, 25]
# First plenum day of each Knesset (KNS_KnessetDates); a term runs until the next one starts.
STARTS = {20: date(2015, 3, 31), 21: date(2019, 4, 30), 22: date(2019, 10, 3), 23: date(2020, 3, 16),
          24: date(2021, 4, 6), 25: date(2022, 11, 15), 26: date(2026, 10, 27)}
K25_START = STARTS[20]
MK = {43, 61}
COMMITTEE_MEMBER = {42, 66}  # חבר/ת ועדה
COMMITTEE_CHAIR = {41}

def get(url, tries=6):
    for i in range(tries):
        try:
            with urllib.request.urlopen(url.replace(" ", "%20"), timeout=90) as r:
                return json.load(r)
        except Exception as e:
            print(f"RETRY {i+1}/{tries} {url[:150]}: {e}",file=sys.stderr,flush=True)
            if i == tries - 1: raise
            time.sleep(2 + 3 * i)

def rows(path, stop=None):
    url, out = f"{B}/{path}", []
    while url:
        d = get(url)
        out += d["value"]
        if stop and stop(d["value"]): break
        url = d.get("@odata.nextLink")
    return out

def count(path):
    return get(f"{B}/{path}&$count=true&$top=0")["@odata.count"]

def day(s): return datetime.fromisoformat(s[:10]).date() if s else None

def main(root):
    profiles = json.load(open(f"{root}/data/manual_overrides/knesset_profiles.json", encoding="utf8"))["profiles"]
    k25 = {n: p for n, p in profiles.items() if set(p["knessetTerms"]) & set(KNESSETS)}
    os.makedirs(f"{root}/.cache", exist_ok=True)
    vpath = f"{root}/.cache/votes_since_k20.json"
    if os.path.exists(vpath):
        votes = json.load(open(vpath))
    else:
        votes = rows("KNS_PlenumVote?$orderby=Id desc&$select=Id,VoteDateTime",
                     stop=lambda page: all(day(v["VoteDateTime"]) < K25_START for v in page))
        json.dump(votes, open(vpath, "w"))
    vote_days = [day(v["VoteDateTime"]) for v in votes if day(v["VoteDateTime"]) >= K25_START]
    last_vote = max(vote_days)
    print("k25 candidates", len(k25), "k25 votes", len(vote_days), "last", last_vote, file=sys.stderr)

    def iso(d): return d.isoformat() + "T00:00:00%2B02:00"

    def term(pid, k, pos, bills):
        lo, hi = STARTS[k], STARTS[k + 1]
        spans = [(max(day(r["StartDate"]), lo), min(day(r["FinishDate"]) or date.today(), hi))
                 for r in pos if r["PositionID"] in MK and r["KnessetNum"] == k and r["StartDate"]]
        if not spans: return None
        held = sum(1 for d in vote_days if lo <= d < hi and any(s <= d <= e for s, e in spans))
        vf = f"MkId eq {pid} and VoteDate ge {iso(lo)} and VoteDate lt {iso(hi)}"
        present = count(f"KNS_PlenumVoteResult?$filter={vf}")
        if present > held:
            raise ValueError(f"Recorded votes exceed eligible votes: person={pid} knesset={k}, present={present}, held={held}")
        bk = {b: v for b, v in bills.items() if v.get("KnessetNum") == k}
        kp = [r for r in pos if r["KnessetNum"] == k]
        committees = sorted({r["CommitteeName"] for r in kp if r["PositionID"] in COMMITTEE_MEMBER | COMMITTEE_CHAIR and r.get("CommitteeName")})
        chairs = sorted({r["CommitteeName"] for r in kp if r["PositionID"] in COMMITTEE_CHAIR and r.get("CommitteeName")})
        enc = lambda q: q.replace(" ", "%20")
        return {
            "votesHeld": held, "votesPresent": present,
            "agendaMotions": count(f"KNS_Agenda?$filter=InitiatorPersonID eq {pid} and KnessetNum eq {k}"),
            "billsInitiated": len(bk), "billsPassed": sum(1 for v in bk.values() if v.get("StatusID") == 118),
            "questions": count(f"KNS_Query?$filter=PersonID eq {pid} and KnessetNum eq {k}"),
            "committees": committees, "committeeChairs": chairs,
            "sources": {
                "votes": f"{B}/KNS_PlenumVoteResult?$filter={enc(vf)}",
                "votesHeld": f"{B}/KNS_PlenumVote?$filter=VoteDateTime%20ge%20{iso(lo)}%20and%20VoteDateTime%20lt%20{iso(hi)}",
                "agenda": f"{B}/KNS_Agenda?$filter=InitiatorPersonID%20eq%20{pid}%20and%20KnessetNum%20eq%20{k}",
                "bills": f"{B}/KNS_BillInitiator?$filter=PersonID%20eq%20{pid}%20and%20IsInitiator%20eq%20true&$expand=KNS_Bill",
                "questions": f"{B}/KNS_Query?$filter=PersonID%20eq%20{pid}%20and%20KnessetNum%20eq%20{k}",
                "committees": f"{B}/KNS_PersonToPosition?$filter=PersonID%20eq%20{pid}%20and%20KnessetNum%20eq%20{k}",
            }}

    def one(item):
        name, p = item
        pid = p["knessetPersonId"]
        pos = rows(f"KNS_PersonToPosition?$filter=PersonID eq {pid} and KnessetNum ge {KNESSETS[0]}")
        bl = rows(f"KNS_BillInitiator?$filter=PersonID eq {pid} and IsInitiator eq true&$select=BillID&$expand=KNS_Bill($select=StatusID,KnessetNum)")
        bills = {b["BillID"]: (b.get("KNS_Bill") or {}) for b in bl}
        terms = {}
        for k in KNESSETS:
            t = term(pid, k, pos, bills)
            if t: terms[str(k)] = t
        total = {f: sum(t[f] for t in terms.values()) for f in ("votesHeld", "votesPresent", "agendaMotions", "billsInitiated", "billsPassed", "questions")}
        return name, {"knessetPersonId": pid, "terms": terms, "total": total}

    cache_path = f"{root}/.cache/knesset_record.partial.json"
    out = json.load(open(cache_path, encoding="utf8")) if os.path.exists(cache_path) else {}
    for name, p in sorted(k25.items()):
        if name in out: continue
        name, a = one((name, p))
        out[name] = {**a, "asOf": last_vote.isoformat()}
        json.dump(out, open(cache_path, "w", encoding="utf8"), ensure_ascii=False)
        print(name, a["total"]["votesPresent"], "/", a["total"]["votesHeld"], list(a["terms"]), file=sys.stderr, flush=True)
    cleaned = {name:{**rec,"terms":{k:{key:value for key,value in term.items() if key != "votesPresentRaw"} for k,term in rec["terms"].items()}} for name,rec in out.items()}
    json.dump({"retrievedAt": date.today().isoformat(), "knessets": KNESSETS, "lastVoteDate": last_vote.isoformat(),
               "source": B, "activity": cleaned},
              open(f"{root}/data/manual_overrides/knesset_activity.json", "w", encoding="utf8"), ensure_ascii=False, indent=1)

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ".")
