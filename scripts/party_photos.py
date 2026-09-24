"""Collect candidate photos published by the parties themselves.

A photo is used only when the name printed with it in the party's own page (alt text or
caption) is exactly the candidate's name as filed, allowing only a change of word order
("last first" vs "first last") — never a partial or fuzzy match. Unmatched candidates
get an initials placeholder in the UI. Output: apps/web/public/photos/<partyKey>/<pos>.webp
and data/manual_overrides/photos.json (credit + source page per photo).
"""
import hashlib, io, json, os, re, sys, urllib.request, urllib.parse
from PIL import Image

SITES = {
  # partyKey: (source page, credit name)
  "k26-01": ("https://be-yahad.org.il/team/", "ביחד"),
  # Rendered in a browser (the page loads its cards with JS); the extracted
  # (printed position, printed name, image) triples are kept in data/photo_sources/.
  "k26-02": ("https://yasharwitheisenkot.com/team-member/", "ישר! עם איזנקוט", "data/photo_sources/k26-02.json"),
  "k26-17": ("https://democrats.org.il/team/", "הדמוקרטים", "data/photo_sources/k26-17.json"),
  "k26-11": ("https://beytenu.org.il/%D7%A8%D7%A9%D7%99%D7%9E%D7%AA-%D7%9E%D7%A4%D7%9C%D7%92%D7%AA-%D7%99%D7%A9%D7%A8%D7%90%D7%9C-%D7%91%D7%99%D7%AA%D7%A0%D7%95-%D7%9C%D7%9B%D7%A0%D7%A1%D7%AA-%D7%94%D7%91%D7%90%D7%94/", "ישראל ביתנו"),
}

def norm(s): return re.sub(r"\s+", " ", s.replace("״", '"').replace("׳", "'").replace("–", "-")).strip()
def rotations(name):
    t = norm(name).split(" ")
    return {" ".join(t[k:] + t[:k]) for k in range(len(t))}

CACHE = os.environ.get("PHOTO_CACHE", "/tmp/photo_cache")  # pre-seeded for sites that block scripts

def fetch(url):
    cached = os.path.join(CACHE, hashlib.sha1(url.encode()).hexdigest())
    if os.path.exists(cached): return open(cached, "rb").read()
    req = urllib.request.Request(urllib.parse.quote(url, safe=":/?=&%"), headers={"User-Agent": "Mozilla/5.0"})
    return urllib.request.urlopen(req, timeout=40).read()

def main(root):
    lists = {l["partyKey"]: l for l in json.load(open(f"{root}/data/manual_overrides/lists.json", encoding="utf8"))}
    try: out = json.load(open(f"{root}/data/manual_overrides/photos.json", encoding="utf8"))
    except FileNotFoundError: out = {"policy": "Party-published photos only, matched by the exact name printed with the photo; removal on request.", "photos": []}
    out["photos"] = [p for p in out["photos"] if p["partyKey"] not in SITES]
    for key, (page, credit, *extracted) in SITES.items():
        pairs, printed_pos = [], {}
        if extracted:
            for row in json.load(open(f"{root}/{extracted[0]}", encoding="utf8")):
                pairs.append((norm(row["name"]), row["src"]))
                if row.get("printedPosition") is not None:
                    printed_pos.setdefault(norm(row["name"]), set()).add(row["printedPosition"])
            html = ""
        else:
            html = fetch(page).decode("utf8", "ignore")
        for tag in re.findall(r"<img[^>]+>", html):
            alt = re.search(r'alt="([^"]+)"', tag); src = re.search(r'\ssrc="([^"]+)"', tag)
            if alt and src and alt.group(1).strip(): pairs.append((norm(alt.group(1)), urllib.parse.urljoin(page, src.group(1))))
        byname = {}
        for alt, src in pairs: byname.setdefault(alt, set()).add(src)
        n = 0
        for c in lists[key]["candidates"]:
            hits = {a for a in byname if a in rotations(c["nameHe"])}
            if len(hits) != 1 or len(byname[next(iter(hits))]) != 1: continue
            # Where the page prints a list position next to the name, it must agree too.
            pp = printed_pos.get(next(iter(hits)))
            if pp and pp != {c["position"]}: continue
            src = next(iter(byname[next(iter(hits))]))
            img = Image.open(io.BytesIO(fetch(src))).convert("RGB")
            img.thumbnail((360, 360))
            path = f"photos/{key}/{c['position']:03d}.webp"
            os.makedirs(f"{root}/apps/web/public/photos/{key}", exist_ok=True)
            img.save(f"{root}/apps/web/public/{path}", "WEBP", quality=78)
            out["photos"].append({"partyKey": key, "position": c["position"], "nameHe": c["nameHe"], "nameAsPrinted": next(iter(hits)),
                                  "path": "/" + path, "imageUrl": src, "sourcePage": page, "credit": f"פורסם על ידי {credit}"})
            n += 1
        print(key, "photos", n, "of", len(lists[key]["candidates"]), file=sys.stderr)
    json.dump(out, open(f"{root}/data/manual_overrides/photos.json", "w", encoding="utf8"), ensure_ascii=False, indent=1)

if __name__ == "__main__": main(sys.argv[1] if len(sys.argv) > 1 else ".")
