"""Replace party-website bios with licensed Wikipedia text (CC BY-SA, credited) using the same
verification as wiki_bios.py; drop a party bio when no verified article exists."""
import json, sys, importlib.util
s = importlib.util.spec_from_file_location("wb", "scripts/wiki_bios.py"); wb = importlib.util.module_from_spec(s); s.loader.exec_module(wb)
path = "data/manual_overrides/bios.json"
out = json.load(open(path, encoding="utf8"))
party = [b for b in out["bios"] if b.get("source") != "wikipedia"]
out["bios"] = [b for b in out["bios"] if b.get("source") == "wikipedia"]
norm = lambda x: " ".join(x.replace("״", '"').replace("׳", "'").replace("–", "-").split())
records = set(json.load(open("data/manual_overrides/knesset_profiles.json", encoding="utf8"))["profiles"])
names = lambda k, p, f: wb.forms(f) + wb.EXTRA_TITLES.get((k, p), [])
got = wb.pages([t for b in party for t in names(b["partyKey"], b["position"], b["nameHe"])])
hits = {}
for b in party:
    k, p, f = b["partyKey"], b["position"], b["nameHe"]
    c = {got[t]["title"] for t in names(k, p, f) if t in got and wb.ties(got[t]["wikitext"], k, norm(f) in records)}
    if len(c) == 1: hits[(k, p)] = c.pop()
lead = wb.leads(list(hits.values()))
rep, drop = [], []
for b in party:
    k, p, f = b["partyKey"], b["position"], b["nameHe"]
    h = lead.get(hits.get((k, p), ""))
    if not h: drop.append(f"{k} #{p} {f}"); continue
    out["bios"].append({"partyKey": k, "position": p, "nameHe": f, "nameAsPrinted": h["title"], "text": wb.first_sentence(h["extract"]),
                        "sourcePage": h["fullurl"], "credit": "מתוך ויקיפדיה", "source": "wikipedia"})
    rep.append(f"{k} #{p} {f}")
json.dump(out, open(path, "w", encoding="utf8"), ensure_ascii=False, indent=1)
print(json.dumps({"total": len(out["bios"]), "replaced": rep, "dropped": drop}, ensure_ascii=False))
