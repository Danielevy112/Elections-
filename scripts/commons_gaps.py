"""Commons photos for candidates with no photo and no Wikipedia bio: find the he.wikipedia article
with the same rules as wiki_bios.py (exact name forms, article must tie the person to this list),
then take the article's lead image only if it is a free-licensed Commons file."""
import json, sys, urllib.parse, importlib.util
def load(name):
    s = importlib.util.spec_from_file_location(name, f"scripts/{name}.py"); m = importlib.util.module_from_spec(s); s.loader.exec_module(m); return m
wb, cp = load("wiki_bios"), load("commons_photos")
root = "."
keys = {(k, p) for k, p in json.load(open(sys.argv[1]))}
lists = json.load(open(f"{root}/data/manual_overrides/lists.json"))
L = lists if isinstance(lists, list) else lists.get("lists", lists)
todo = [(l["partyKey"], c["position"], c["nameHe"]) for l in (L if isinstance(L, list) else L.values()) for c in l.get("candidates", []) if (l["partyKey"], c["position"]) in keys]
norm = lambda x: " ".join(x.replace("״", '"').replace("׳", "'").replace("–", "-").split())
records = set(json.load(open(f"{root}/data/manual_overrides/knesset_profiles.json"))["profiles"])
names = lambda k, p, f: wb.forms(f) + wb.EXTRA_TITLES.get((k, p), [])
got = wb.pages([t for k, p, f in todo for t in names(k, p, f)])
pseudo = []
for k, p, f in todo:
    c = {got[t]["title"] for t in names(k, p, f) if t in got and wb.ties(got[t]["wikitext"], k, norm(f) in records)}
    if len(c) == 1:
        t = c.pop(); pseudo.append({"partyKey": k, "position": p, "nameHe": f, "nameAsPrinted": t, "source": "wikipedia",
                                    "sourcePage": "https://he.wikipedia.org/wiki/" + urllib.parse.quote(t.replace(" ", "_"))})
    else: print("no verified article:", k, p, f, len(c), file=sys.stderr)
print("verified articles", len(pseudo), "of", len(todo), file=sys.stderr)
orig = cp.json.load
def jl(fh, *a, **kw):
    d = orig(fh, *a, **kw)
    if isinstance(d, dict) and "bios" in d: d["bios"] = pseudo
    return d
cp.json.load = jl
cp.main(root)
