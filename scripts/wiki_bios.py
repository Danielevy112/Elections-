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

def pages(titles):
    """Lead sections for up to 20 titles per request (the API's limit), politely paced."""
    got = {}
    titles = list(dict.fromkeys(titles))
    for i in range(0, len(titles), 20):
        for attempt in range(5):
            try:
                q = api(action="query", prop="extracts|info", inprop="url", explaintext=1, exintro=1, exlimit=20, titles="|".join(titles[i:i + 20]))
                break
            except urllib.error.HTTPError as e:
                if e.code != 429: raise
                time.sleep(5 * (attempt + 1))
        for p in q["query"].get("pages", {}).values():
            if "missing" not in p and p.get("extract") and "פירושונים" not in p["extract"][:300]:
                got[p["title"]] = p
        time.sleep(1)
    return got

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

def main(root, gap_file):
    gap = json.load(open(gap_file, encoding="utf8"))
    path = f"{root}/data/manual_overrides/bios.json"
    out = json.load(open(path, encoding="utf8"))
    out["bios"] = [b for b in out["bios"] if b.get("source") != "wikipedia"]
    have = {(b["partyKey"], b["position"]) for b in out["bios"]}
    todo = [(k, p, f) for k, p, f in gap if (k, p) not in have]
    names = lambda k, p, f: forms(f) + EXTRA_TITLES.get((k, p), [])
    got = pages([t for k, p, f in todo for t in names(k, p, f)])
    found, missed = 0, []
    for key, pos, filed in todo:
        hit = next((got[t] for t in names(key, pos, filed) if t in got and any(w in got[t]["extract"] for w in PARTY_WORDS.get(key, []))), None)
        if not hit: missed.append(f"{key} {pos} {filed}"); continue
        out["bios"].append({"partyKey": key, "position": pos, "nameHe": filed, "nameAsPrinted": hit["title"],
                            "text": first_sentence(hit["extract"]), "sourcePage": hit["fullurl"], "credit": "מתוך ויקיפדיה", "source": "wikipedia"})
        found += 1
    json.dump(out, open(path, "w", encoding="utf8"), ensure_ascii=False, indent=1)
    print("wikipedia bios", found, "missed", len(missed), file=sys.stderr)
    for m in missed: print("  no verified article:", m, file=sys.stderr)

if __name__ == "__main__": main(sys.argv[1], sys.argv[2])
