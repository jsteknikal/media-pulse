"""Coming to Finland: stories gaining speed abroad, checked against Finnish coverage.

Uses the Thoughtlead corpus API (see fetch_corpus.py for the rules of use):
  /v1/stories   stories the corpus sees emerging or accelerating across outlets and languages
  /v1/similar   the same story in Finnish outlets, found by meaning in any language

update(now)  network part, at most every CHECK_EVERY_HOURS; state in data/arrivals/state.json
build(now)   every run: site/data/arrivals.json for the page

What is committed: per story its id, dates, market counts and lag, plus the central headline and up to
three sample links while the story is on the page. Older stories keep only dates and counts, which is
what the lag measurement needs. No raw feed is stored.
"""
from __future__ import annotations

import os
import statistics
from datetime import datetime, timedelta

from common import DATA_DIR, SITE_DATA_DIR, iso, load_json, parse_iso, write_json
import fetch_corpus

STATE = DATA_DIR / "arrivals" / "state.json"
CHECK_EVERY_HOURS = 3        # 8 checks a day, well inside 5,000 requests
MAX_SIMILAR_PER_RUN = 60     # url queries; text queries are capped at 300 a day by the API
RECHECK_HOURS = 6            # a story not yet in Finland is looked for again after this
STORY_DAYS = 7
SHOW_DAYS = 14               # a story stays on the page this long after it was last seen abroad
HEADLINE_DAYS = 30           # after this only dates and counts are kept
MIN_SCORE_URL = 0.84         # Timo's tests: 0.84+ same event, 0.78–0.84 same topic
MIN_SCORE_TEXT = 0.80
WINDOW_BEFORE_DAYS = 2       # a Finnish article counts only from this long before the story was first seen
MIN_MARKETS_ABROAD = 2       # "building abroad" = in at least this many foreign markets
STATE_VERSION = 2
HOME = "fi"


def _ts(a: dict) -> str | None:
    return a.get("published") or a.get("fetched")


def _check_story(st: dict, key: str, budget: dict) -> dict:
    """Finnish coverage of one story: earliest Finnish article (time, outlet, url, score) or None.
    Only articles from WINDOW_BEFORE_DAYS before the story was first seen count: older Finnish articles
    on the same subject are background, not coverage of this story."""
    samples = st.get("articles") or []
    start = st.get("first_seen")
    window = iso(parse_iso(start) - timedelta(days=WINDOW_BEFORE_DAYS)) if start else ""
    foreign = [a for a in samples if a.get("market") != HOME and a.get("url")]
    found = [a for a in samples if a.get("market") == HOME]  # Finnish samples count as coverage
    result = {"how": None, "error": None}
    probe = (foreign or samples)[:1]
    hits = []
    if probe and budget["n"] > 0:
        budget["n"] -= 1
        try:
            r = fetch_corpus._get("/v1/similar", {"url": probe[0]["url"], "market": HOME, "days": 14,
                                                   "min_score": MIN_SCORE_URL, "limit": 10}, key)
            hits = r.get("results") or []
            result["how"] = "url"
        except RuntimeError as exc:
            msg = str(exc)
            if "409" in msg or "404" in msg:  # not indexed yet: fall back to the headline
                try:
                    r = fetch_corpus._get("/v1/similar", {"text": (st.get("headline") or "")[:300], "market": HOME,
                                                           "days": 14, "min_score": MIN_SCORE_TEXT, "limit": 10}, key)
                    hits = r.get("results") or []
                    result["how"] = "text"
                except RuntimeError as exc2:
                    result["error"] = str(exc2)[:160]
            else:
                result["error"] = msg[:160]
    found += [h for h in hits if (h.get("market") in (HOME, None))]
    found = [h for h in found if not _ts(h) or _ts(h) >= window]
    dated = sorted((h for h in found if _ts(h)), key=_ts)
    if found and not dated:  # covered, but no time on the results
        f = found[0]
        result["fi_first"] = {"p": None, "d": f.get("domain") or f.get("source"), "u": f.get("url"),
                              "t": f.get("title"), "s": f.get("score")}
        result["fi_count"] = len({h.get("url") for h in found})
    if dated:
        f = dated[0]
        result["fi_first"] = {"p": _ts(f), "d": f.get("domain") or f.get("source"), "u": f.get("url"),
                              "t": f.get("title"), "s": f.get("score")}
        result["fi_count"] = len({h.get("url") for h in found})
    if hits:
        result["fields"] = sorted(hits[0].keys())[:20]  # field names only, to check the API shape
    return result


