"""Regional theme volume from the Thoughtlead corpus API — a drop-in for fetch_gdelt.py.

Copy this file to pipeline/fetch_corpus.py. run() returns the same shape as fetch_gdelt.run():

    {"series":   {region: {theme: {"YYYY-MM-DD": count}}},
     "articles": {region: {theme: [{"t", "u", "d", "c", "l", "p"}, ...]}},   # newest headlines
     "status":   {...}}

so analyze() and the Regions page work unchanged. Themes are tagged with this project's own
ThemeMatcher on each headline, so every region — Finland included — is tagged the same way.

Each hourly run asks only for what arrived since the last run (normally one request). The first
run, or a run with MP_CORPUS_REBUILD=1, backfills 30 days (about 40–80 requests, a few minutes).
Rebuild after editing stems in themes.json: history is re-tagged only within those 30 days.

Needs CORPUS_API_KEY. Keep it in a GitHub Actions secret — this repository is public, so the key
must never appear in code, logs or committed files. Standard library only.
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta

from common import DATA_DIR, USER_AGENT, ThemeMatcher, iso, load_config, load_json, now_utc, parse_iso, write_json

API = os.environ.get("CORPUS_API_URL", "https://xsdlohnykqayyharjunj.supabase.co/functions/v1/corpus-api")
CDIR = DATA_DIR / "corpus"

# Which corpus markets make up each region in config/regions.json. The corpus has no Norwegian
# or Danish outlets, so Nordics = Finland + Sweden. "intl" (FT, Reuters, Politico Europe, …) is
# left out on purpose: it mixes European and global outlets.
REGION_MARKETS = {
    "finland": ["fi"],
    "nordics": ["fi", "se"],
    "europe": ["fi", "se", "de", "uk", "fr", "es"],
    "north_america": ["us"],
}
# Languages the stems in themes.json cover. Add "de,es,fr" here once themes.json has stems for
# them; until then German, Spanish and French headlines would only be noise for the matcher.
LANGS = os.environ.get("MP_CORPUS_LANGS", "fi,sv,en")

BACKFILL_DAYS = 30          # the API serves at most 31 days back
OVERLAP_MINUTES = 15        # re-ask a little before the last run; duplicates are skipped by id
KEEP_DAYS = 400             # same retention as fetch_gdelt.py
HEADLINE_HOURS = 24         # headlines shown per region and theme come from the last 24 h
HEADLINES_PER_THEME = 10
PAGE_PAUSE = 1.1            # stays under the API's 60 requests per minute


def _get(path: str, params: dict, key: str) -> dict:
    url = f"{API}{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {key}", "User-Agent": USER_AGENT})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            body = exc.read()[:300].decode("utf-8", "replace")
            if exc.code == 429 or exc.code >= 500:
                wait = int(exc.headers.get("Retry-After") or 0) or 15 * (attempt + 1)
                if wait > 180 or attempt == 3:  # daily limit or a longer outage: stop, next run continues
                    raise RuntimeError(f"corpus API {exc.code}: {body}") from None
                time.sleep(wait)
                continue
            raise RuntimeError(f"corpus API {exc.code}: {body}") from None
        except urllib.error.URLError as exc:
            if attempt == 3:
                raise RuntimeError(f"corpus API unreachable: {exc.reason}") from None
            time.sleep(15 * (attempt + 1))
    raise RuntimeError("corpus API kept failing")


def load_state() -> dict:
    return {
        "series": load_json(CDIR / "series.json", {}),
        "articles": load_json(CDIR / "articles.json", {}),
        "status": load_json(CDIR / "status.json", {}),
    }


def run(now: datetime | None = None) -> dict:
    now = now or now_utc()
    state = load_state()
    key = os.environ.get("CORPUS_API_KEY", "").strip()
    if not key:
        state["status"] = {**state["status"], "error": "CORPUS_API_KEY is not set"}
        return state

    regions = [r["id"] for r in load_config("regions.json")["regions"] if r["id"] in REGION_MARKETS]
    markets = sorted({m for rid in regions for m in REGION_MARKETS[rid]})
    matcher = ThemeMatcher(load_config("themes.json")["themes"])
    prev = state["status"] or {}
    rebuild = os.environ.get("MP_CORPUS_REBUILD") == "1" or not prev.get("high_water")

    series: dict = {} if rebuild else state["series"]
    # Ids already counted near the high-water mark, with their fetch times. Each run re-asks from a
    # little before the mark, and these keep that overlap from being counted twice.
    recent: dict[str, str] = {} if rebuild else dict(prev.get("recent", {}))
    if rebuild:
        since = now - timedelta(days=BACKFILL_DAYS)
    else:
        since = parse_iso(prev["high_water"]) - timedelta(minutes=OVERLAP_MINUTES)

    # Headlines: keep the ones still inside the window, then add new ones.
    head_cutoff = iso(now - timedelta(hours=HEADLINE_HOURS))
    heads: dict = {} if rebuild else {
        rid: {t: [h for h in hs if (h.get("p") or "") >= head_cutoff] for t, hs in per.items()}
        for rid, per in (state["articles"] or {}).items()
    }

    params = {"since": iso(since), "market": ",".join(markets), "lang": LANGS, "limit": 1000}
    cursor, pages, received, counted = None, 0, 0, 0
    high = prev.get("high_water") if not rebuild else None
    error = None
    try:
        while True:
            page = _get("/v1/articles", {**params, **({"cursor": cursor} if cursor else {})}, key)
            pages += 1
            for a in page["articles"]:
                received += 1
                if a["id"] in recent:
                    continue
                recent[a["id"]] = a["fetched"]
                high = max(high or "", a["fetched"])
                themes = matcher.classify(a["title"], "", [], a.get("lang") or "en")
                if not themes:
                    continue
                counted += 1
                day = (a.get("published") or a["fetched"])[:10]
                for rid in regions:
                    if a.get("market") not in REGION_MARKETS[rid]:
                        continue
                    for t in themes:
                        days = series.setdefault(rid, {}).setdefault(t, {})
                        days[day] = days.get(day, 0) + 1
                        if (a.get("published") or a["fetched"]) >= head_cutoff:
                            heads.setdefault(rid, {}).setdefault(t, []).append({
                                "t": a["title"], "u": a["url"], "d": a["domain"], "c": a.get("market"),
                                "l": a.get("lang"), "p": a.get("published") or a["fetched"],
                            })
            cursor = page.get("next_cursor")
            if not cursor:
                break
            time.sleep(PAGE_PAUSE)
    except RuntimeError as exc:
        # Keep what was counted; the next run resumes from the high-water mark.
        error = str(exc)

    cutoff = (now - timedelta(days=KEEP_DAYS)).date().isoformat()
    for per_theme in series.values():
        for days in per_theme.values():
            for d in [d for d in days if d < cutoff]:
                del days[d]
    articles = {
        rid: {t: sorted(hs, key=lambda h: h["p"], reverse=True)[:HEADLINES_PER_THEME] for t, hs in per.items()}
        for rid, per in heads.items()
    }
    keep_after = iso(parse_iso(high) - timedelta(minutes=OVERLAP_MINUTES + 5)) if high else ""
    recent = {i: f for i, f in recent.items() if f >= keep_after}

    status = {
        "last_run": iso(now), "source": "corpus-api", "high_water": high, "recent": recent,
        "pages": pages, "received": received, "tagged": counted, "rebuilt": rebuild,
        "markets": markets, "langs": LANGS, "error": error,
        # The Sources page reads these fetch_gdelt.py keys: last_run, ok/queries and stopped
        # (shown in brackets) — so a failed run is visible there too.
        "ok": 0 if error else len(regions), "queries": len(regions), "stopped": error,
    }
    write_json(CDIR / "series.json", series, compact=False)
    write_json(CDIR / "articles.json", articles)
    write_json(CDIR / "status.json", status, compact=False)
    return {"series": series, "articles": articles, "status": status}


if __name__ == "__main__":
    st = run()["status"]
    print(f"Corpus: {st.get('received')} headlines in {st.get('pages')} requests, "
          f"{st.get('tagged')} tagged{'; error: ' + st['error'] if st.get('error') else ''}")
