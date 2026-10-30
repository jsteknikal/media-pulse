"""Compare how outlets cover one story, using only what the feeds give us: headline, lede, time, link.

For each story this works out who covered it and when, who stayed silent, how each outlet framed its
headline, which words only one outlet used, and which headlines are near copies (shared agency or
group content). Rule-based and approximate, like the theme tagging: no AI model, no article text.
"""
from __future__ import annotations

import re
from collections import Counter, defaultdict
from datetime import timedelta

from common import iso, stem, tokens

SHARED_TEXT = 0.75        # headline word overlap (Jaccard) at which two outlets count as running the same text
CONSENSUS_SHARE = 0.5     # a word used by at least this share of outlets is "common to most"
MIN_OUTLETS_FOR_WORDS = 3 # word-choice comparison needs a few outlets to mean anything
LEDE_CHARS = 280

QUESTION_RE = re.compile(r"\?\s*$")
QUOTE_RE = re.compile(r"[\"“”«»]|^\s*[–—-]\s")
# "Orpo: Hallitus ei ..." – a name, a colon, then the claim
SPEAKER_RE = re.compile(r"^\s*([A-ZÅÄÖ][\w\-’']+(?:\s+[A-ZÅÄÖ][\w\-’']+){0,2})\s*:\s+\S")
LABELS = {
    "opinion": {"analyysi", "kolumni", "pääkirjoitus", "mielipide", "kommentti", "essee", "näkökulma",
                "analys", "kolumn", "ledare", "kommentar", "analysis", "opinion", "column", "comment"},
    "live": {"live", "seuranta", "suora", "suorana", "direkt", "liveblogg"},
    "video": {"video", "katso", "kuvat", "videot"},
}
# Kickers before the headline proper: "HS: Jääkiekko | ...", "Analyysi: ...", "Suora lähetys: ..."
KICKER_PIPE_RE = re.compile(r"^\s*[^|]{1,40}?\s*\|\s*")
KICKER_COLON_RE = re.compile(r"^\s*([\wäöåÄÖÅ]+(?:\s+[\wäöåÄÖÅ]+)?)\s*:\s*")
# A headline that opens with another outlet or agency as its source: "Yle: Tanskan pääministeri ..."
OUTLET_NAMES = {"yle", "hs", "is", "il", "mtv", "stt", "hbl", "afp", "reuters", "ap", "bloomberg", "bbc", "cnn",
                "kauppalehti", "iltalehti", "ilta-sanomat", "helsingin sanomat", "aamulehti", "dpa", "tass", "ft"}
# Charged words, matched by prefix. Kept short on purpose: it flags a tone, it does not judge it.
EMOTIVE = (
    "kohu", "järky", "tyrmi", "tuoht", "pöyrist", "raju", "shokk", "sokki", "dramaat", "sensaat", "kauhu", "tyrmä", "raivo", "myrsk",
    "romah", "skandaal", "murska", "kuohu", "julma", "karmea", "hurja", "pöyris", "tuoho", "paniik", "kaaos",
    "tyly", "jättimäi", "rajusti", "räjäht", "hätä", "kriisi", "uhka", "ennätys",
    "chock", "kaos", "skandal", "drama", "rekord", "krisen", "hotar",
    "shock", "chaos", "slam", "outrage", "scandal", "crisis", "threat", "dramatic", "record", "fury",
)
NUMBER_RE = re.compile(r"\d")


def clean_title(title: str) -> str:
    return title.replace("\u00ad", "").strip()


def headline_frame(title: str) -> dict:
    """Signals about how a headline is written. Everything here is visible in the headline itself."""
    flags = []
    label = None
    body = clean_title(title)
    m = KICKER_PIPE_RE.match(body)
    if m and len(body) - m.end() > 12:
        kicker = body[:m.end()].strip(" |").lower()
        label = next((k for k, ws in LABELS.items() if any(w in ws for w in kicker.split())), None)
        body = body[m.end():]
    m = KICKER_COLON_RE.match(body)
    if m:
        lead = m.group(1).lower()
        kind = next((k for k, ws in LABELS.items() if any(w in ws for w in lead.split())), None)
        if kind:
            label = label or kind
            body = body[m.end():]
        elif lead in OUTLET_NAMES:
            flags.append("attributed")
        elif SPEAKER_RE.match(body) and not QUOTE_RE.search(body):
            flags.append("speaker")
    if label:
        flags.insert(0, label)
    if QUESTION_RE.search(body):
        flags.append("question")
    if "!" in body:
        flags.append("exclaim")
    if QUOTE_RE.search(body):
        flags.append("quote")
    emotive = sorted({w for w in tokens(body) if any(w.startswith(p) for p in EMOTIVE)})
    if emotive:
        flags.append("emotive")
    if NUMBER_RE.search(body):
        flags.append("number")
    return {"flags": flags, "emotive": emotive, "words": len(body.split()), "body": body}


