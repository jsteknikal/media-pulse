"""Daily GDELT DOC 2.0 API pull: theme volume per region + top headlines.

GDELT is free and keyless but asks for no more than one request every 5 seconds, so a full
pull (themes x regions x 2 calls) takes roughly 10-15 minutes. It runs at most once every
20 hours; set MP_GDELT_FORCE=1 to force it, MP_GDELT=0 to switch it off.
"""
from __future__ import annotations

import json
import os
import time
import urllib.parse
from datetime import datetime, timedelta

from common import DATA_DIR, http_get, iso, load_config, load_json, now_utc, parse_iso, write_json

API = "https://api.gdeltproject.org/api/v2/doc/doc"
GDIR = DATA_DIR / "gdelt"
PAUSE_SECONDS = 5.5
LOOKBACK_DAYS = 21
KEEP_DAYS = 400


def theme_query(theme: dict) -> str | None:
    if theme.get("gdelt_query"):
        return theme["gdelt_query"]
    codes = theme.get("gdelt_themes") or []
    if not codes:
        return None
    parts = [f"theme:{c}" for c in codes]
    return parts[0] if len(parts) == 1 else "(" + " OR ".join(parts) + ")"


def region_query(region: dict) -> str:
    parts = [f"sourcecountry:{c}" for c in region["countries"]]
    return parts[0] if len(parts) == 1 else "(" + " OR ".join(parts) + ")"


def call(params: dict, retries: int = 1):
    url = API + "?" + urllib.parse.urlencode(params)
    for attempt in range(retries + 1):
        try:
            body = http_get(url, timeout=60).decode("utf-8", "replace").strip()
        except Exception as exc:
            err = f"{type(exc).__name__}: {str(exc)[:150]}"
        else:
            if not body:
                return {}, None  # GDELT returns an empty body when nothing matches
            try:
                return json.loads(body), None
            except json.JSONDecodeError:
                err = body[:200]  # GDELT explains bad queries / throttling in plain text
        if attempt < retries:
            time.sleep(PAUSE_SECONDS * 2)
    return None, err


def daily_counts(payload: dict) -> dict[str, int]:
    out: dict[str, int] = {}
    for series in payload.get("timeline", []) or []:
        for point in series.get("data", []) or []:
            raw = str(point.get("date", ""))[:8]
            if len(raw) == 8 and raw.isdigit():
                day = f"{raw[:4]}-{raw[4:6]}-{raw[6:]}"
                out[day] = out.get(day, 0) + int(point.get("value", 0) or 0)
        break  # first series = article counts
    return out


def load_state():
    return {
        "series": load_json(GDIR / "series.json", {}),
        "articles": load_json(GDIR / "articles.json", {}),
        "status": load_json(GDIR / "status.json", {}),
    }


def run(now: datetime | None = None) -> dict:
    now = now or now_utc()
    state = load_state()
    if os.environ.get("MP_GDELT", "1") == "0":
        return state
    last = state["status"].get("last_run")
    force = os.environ.get("MP_GDELT_FORCE") == "1"
    if not force and last and parse_iso(last) > now - timedelta(hours=20):
        return state

    themes = load_config("themes.json")["themes"]
    regions = load_config("regions.json")["regions"]
    series = state["series"]
    articles: dict = {}
    report = []
    start = (now - timedelta(days=LOOKBACK_DAYS)).strftime("%Y%m%d%H%M%S")
    end = now.strftime("%Y%m%d%H%M%S")

    for region in regions:
        rq = region_query(region)
        for theme in themes:
            tq = theme_query(theme)
            if not tq:
                continue
            q = f"{tq} {rq}"
            entry = {"region": region["id"], "theme": theme["id"]}
            payload, err = call({"query": q, "mode": "timelinevolraw", "format": "json",
                                 "startdatetime": start, "enddatetime": end})
            time.sleep(PAUSE_SECONDS)
            if payload is None:
                entry["timeline_error"] = err
            else:
                counts = daily_counts(payload)
                entry["timeline_days"] = len(counts)
                entry["timeline_total"] = sum(counts.values())
                bucket = series.setdefault(region["id"], {}).setdefault(theme["id"], {})
                bucket.update(counts)
            payload, err = call({"query": q, "mode": "artlist", "format": "json", "maxrecords": "10",
                                 "timespan": "24h", "sort": "hybridrel"})
            time.sleep(PAUSE_SECONDS)
            if payload is None:
                entry["articles_error"] = err
            else:
                arts = []
                for a in payload.get("articles", []) or []:
                    arts.append({"t": a.get("title", ""), "u": a.get("url", ""), "d": a.get("domain", ""),
                                 "c": a.get("sourcecountry", ""), "l": a.get("language", ""),
                                 "p": a.get("seendate", "")})
                articles.setdefault(region["id"], {})[theme["id"]] = arts
                entry["articles"] = len(arts)
            report.append(entry)

    cutoff = (now - timedelta(days=KEEP_DAYS)).date().isoformat()
    for per_theme in series.values():
        for days in per_theme.values():
            for d in [d for d in days if d < cutoff]:
                del days[d]

    ok = sum(1 for e in report if "timeline_error" not in e)
    status = {"last_run": iso(now), "queries": len(report), "ok": ok, "report": report}
    write_json(GDIR / "series.json", series, compact=False)
    write_json(GDIR / "articles.json", articles)
    write_json(GDIR / "status.json", status, compact=False)
    return {"series": series, "articles": articles, "status": status}


if __name__ == "__main__":
    os.environ.setdefault("MP_GDELT_FORCE", "1")
    st = run()["status"]
    print(f"GDELT: {st.get('ok')}/{st.get('queries')} timeline queries ok")