def update(now: datetime, force: bool = False) -> dict:
    state = load_json(STATE, {}) or {}
    key = os.environ.get("CORPUS_API_KEY", "").strip()
    meta = state.setdefault("_meta", {})
    if not key:
        meta["error"] = "CORPUS_API_KEY is not set"
        return state
    last = meta.get("last_run")
    if not force and last and parse_iso(last) > now - timedelta(hours=CHECK_EVERY_HOURS):
        return state
    if meta.get("version") != STATE_VERSION:  # matching rules changed: check every story again
        for rec in (state.get("stories") or {}).values():
            for k in ("fi_first", "fi_count", "checked", "arrived_at", "check_how", "check_error"):
                rec.pop(k, None)
        meta["version"] = STATE_VERSION
    stories = state.setdefault("stories", {})
    meta.update({"last_run": iso(now), "error": None})
    try:
        page = fetch_corpus._get("/v1/stories", {"days": STORY_DAYS, "limit": 100}, key)
    except RuntimeError as exc:
        meta["error"] = str(exc)[:200]
        write_json(STATE, state, compact=False)
        return state

    budget = {"n": MAX_SIMILAR_PER_RUN}
    incoming = page.get("stories") or []
    # Check new stories first, then ones not yet seen in Finland that are due a re-check.
    def priority(s):
        rec = stories.get(str(s.get("id")), {})
        if not rec:
            return (0, -(s.get("articles_this_week") or 0))
        if rec.get("fi_first"):
            return (3, 0)
        return (1 if (rec.get("checked") or "") < iso(now - timedelta(hours=RECHECK_HOURS)) else 2,
                -(s.get("articles_this_week") or 0))
    for s in sorted(incoming, key=priority):
        sid = str(s.get("id"))
        rec = stories.setdefault(sid, {"id": sid, "first_seen": s.get("first_seen")})
        samples = s.get("articles") or []
        abroad = sorted(_ts(a) for a in samples if a.get("market") != HOME and _ts(a))
        english = next((a.get("title") for a in samples if a.get("lang") == "en" and a.get("title")), None)
        finnish = next((a.get("title") for a in samples if a.get("lang") == "fi" and a.get("title")), None)
        rec.update({
            "headline": s.get("headline"), "headline_en": english, "headline_fi": finnish, "state": s.get("state"), "last_seen": s.get("last_seen"),
            "weekly": s.get("weekly_articles"), "this_week": s.get("articles_this_week"),
            "velocity": s.get("velocity"), "markets": s.get("markets"), "outlets": s.get("outlets"),
            "samples": [{"t": a.get("title"), "u": a.get("url"), "d": a.get("domain") or a.get("source"),
                         "c": a.get("market"), "l": a.get("lang"), "p": _ts(a)}
                        for a in samples if a.get("market") != HOME][:3],
        })
        # First abroad = the earlier of the detector's first sighting and the earliest foreign sample.
        cands = [x for x in [s.get("first_seen"), abroad[0] if abroad else None, rec.get("abroad_first")] if x]
        if cands:
            rec["abroad_first"] = min(cands)
        foreign_markets = [m for m in (s.get("markets") or {}) if m != HOME]
        rec["markets_abroad"] = len(foreign_markets)
        due = (not rec.get("fi_first") and len(foreign_markets) >= MIN_MARKETS_ABROAD
               and (rec.get("checked") or "") < iso(now - timedelta(hours=RECHECK_HOURS)))
        if due and budget["n"] > 0:
            res = _check_story(s, key, budget)
            rec["checked"] = iso(now)
            rec["check_how"], rec["check_error"] = res.get("how"), res.get("error")
            if res.get("fields"):
                meta["similar_fields"] = res["fields"]
            if res.get("fi_first"):
                rec["fi_first"], rec["fi_count"] = res["fi_first"], res.get("fi_count")
                rec["arrived_at"] = iso(now)

    # Forget headlines and links of old stories; keep dates and counts for the lag statistics.
    old = iso(now - timedelta(days=HEADLINE_DAYS))
    for rec in stories.values():
        if (rec.get("last_seen") or "") < old:
            for k in ("headline", "headline_en", "headline_fi", "samples"):
                rec.pop(k, None)
            if rec.get("fi_first"):
                rec["fi_first"] = {k: rec["fi_first"].get(k) for k in ("p", "d")}
    meta["similar_left"] = budget["n"]
    meta["stories_in"] = len(incoming)
    write_json(STATE, state, compact=False)
    return state


