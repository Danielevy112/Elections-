"""Hebrew Wikipedia fallback for candidates with no Knesset record and no party bio.

An article is used only when (1) its title is exactly the candidate's name (a word-order
rotation of the filed name, or first given name + surname), and (2) the article text names
the candidate's party, so a namesake is never attached. The stored text is the article's
first sentence, verbatim, with a link to the article. Output is merged into
data/manual_overrides/bios.json with credit "ויקיפדיה".
"""
import json, sys, time, urllib.error, urllib.parse, urllib.request

API = "https://he.wikipedia.org/w/api.php"
# Words that identify each list in an article about one of its candidates.
PARTY_WORDS = {
    "k26-01": ["ביחד", "בנט", "יש עתיד"], "k26-02": ["ישר!", "איזנקוט"], "k26-06": ["עמך ישראל"],
    "k26-11": ["ישראל ביתנו"], "k26-14": ["עוצמה יהודית"], "k26-16": ["המילואימניקים", "הכלכלית"],
    "k26-17": ["הדמוקרטים", "מפלגת העבודה", "מרצ"], "k26-18": ['רע"ם', "הרשימה הערבית המאוחדת"],
    "k26-19": ['ש"ס'], "k26-29": ["הליכוד"], "k26-31": ["הציונות הדתית"], "k26-35": ["הרשימה המשותפת", 'חד"ש', 'בל"ד', 'תע"ל'],
    "k26-37": ["יהדות התורה", "אגודת ישראל", "דגל התורה"], "k26-30": ["כחול לבן"],
    "k26-04": ["השותפות לכולם"], "k26-05": ["הפיראטים"], "k26-07": ["ישראל תחילה"], "k26-09": ["קול הנשים"],
    "k26-10": ["ביחד נצליח"], "k26-15": ["סדר חדש"], "k26-20": ["הציבור החרדי"], "k26-22": ["ברית עולם"],
    "k26-24": ['גה"ת'], "k26-28": ["צבע שחור"], "k26-32": ['אח"י'], "k26-33": ["צומת (מפלגה)", "מפלגת צומת"],
    "k26-34": ["תקומה (מפלגה)", "מפלגת תקומה"], "k26-36": ["מפלגת הקהל"], "k26-38": ["נעם (מפלגה)", "מפלגת נעם"],
}

# Reviewed article titles for candidates known by a short or differently spelled name
# (found via Wikipedia search). A title here is still used only if the article names the party.
EXTRA_TITLES = {
    ("k26-01", 3): ["קרן טרנר"], ("k26-01", 6): ["נעם תיבון"], ("k26-02", 6): ["חילי טרופר"], ("k26-02", 19): ["טל אוחנה"],
    ("k26-06", 1): ["עופר וינטר"], ("k26-11", 2): ["רפי בן שטרית"], ("k26-11", 3): ["טליה לנקרי"],
    ("k26-17", 5): ["יאיא פינק"], ("k26-17", 6): ["גבי לסקי"], ("k26-17", 7): ["עמרי רונן"], ("k26-17", 9): ["משה רדמן אבוטבול"],
    ("k26-17", 10): ["סומיה בשיר"], ("k26-18", 4): ["ואליד אלהואשלה"], ("k26-29", 16): ["דוד פטר", "דוד פטר (עורך דין)"],
    ("k26-31", 5): ["צביקה מור"], ("k26-37", 5): ["משה רוזנטל"],
}

def api(**params):
    params.update(format="json", redirects=1)
    req = urllib.request.Request(API + "?" + urllib.parse.urlencode(params), headers={"User-Agent": "Elections26/1.0 (github.com/Danielevy112/Elections-)"})
    return json.load(urllib.request.urlopen(req, timeout=30))

def call(**params):
    for attempt in range(6):
        try:
            return api(**params)
        except urllib.error.HTTPError as e:
            if e.code != 429: raise
            time.sleep(5 * (attempt + 1))
    raise RuntimeError("wikipedia rate limit")

CACHE = "/tmp/wiki_cache.json"

def pages(titles):
    import os
    cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
    need = [t for t in dict.fromkeys(titles) if t not in cache]
    got = _pages(need)
    for t in need: cache[t] = got.get(t)
    json.dump(cache, open(CACHE, "w"), ensure_ascii=False)
    return {t: cache[t] for t in titles if cache.get(t)}

