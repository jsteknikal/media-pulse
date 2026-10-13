"""Sustainability lens: specialist feeds, official-record checks and the data for the lens page.

Three parts, all optional for the main update (a failure here never stops Media Pulse):
  fetch(now)          specialist feeds from config/lens/sources.json into data/lens/
  watch(now)          the Legislative Observatory record of each tracked file that has an 'oeil' reference;
                      stores the official stage and latest event in data/lens/oeil.json and flags changes
  build(now, ...)     site/data/lens.json: issues with mainstream and specialist coverage, files in
                      preparation, upcoming dates
"""
from __future__ import annotations

import html
import re
import urllib.parse
from datetime import datetime, timedelta

from common import (DATA_DIR, SITE_DATA_DIR, SignalMatcher, http_get, iso, load_config, load_json, local_date,
                    parse_iso, write_json)
import fetch_rss

MEDIA_DAYS = 90             # days of daily coverage sent to the page
WATCH_EVERY_HOURS = 6       # the official records change rarely; be polite
OEIL_URL = "https://oeil.europarl.europa.eu/oeil/en/procedure-file?reference={ref}"
STATE_FILE = DATA_DIR / "lens" / "oeil.json"


# ---------------------------------------------------------------- feeds

def fetch(now: datetime) -> dict:
    return fetch_rss.run(now, config_name="lens/sources.json", collection="lens", status_name="fetch_lens.json")


# ---------------------------------------------------------------- official records

DROP_RE = re.compile(r"<(script|style|noscript)\b.*?</\1>", re.S | re.I)
TAG_RE = re.compile(r"<[^>]+>")
DATE_RE = re.compile(r"^(\d{2})/(\d{2})/(\d{4})\b\s*(.*)$")


def page_lines(raw: bytes) -> list[str]:
    text = DROP_RE.sub(" ", raw.decode("utf-8", "replace"))
    text = TAG_RE.sub("\n", text)
    lines = [re.sub(r"\s+", " ", html.unescape(x)).strip() for x in text.split("\n")]
    return [x for x in lines if x]


def parse_oeil(raw: bytes) -> dict:
    """Stage reached and key events from a Legislative Observatory procedure page."""
    lines = page_lines(raw)
    stage = None
    for i, line in enumerate(lines):
        if line.lower().startswith("stage reached in procedure"):
            rest = line[len("stage reached in procedure"):].strip(" :")
            stage = rest or (lines[i + 1] if i + 1 < len(lines) else None)
            break
    start = next((i for i, x in enumerate(lines) if x.lower() == "key events"), None)
    events = []
    if start is not None:
        i = start + 1
        while i < len(lines):
            low = lines[i].lower()
            if low in ("technical information", "documentation gateway", "additional information"):
                break
            m = DATE_RE.match(lines[i])
            if m:
                label = m.group(4) or (lines[i + 1] if i + 1 < len(lines) else "")
                if DATE_RE.match(label or ""):
                    label = ""
                events.append([f"{m.group(3)}-{m.group(2)}-{m.group(1)}", label[:160]])
            i += 1
    events.sort(key=lambda e: e[0])
    return {"stage": stage, "events": events}


def watch(now: datetime, force: bool = False) -> dict:
    cfg = load_config("lens/pipeline.json") or {}
    state = load_json(STATE_FILE, {}) or {}
    last = state.get("_last_run")
    if not force and last and parse_iso(last) > now - timedelta(hours=WATCH_EVERY_HOURS):
        return state
    robots = fetch_rss.Robots()
    for f in cfg.get("files", []):
        ref = f.get("oeil")
        if not ref:
            continue
        url = OEIL_URL.format(ref=urllib.parse.quote(ref, safe=""))
        rec = state.get(ref, {})
        rec["url"] = url
        rec["checked"] = iso(now)
        try:
            if not robots.allowed(url):
                raise RuntimeError("robots.txt disallows the page")
            parsed = parse_oeil(http_get(url, timeout=25, accept="text/html"))
            if not parsed["stage"] and not parsed["events"]:
                raise RuntimeError("page layout not recognised")
            latest = parsed["events"][-1] if parsed["events"] else None
            signature = f"{parsed['stage']}|{latest}"
            if rec.get("signature") and rec["signature"] != signature:
                rec["changed"] = iso(now)
            rec.update({"stage": parsed["stage"], "latest": latest, "events": parsed["events"][-6:],
                        "signature": signature, "error": None})
            rec.setdefault("first_seen", iso(now))
        except Exception as exc:  # the lens must never break the main update
            rec["error"] = f"{type(exc).__name__}: {str(exc)[:160]}"
        state[ref] = rec
    state["_last_run"] = iso(now)
    write_json(STATE_FILE, state, compact=False)
    return state


# ---------------------------------------------------------------- page data