# Function words the shared stoplist misses; they would otherwise show up as an outlet's "own" words.
EXTRA_STOP = {"tätä", "tässä", "tästä", "tähän", "kyse", "siksi", "silti", "jopa", "enää", "taas", "nämä", "näitä",
              "kuka", "ketkä", "mitkä", "sitten", "this", "that", "with", "from", "after", "över", "inför", "efter"}


def _stems(text: str) -> dict[str, str]:
    """stem -> first surface word it came from (surface kept for highlighting)."""
    out: dict[str, str] = {}
    for w in tokens(text):
        if w in EXTRA_STOP:
            continue
        s = stem(w)
        if s and s not in out:
            out[s] = w
    return out


def _jaccard(a: set, b: set) -> float:
    return len(a & b) / len(a | b) if a and b else 0.0


def compare_story(members: list[dict], src_by_id: dict, active_sources: set, themes: list[str]) -> dict:
    """members: enriched article dicts (title, lede, url, source, published, _dt), sorted by time."""
    members = sorted(members, key=lambda m: m["_dt"])
    first = members[0]["_dt"]
    family = lambda sid: (src_by_id.get(sid) or {}).get("family") or sid  # noqa: E731

    by_src: dict[str, list[dict]] = defaultdict(list)
    for m in members:
        by_src[m["source"]].append(m)

    outlets = []
    for sid, arts in by_src.items():
        lead = arts[0]
        outlets.append({
            "s": sid,
            "fam": family(sid),
            "first": iso(lead["_dt"]),
            "delay_h": round((lead["_dt"] - first).total_seconds() / 3600, 2),
            "n": len(arts),
            "t": clean_title(lead["title"]),
            "l": (lead.get("lede") or "")[:LEDE_CHARS],
            "u": lead["url"],
            "frame": headline_frame(lead["title"]),
            "more": [{"t": a["title"], "u": a["url"], "p": a["published"]} for a in arts[1:6]],
        })
    outlets.sort(key=lambda o: o["first"])

    # Word choice: stems in each outlet's lead headline, compared across outlets.
    stem_maps = {o["s"]: _stems(o["frame"]["body"]) for o in outlets}
    fam_stems: dict[str, set] = defaultdict(set)  # count a family once, so four Yle feeds don't make "consensus"
    for o in outlets:
        fam_stems[o["fam"]] |= set(stem_maps[o["s"]])
    n_fam = len(fam_stems)
    stem_fams = Counter(s for st in fam_stems.values() for s in st)
    consensus = []
    if n_fam >= MIN_OUTLETS_FOR_WORDS:
        surface = {}
        for o in outlets:
            for s, w in stem_maps[o["s"]].items():
                surface.setdefault(s, w)
        consensus = [surface[s] for s, c in stem_fams.most_common() if c / n_fam >= CONSENSUS_SHARE][:8]
        for o in outlets:
            own = [w for s, w in stem_maps[o["s"]].items() if stem_fams[s] == 1]
            o["own"] = own[:6]
    else:
        for o in outlets:
            o["own"] = []

    for o in outlets:
        o["frame"].pop("body", None)

    # Near-identical headlines from different newsrooms: shared agency copy or group content.
    shared = []
    word_sets = {o["s"]: set(stem_maps[o["s"]]) for o in outlets}
    seen = set()
    for i, a in enumerate(outlets):
        if a["s"] in seen:
            continue
        group = [a["s"]]
        for b in outlets[i + 1:]:
            if b["s"] in seen or b["fam"] == a["fam"]:
                continue
            if _jaccard(word_sets[a["s"]], word_sets[b["s"]]) >= SHARED_TEXT:
                group.append(b["s"])
        if len(group) > 1:
            seen.update(group)
            shared.append(group)
    shared_of = {s: gi for gi, g in enumerate(shared) for s in g}
    for o in outlets:
        o["shared"] = shared_of.get(o["s"])

    # Who could have covered it but didn't: outlets publishing while the story ran, outside its families.
    covered_fams = {o["fam"] for o in outlets}
    missing = []
    for sid in sorted(active_sources):
        cfg = src_by_id.get(sid) or {}
        if family(sid) in covered_fams:
            continue
        scope = cfg.get("scope")
        if scope and not set(scope) & set(themes):
            continue
        missing.append(sid)

    frames = Counter(f for o in outlets for f in o["frame"]["flags"])
    independent = len(covered_fams) - sum(len(g) - 1 for g in shared)
    return {
        "outlets": outlets,
        "families": len(covered_fams),
        "independent": max(independent, 1),
        "missing": missing,
        "consensus": consensus,
        "shared": shared,
        "frames": dict(frames),
        "spread_h": outlets[-1]["delay_h"] if outlets else 0,
    }


def active_during(arts: list[dict], start, end) -> set:
    """Outlets that published anything between start and end (plus a little slack after)."""
    end = end + timedelta(hours=6)
    return {a["source"] for a in arts if start <= a["_dt"] <= end}