def _pages(titles):
    """Whole-article wikitext for every requested title (50 per request), keyed by the
    title as requested, so a redirect ("first last" -> article) still lands on the name
    we asked for. Disambiguation pages are dropped. Lead extracts are fetched after."""
    got = {}
    titles = list(dict.fromkeys(titles))
    for i in range(0, len(titles), 50):
        batch = titles[i:i + 50]
        q = call(action="query", prop="revisions|pageprops", rvprop="content", rvslots="main", ppprop="disambiguation", titles="|".join(batch))["query"]
        alias = {t: t for t in batch}
        for n in q.get("normalized", []): alias[n["from"]] = n["to"]
        redir = {r["from"]: r["to"] for r in q.get("redirects", [])}
        final = {p["title"]: p for p in q.get("pages", {}).values() if "missing" not in p and "invalid" not in p}
        for t in batch:
            a = alias.get(t, t); a = redir.get(a, a)
            p = final.get(a)
            if not p or "disambiguation" in p.get("pageprops", {}): continue
            text = p["revisions"][0]["slots"]["main"]["*"]
            if "{{פירושונים" in text or "{{דף פירושונים" in text: continue
            got[t] = {"title": p["title"], "wikitext": text}
        time.sleep(1)
    return got

def leads(titles):
    out = {}
    titles = list(dict.fromkeys(titles))
    for i in range(0, len(titles), 20):
        q = call(action="query", prop="extracts|info", inprop="url", explaintext=1, exintro=1, exlimit=20, titles="|".join(titles[i:i + 20]))["query"]
        for p in q.get("pages", {}).values():
            if p.get("extract"): out[p["title"]] = p
        time.sleep(1)
    return out

def first_sentence(text):
    depth = 0
    for i, ch in enumerate(text):
        if ch == "(": depth += 1
        elif ch == ")": depth = max(0, depth - 1)
        elif ch == "." and depth == 0 and (i + 1 == len(text) or text[i + 1] in " \n"):
            return text[: i + 1].strip()
    return text.split("\n")[0].strip()

def forms(filed):
    t = filed.replace("(", " ").replace(")", " ").split()
    out = [" ".join(t[k:] + t[:k]) for k in range(1, len(t))]
    if len(t) >= 3: out.append(f"{t[1]} {t[0]}")
    return list(dict.fromkeys(out))

NEAR = ("2026", "הכנסת ה-26", "הכנסת ה־26", "הכנסת העשרים ושש", "לכנסת ה-26", "לכנסת ה־26")

def ties(text, key, has_record):
    """The article is about this candidate only if it ties the person to this list's 2026
    run (a party word within 300 characters of a 2026 marker), or the candidate is an MK
    already linked to their Knesset record and the article describes an MK of the party."""
    words = PARTY_WORDS.get(key, [])
    if has_record and any(m in text for m in ("חבר הכנסת", "חברת הכנסת", "חבר כנסת", "חברת כנסת")) and any(w in text for w in words):
        return True
    for w in words:
        i = text.find(w)
        while i != -1:
            window = text[max(0, i - 300): i + len(w) + 300]
            if any(m in window for m in NEAR): return True
            i = text.find(w, i + 1)
    return False

def main(root, gap_file):
    gap = json.load(open(gap_file, encoding="utf8"))
    path = f"{root}/data/manual_overrides/bios.json"
    out = json.load(open(path, encoding="utf8"))
    out["bios"] = [b for b in out["bios"] if b.get("source") != "wikipedia"]
    have = {(b["partyKey"], b["position"]) for b in out["bios"]}
    todo = [(k, p, f) for k, p, f in gap if (k, p) not in have]
    norm = lambda x: " ".join(x.replace("״", '"').replace("׳", "'").replace("–", "-").split())
    records = set(json.load(open(f"{root}/data/manual_overrides/knesset_profiles.json", encoding="utf8"))["profiles"])
    names = lambda k, p, f: forms(f) + EXTRA_TITLES.get((k, p), [])
    got = pages([t for k, p, f in todo for t in names(k, p, f)])
    hits = {}
    for key, pos, filed in todo:
        cands = {got[t]["title"] for t in names(key, pos, filed) if t in got and ties(got[t]["wikitext"], key, norm(filed) in records)}
        if len(cands) == 1: hits[(key, pos, filed)] = cands.pop()
    lead = leads(list(hits.values()))
    found, missed = 0, []
    for key, pos, filed in todo:
        t = hits.get((key, pos, filed)); hit = lead.get(t) if t else None
        if not hit: missed.append(f"{key} {pos} {filed}"); continue
        out["bios"].append({"partyKey": key, "position": pos, "nameHe": filed, "nameAsPrinted": hit["title"],
                            "text": first_sentence(hit["extract"]), "sourcePage": hit["fullurl"], "credit": "מתוך ויקיפדיה", "source": "wikipedia"})
        found += 1
    json.dump(out, open(path, "w", encoding="utf8"), ensure_ascii=False, indent=1)
    print("wikipedia bios", found, "missed", len(missed), file=sys.stderr)
    for m in missed: print("  no verified article:", m, file=sys.stderr)

if __name__ == "__main__": main(sys.argv[1], sys.argv[2])