def build(now: datetime, main_arts: list[dict], dates: list[str], fetch_status: dict | None = None) -> dict:
    issues_cfg = load_config("lens/issues.json") or {}
    pipe_cfg = load_config("lens/pipeline.json") or {}
    cal_cfg = load_config("lens/calendar.json") or {}
    src_cfg = load_config("lens/sources.json") or {}
    issues = issues_cfg.get("issues", [])
    matcher = SignalMatcher(issues)
    days = dates[-MEDIA_DAYS:]
    didx = {d: i for i, d in enumerate(days)}
    n = len(days)
    spec_arts = fetch_rss.load_articles(now - timedelta(days=MEDIA_DAYS), now, "lens")
    for a in spec_arts:
        a["_dt"] = parse_iso(a["published"])
    spec_arts.sort(key=lambda a: a["published"])

    def tag(arts, kind):
        out = []
        for a in arts:
            day = didx.get(local_date(a["_dt"]))
            if day is None:
                continue
            hits = matcher.match(a["title"], a.get("lede", ""), a.get("lang", "fi"))
            if hits:
                out.append((a, day, hits, kind))
        return out

    tagged = tag(main_arts, "main") + tag(spec_arts, "spec")
    last7 = set(range(n - 7, n))
    prev7 = set(range(n - 14, n - 7))
    main_days = sorted({local_date(a["_dt"]) for a in main_arts if local_date(a["_dt"]) in didx})
    first_main = main_days[0] if main_days else None
    first_spec = local_date(spec_arts[0]["_dt"]) if spec_arts else None

    issue_rows = []
    for iss in issues:
        iid = iss["id"]
        main_daily, spec_daily = [0] * n, [0] * n
        heads = []
        for a, day, hits, kind in tagged:
            if iid in hits:
                (main_daily if kind == "main" else spec_daily)[day] += 1
        for a, day, hits, kind in sorted(tagged, key=lambda x: x[0]["published"], reverse=True):
            if iid in hits and len(heads) < 8:
                heads.append({"t": a["title"], "u": a["url"], "s": a["source"], "p": a["published"], "k": kind})
        m7, s7 = sum(main_daily[i] for i in last7), sum(spec_daily[i] for i in last7)
        mp7, sp7 = sum(main_daily[i] for i in prev7), sum(spec_daily[i] for i in prev7)
        issue_rows.append({
            "id": iid, "fi": iss["fi"], "en": iss["en"], "context": bool(iss.get("context")), "status": iss.get("status"), "next": iss.get("next"),
            "next_date": iss.get("next_date"), "files": iss.get("files", []),
            "main7": m7, "spec7": s7, "main_prev7": mp7, "spec_prev7": sp7,
            "main_daily": main_daily, "spec_daily": spec_daily, "headlines": heads,
        })

    oeil = load_json(STATE_FILE, {}) or {}
    files = []
    for f in pipe_cfg.get("files", []):
        rec = oeil.get(f.get("oeil") or "", {})
        files.append({**{k: v for k, v in f.items() if not k.startswith("_")},
                      "official": None if not f.get("oeil") else {
                          "url": rec.get("url") or OEIL_URL.format(ref=urllib.parse.quote(f["oeil"], safe="")),
                          "stage": rec.get("stage"), "latest": rec.get("latest"), "changed": rec.get("changed"),
                          "checked": rec.get("checked"), "error": rec.get("error")}})

    today = local_date(now)
    events = []
    for e in cal_cfg.get("events", []):
        key = e.get("date") or e.get("sort")
        if key and key >= today:
            events.append({**e, "key": key})
    events.sort(key=lambda e: e["key"])

    by_src_7 = {}
    for a in spec_arts:
        if a["_dt"] > now - timedelta(days=7):
            by_src_7[a["source"]] = by_src_7.get(a["source"], 0) + 1
    fstatus = {s["id"]: s for s in (fetch_status or {}).get("sources", [])}
    sources = [{"id": s["id"], "name": s["name"], "homepage": s.get("homepage"), "lang": s.get("language"),
                "state": fstatus.get(s["id"], {}).get("state", "not_run"), "n7": by_src_7.get(s["id"], 0),
                "verified": s.get("verified", False)} for s in src_cfg.get("sources", [])]

    out = {
        "updated": iso(now), "today": today, "dates": days,
        "issues_checked": issues_cfg.get("checked"), "pipeline_checked": pipe_cfg.get("checked"),
        "since_main": first_main, "since_spec": first_spec,
        "stages": pipe_cfg.get("stages"), "stages_short": pipe_cfg.get("stages_short"), "issues": issue_rows, "files": files, "calendar": events,
        "sources": sources, "watch_last_run": oeil.get("_last_run"),
    }
    write_json(SITE_DATA_DIR / "lens.json", out)
    return {"issues": len(issue_rows), "files": len(files), "spec_articles": len(spec_arts)}
