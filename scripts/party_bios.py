"""Collect candidate bios the parties published themselves, quoted verbatim.

Used for candidates with no Knesset record, so the card can say what they did before,
in the party's own words, with a link to the page it came from. Nothing is paraphrased
or summarized: the stored text is the party's paragraph as printed. A bio is attached only
when the name printed on the profile page matches the filed name exactly (word order may
rotate). Output: data/manual_overrides/bios.json.
"""
import html, json, re, sys, urllib.request, urllib.parse

def norm(s): return re.sub(r"\s+", " ", s.replace("״", '"').replace("׳", "'").replace("–", "-")).strip()
def rotations(name):
    t = norm(name).split(" ")
    return {" ".join(t[k:] + t[:k]) for k in range(len(t))}
def fetch(url):
    req = urllib.request.Request(urllib.parse.quote(url, safe=":/?=&%"), headers={"User-Agent": "Mozilla/5.0"})
    return urllib.request.urlopen(req, timeout=40).read().decode("utf8", "ignore")
def text(fragment): return norm(html.unescape(re.sub(r"<[^>]+>", " ", fragment)))

def be_yahad():
    index = fetch("https://be-yahad.org.il/team/")
    for url, _ in re.findall(r'<h2 class="team-archive-item__title[^>]*>\s*<a href="([^"]+)">([^<]+)</a>', index):
        page = fetch(url)
        name = re.search(r'<h1 class="team-profile__title">(.*?)</h1>', page, re.S)
        about = re.search(r'team-profile__heading">עוד עלי</h2>(.*?)<h2', page, re.S)
        if not name or not about: continue
        paras = [text(p) for p in re.findall(r"<p[^>]*>(.*?)</p>", about.group(1), re.S)]
        paras = [p for p in paras if p]
        if paras: yield text(name.group(1)), paras[0], url

SITES = {"k26-01": ("ביחד", be_yahad)}

def main(root):
    lists = {l["partyKey"]: l for l in json.load(open(f"{root}/data/manual_overrides/lists.json", encoding="utf8"))}
    try: out = json.load(open(f"{root}/data/manual_overrides/bios.json", encoding="utf8"))
    except FileNotFoundError: out = {"policy": "Party-published bios quoted verbatim, matched by the exact name on the profile page.", "bios": []}
    out["bios"] = [b for b in out["bios"] if b["partyKey"] not in SITES]
    for key, (credit, scrape) in SITES.items():
        found = {}
        for printed, bio, url in scrape():
            found.setdefault(norm(printed), []).append((bio, url))
        n = 0
        for c in lists[key]["candidates"]:
            hits = [p for p in found if p in rotations(c["nameHe"])]
            if len(hits) != 1 or len(found[hits[0]]) != 1: continue
            bio, url = found[hits[0]][0]
            out["bios"].append({"partyKey": key, "position": c["position"], "nameHe": c["nameHe"], "nameAsPrinted": hits[0],
                                "text": bio, "sourcePage": url, "credit": f"מתוך עמוד המועמד/ת באתר {credit}"})
            n += 1
        print(key, "bios", n, file=sys.stderr)
    json.dump(out, open(f"{root}/data/manual_overrides/bios.json", "w", encoding="utf8"), ensure_ascii=False, indent=1)

if __name__ == "__main__": main(sys.argv[1] if len(sys.argv) > 1 else ".")
