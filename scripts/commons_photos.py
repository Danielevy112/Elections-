"""Wikimedia Commons photos for candidates whose Hebrew Wikipedia article is already
verified (bios.json, source "wikipedia") and who have no party-published photo.

Only the article's own lead image is used, and only under a free license (CC0, CC BY,
CC BY-SA, public domain). Credit shows author and license and links to the file page.
Writes apps/web/public/photos/<partyKey>/<pos>.webp and appends to photos.json.
Resumable: candidates already in photos.json are skipped. Paced for Wikimedia limits.
"""
import io, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
from PIL import Image

UA = {"User-Agent": "Elections26/1.0 (github.com/Danielevy112/Elections-)"}
# Lead images reviewed and rejected: group photos or crops where the subject is ambiguous.
SKIP = {("k26-06", 2), ("k26-17", 10)}
FREE = re.compile(r"^(CC0|CC[ -]BY(-SA)?( \d\.\d)?|Public domain|PD.*)", re.I)

def get(url, raw=False):
    for attempt in range(8):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                data = r.read()
                return data if raw else json.loads(data)
        except urllib.error.HTTPError as e:
            if e.code not in (429, 503): raise
            time.sleep(15 * (attempt + 1))
    raise RuntimeError("rate limited")

def api(host, **p):
    p.update(format="json", formatversion=2)
    return get(f"https://{host}/w/api.php?" + urllib.parse.urlencode(p))

def strip(html):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", html or "")).strip()

def main(root, limit=10_000):
    bios = [b for b in json.load(open(f"{root}/data/manual_overrides/bios.json"))["bios"] if b.get("source") == "wikipedia"]
    ppath = f"{root}/data/manual_overrides/photos.json"
    photos = json.load(open(ppath))
    have = {(p["partyKey"], p["position"]) for p in photos["photos"]}
    todo = [b for b in bios if (b["partyKey"], b["position"]) not in have | SKIP][:limit]
    added = 0
    for b in todo:
        title = urllib.parse.unquote(b["sourcePage"].rsplit("/wiki/", 1)[1]).replace("_", " ")
        pg = api("he.wikipedia.org", action="query", prop="pageimages", piprop="name", titles=title)["query"]["pages"][0]
        time.sleep(1.5)
        name = pg.get("pageimage")
        if not name: continue
        info = api("commons.wikimedia.org", action="query", prop="imageinfo", iiprop="url|extmetadata", iiurlwidth=480, titles="File:" + name)["query"]["pages"][0]
        time.sleep(1.5)
        if "imageinfo" not in info: continue  # local (non-Commons) file: skip
        ii = info["imageinfo"][0]; md = ii.get("extmetadata", {})
        lic = strip(md.get("LicenseShortName", {}).get("value"))
        artist = strip(md.get("Artist", {}).get("value")) or "לא צוין"
        if not FREE.match(lic): continue
        img = Image.open(io.BytesIO(get(ii["thumburl"], raw=True))).convert("RGB")
        time.sleep(1.5)
        img.thumbnail((360, 360))
        rel = f"photos/{b['partyKey']}/{b['position']:03d}.webp"
        os.makedirs(f"{root}/apps/web/public/photos/{b['partyKey']}", exist_ok=True)
        img.save(f"{root}/apps/web/public/{rel}", "WEBP", quality=78)
        photos["photos"].append({"partyKey": b["partyKey"], "position": b["position"], "nameHe": b["nameHe"],
                                 "nameAsPrinted": b["nameAsPrinted"], "path": "/" + rel, "imageUrl": ii["url"],
                                 "sourcePage": ii["descriptionurl"], "credit": f"ויקישיתוף · {artist[:80]} · {lic}"})
        json.dump(photos, open(ppath, "w"), ensure_ascii=False, indent=1)
        added += 1
        print("added", b["partyKey"], b["position"], b["nameAsPrinted"], lic, flush=True)
    print("commons photos added", added, file=sys.stderr)

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ".", int(sys.argv[2]) if len(sys.argv) > 2 else 10_000)
