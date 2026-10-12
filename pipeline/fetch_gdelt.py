"""Daily GDELT DOC 2.0 API pull: theme volume per region + top headlines.

GDELT is free and keyless but asks for no more than one request every 5 seconds, so a full
pull is 56 queries (themes x regions), so it is spread out: each hourly run does at most
MP_GDELT_MAX_QUERIES (default 12) within MP_GDELT_BUDGET seconds (default 600), backs off on
HTTP 429 and stops after repeated failures; the rest continue on later runs and each query
refreshes about once a day. MP_GDELT_FORCE=1 refetches everything, MP_GDELT=0 disables it.
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
PAUSE_SECONDS = 6
BACKOFF_SECONDS = 30
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
            body = http_get(url, timeout=25).decode("utf-8", "replace").strip()
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
    """Pull GDELT data within a time budget. Queries done in the last 20 h are skipped, so a pull
    that runs out of time or hits GDELT errors simply continues on the next hourly run."""
    now = now or now_utc()
    state = load_state()
    if os.environ.get("MP_GDELT", "1") == "0":
        return state
    force = os.environ.get("MP_GDELT_FORCE") == "1"
    budget = float(os.environ.get("MP_GDELT_BUDGET", "600"))
    started = time.monotonic()

    themes = load_config("themes.json")["themes"]
    regions = load_config("regions.json")["regions"]
    series = state["series"]
    articles = state["articles"] or {}
    prev = state["status"] or {}
    done = {} if force else dict(prev.get("done", {}))      # "region/theme" -> last success (ISO)
    report = {f"{e['region']}/{e['theme']}": e for e in prev.get("report", [])}
    fresh_after = now - timedelta(hours=20)
    start = (now - timedelta(days=LOOKBACK_DAYS)).strftime("%Y%m%d%H%M%S")
    end = now.strftime("%Y%m%d%H%M%S")
    failures_in_row = 0
    queries_run = 0
    max_queries = int(os.environ.get("MP_GDELT_MAX_QUERIES", "12"))
    stopped = None

    pending = [(r, t) for r in regions for t in themes if theme_query(t)
               and not (done.get(f"{r['id']}/{t['id']}") and parse_iso(done[f"{r['id']}/{t['id']}"]) > fresh_after)]
    if not pending:
        return state

    for region, theme in pending:
        if time.monotonic() - started > budget:
            stopped = "time budget used; continues next run"
            break
        if failures_in_row >= 3:
            stopped = "GDELT kept failing; retrying next run"
            break
        key = f"{region['id']}/{theme['id']}"
        q = f"{theme_query(theme)} {region_query(region)}"
        entry = {"region": region["id"], "theme": theme["id"], "time": iso(now)}
        if queries_run >= max_queries:
            stopped = f"{max_queries} queries per run; continues next run"
            break
        queries_run += 1
        payload, err = call({"query": q, "mode": "timelinevolraw", "format": "json",
                             "startdatetime": start, "enddatetime": end})
        time.sleep(PAUSE_SECONDS)
        if payload is None:
            entry["timeline_error"] = err
            failures_in_row += 1
            report[key] = entry
            if "429" in (err or "") or "limit requests" in (err or "").lower():
                time.sleep(BACKOFF_SECONDS)  # GDELT is throttling this IP; give it room
            continue
        failures_in_row = 0
        counts = daily_counts(payload)
        entry["timeline_days"] = len(counts)
        entry["timeline_total"] = sum(counts.values())
        series.setdefault(region["id"], {}).setdefault(theme["id"], {}).update(counts)
        payload, err = call({"query": q, "mode": "artlist", "format": "json", "maxrecords": "10",
                             "timespan": "24h", "sort": "hybridrel"}, retries=0)
        time.sleep(PAUSE_SECONDS)
        if payload is None:
            entry["articles_error"] = err
        else:
            articles.setdefault(region["id"], {})[theme["id"]] = [
                {"t": a.get("title", ""), "u": a.get("url", ""), "d": a.get("domain", ""),
                 "c": a.get("sourcecountry", ""), "l": a.get("language", ""), "p": a.get("seendate", "")}
                for a in payload.get("articles", []) or []]
            entry["articles"] = len(articles[region["id"]][theme["id"]])
        done[key] = iso(now)
        report[key] = entry

    cutoff = (now - timedelta(days=KEEP_DAYS)).date().isoformat()
    for per_theme in series.values():
        for days in per_theme.values():
            for d in [d for d in days if d < cutoff]:
                del days[d]

    total = sum(1 for r in regions for t in themes if theme_query(t))
    fresh = sum(1 for k, v in done.items() if parse_iso(v) > fresh_after)
    status = {
        "last_run": iso(now) if fresh else prev.get("last_run"),
        "queries": total, "ok": fresh, "stopped": stopped,
        "done": done, "report": sorted(report.values(), key=lambda e: (e["region"], e["theme"])),
    }
    write_json(GDIR / "series.json", series, compact=False)
    write_json(GDIR / "articles.json", articles)
    write_json(GDIR / "status.json", status, compact=False)
    return {"series": series, "articles": articles, "status": status}


if __name__ == "__main__":
    os.environ.setdefault("MP_GDELT_FORCE", "1")
    st = run()["status"]
    print(f"GDELT: {st.get('ok')}/{st.get('queries')} timeline queries ok")