def _lag_days(rec: dict) -> float | None:
    a, f = rec.get("abroad_first"), (rec.get("fi_first") or {}).get("p")
    if not a or not f:
        return None
    return round((parse_iso(f) - parse_iso(a)).total_seconds() / 86400, 1)


def build(now: datetime) -> dict:
    state = load_json(STATE, {}) or {}
    stories = list((state.get("stories") or {}).values())
    show_after = iso(now - timedelta(days=SHOW_DAYS))
    lags = [l for l in (_lag_days(r) for r in stories if (r.get("markets_abroad") or 0) >= MIN_MARKETS_ABROAD)
            if l is not None]
    pending, arrived, led = [], [], []
    for r in stories:
        if (r.get("last_seen") or "") < show_after or not r.get("headline"):
            continue
        lag = _lag_days(r)
        if (r.get("markets_abroad") or 0) < MIN_MARKETS_ABROAD:
            continue
        row = {k: r.get(k) for k in ("id", "headline", "headline_en", "headline_fi", "state", "first_seen", "last_seen", "abroad_first", "weekly",
                                     "this_week", "velocity", "markets", "outlets", "samples", "fi_first", "fi_count",
                                     "checked")}
        row["lag"] = lag
        if not r.get("fi_first"):
            if r.get("checked"):
                pending.append(row)
        elif lag is not None and lag < 0:
            led.append(row)
        else:
            arrived.append(row)
    pending.sort(key=lambda r: (r.get("this_week") or 0), reverse=True)
    arrived.sort(key=lambda r: (r.get("fi_first") or {}).get("p") or "", reverse=True)
    led.sort(key=lambda r: (r.get("fi_first") or {}).get("p") or "", reverse=True)
    pos = sorted(l for l in lags if l >= 0)
    out = {
        "updated": iso(now), "checked": (state.get("_meta") or {}).get("last_run"),
        "error": (state.get("_meta") or {}).get("error"),
        "pending": pending[:30], "arrived": arrived[:30], "led": led[:15],
        "stats": {
            "stories": len(stories), "measured": len(lags), "finland_first": sum(1 for l in lags if l < 0),
            "median_lag": round(statistics.median(pos), 1) if pos else None,
            "p25": round(pos[len(pos) // 4], 1) if len(pos) >= 4 else None,
            "p75": round(pos[(3 * len(pos)) // 4], 1) if len(pos) >= 4 else None,
            "since": min((r.get("first_seen") or "" for r in stories), default=None) or None,
        },
    }
    write_json(SITE_DATA_DIR / "arrivals.json", out)
    return out["stats"]
