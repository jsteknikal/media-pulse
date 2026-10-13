"""Turn stored articles into dashboard data: themes, entities, stories, trend states.

Writes JSON files to site/data/. Everything is recomputed from the raw articles on each run,
so changing themes.json or the scoring constants re-tags the whole history.
"""
from __future__ import annotations

import math
import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta

from common import (
    SITE_DATA_DIR, SignalMatcher, ThemeMatcher, capitalized_words, entity_key, iso, load_config, local_date, now_utc,
    parse_iso, stem, tokens, write_json,
)
from fetch_rss import load_articles

HISTORY_DAYS = 120          # days of history loaded and charted
BASELINE_DAYS = (3, 30)     # window indices n-30 .. n-3, i.e. daily shares from 29 to 2 days before today
FULL_DAY_SHARE = 2 / 3      # share of active outlets that must publish on a day for it to count
MIN_BASELINE_DAYS = 7       # fewer usable days -> state "collecting"
MIN_DAY_TOTAL = 10          # a day needs this many articles to count in a baseline
STORY_WINDOW_DAYS = 10
STORY_ACTIVE_HOURS = 36     # an article can join a story updated within this many hours
STORY_SIMILARITY = 0.35     # cosine threshold for joining a story (TF-IDF on title + lede)
HEADLINE_DAYS = 3
SPEED_OUTLETS = 5           # "how fast a story forms" = hours until this many outlets carried it
WINDOW_MIN_OUTLETS = 5      # an opportunity window needs this many outlets in 48 h
LABEL_PREFIX_RE = re.compile(r"^(?:video|analyysi|kolumni|live|katso|tutkimus|näin|gallup|kuvat)\s*:\s*", re.I)


# ---------------------------------------------------------------- helpers

def mean_std(values):
    if not values:
        return 0.0, 0.0
    m = sum(values) / len(values)
    var = sum((v - m) ** 2 for v in values) / len(values)
    return m, math.sqrt(var)


def trend_state(score, slope, enough_baseline, is_new):
    if not enough_baseline:
        return "collecting"
    if is_new and score > 2:
        return "emerging"
    if score > 1.25:
        return "rising" if slope > 0 else "peaking"
    if score < -1 and slope < 0:
        return "fading"
    return "steady"


def round_share(x):
    return round(x, 5)


class Window:
    """Article counts by time window, used for 'now' vs baseline comparisons."""

    def __init__(self, now: datetime):
        self.now = now

    def within(self, dt, hours_from, hours_to=0):
        return self.now - timedelta(hours=hours_from) < dt <= self.now - timedelta(hours=hours_to)


# ---------------------------------------------------------------- main

def analyze(now: datetime | None = None, fetch_status: dict | None = None, gdelt: dict | None = None) -> dict:
    now = now or now_utc()
    themes_cfg = load_config("themes.json")["themes"]
    sources_cfg = load_config("sources.json")["sources"]
    regions_cfg = load_config("regions.json")["regions"]
    theme_ids = [t["id"] for t in themes_cfg]
    src_by_id = {s["id"]: s for s in sources_cfg}
    matcher = ThemeMatcher(themes_cfg)
    signals_cfg = (load_config("signals.json") or {}).get("signals", [])
    sig_matcher = SignalMatcher(signals_cfg)

    arts = load_articles(now - timedelta(days=HISTORY_DAYS), now)
    arts.sort(key=lambda a: a["published"])
    today = now.astimezone().date()
    dates = [local_date(now - timedelta(days=i)) for i in range(HISTORY_DAYS - 1, -1, -1)]
    didx = {d: i for i, d in enumerate(dates)}

    # ---- enrich
    surface_counts: dict[str, Counter] = defaultdict(Counter)
    vocab = set()
    for a in arts:
        a["_dt"] = parse_iso(a["published"])
        a["_day"] = didx.get(local_date(a["_dt"]))
        a["_themes"] = matcher.classify(a["title"], a.get("lede", ""), a.get("cats", []), a.get("lang", "fi"))
        a["_sig"] = sig_matcher.match(a["title"], a.get("lede", ""), a.get("lang", "fi"))
        caps = []
        for text in (a["title"], a.get("lede", "")):
            for surface, starts in capitalized_words(text):
                key = entity_key(surface)
                if key:
                    caps.append((key, surface, starts))
                    if not starts:
                        vocab.add(key)
        a["_caps"] = caps
    for a in arts:
        keys = set()
        for key, surface, starts in a["_caps"]:
            if key in vocab:
                keys.add(key)
                surface_counts[key][surface] += 1
        a["_ents"] = keys

    win = Window(now)
    n_days = len(dates)
    day_total = [0] * n_days
    day_sources: list[set] = [set() for _ in range(n_days)]
    for a in arts:
        if a["_day"] is not None:
            day_total[a["_day"]] += 1
            day_sources[a["_day"]].add(a["source"])
    # A day counts towards the normal level only when most outlets published that day ("full day").
    cutoff14 = now - timedelta(days=14)
    n_active = len({a["source"] for a in arts if a["_dt"] > cutoff14})
    full_min = max(3, math.ceil(FULL_DAY_SHARE * n_active))
    full_day = [day_total[i] >= MIN_DAY_TOTAL and len(day_sources[i]) >= full_min for i in range(n_days)]
    base_idx = [i for i in range(n_days - BASELINE_DAYS[1], n_days - BASELINE_DAYS[0] + 1)
                if 0 <= i < n_days and full_day[i]]
    enough_baseline = len(base_idx) >= MIN_BASELINE_DAYS
    trend_start = None
    if not enough_baseline:
        # Project when the 7th full day enters the window, assuming every day from today is full.
        win_start = n_days - BASELINE_DAYS[1]
        full_dates = [dates[i] for i in range(max(0, win_start), n_days - 1) if full_day[i]]
        today_d = datetime.fromisoformat(dates[-1]).date()
        k = 0
        while len(full_dates) < MIN_BASELINE_DAYS:
            full_dates.append((today_d + timedelta(days=k)).isoformat())
            k += 1
        seventh = datetime.fromisoformat(full_dates[MIN_BASELINE_DAYS - 1]).date()
        trend_start = (seventh + timedelta(days=BASELINE_DAYS[0] - 1)).isoformat()

    recent48 = [a for a in arts if win.within(a["_dt"], 48)]
    last72 = [a for a in arts if win.within(a["_dt"], 72)]
    prev72 = [a for a in arts if win.within(a["_dt"], 144, 72)]
    total48 = max(len(recent48), 1)

    # ---- themes
    t_count = {t: [0] * n_days for t in theme_ids}
    t_src = {t: [set() for _ in range(n_days)] for t in theme_ids}
    for a in arts:
        if a["_day"] is None:
            continue
        for t in a["_themes"]:
            t_count[t][a["_day"]] += 1
            t_src[t][a["_day"]].add(a["source"])

    def share_series(counts):
        return [round_share(c / day_total[i]) if day_total[i] else 0.0 for i, c in enumerate(counts)]

    def band_series(shares):
        band = []
        for i in range(n_days):
            prev = [shares[j] for j in range(max(0, i - 28), i) if full_day[j]]
            if len(prev) >= MIN_BASELINE_DAYS:
                m, s = mean_std(prev)
                band.append([round_share(max(0.0, m - s)), round_share(m + s)])
            else:
                band.append(None)
        return band

    def score_item(match, counts_series, weight_of_article=None):
        """Common scoring for a theme or entity. match(article) -> bool."""
        hits48 = [a for a in recent48 if match(a)]
        share_now = len(hits48) / total48
        shares = share_series(counts_series)
        base = [shares[i] for i in base_idx]
        m, s = mean_std(base)
        eps = max(0.002, 0.25 * m)
        z = (share_now - m) / (s + eps)
        srcs = {a["source"] for a in hits48}
        w = (sum(src_by_id.get(a["source"], {}).get("weight", 1.0) for a in hits48) / len(hits48)) if hits48 else 1.0
        score = z * (math.log1p(len(srcs)) / math.log1p(5)) * w
        a_share = sum(1 for a in last72 if match(a)) / max(len(last72), 1)
        b_share = sum(1 for a in prev72 if match(a)) / max(len(prev72), 1)
        slope = a_share - b_share
        is_new = sum(counts_series[i] for i in base_idx) == 0
        delta = (share_now / m - 1) if m > 0 else None
        if not enough_baseline:
            m, delta = None, None  # no trustworthy normal level yet: say nothing rather than guess
        return {
            "score": round(score, 2), "share_now": round_share(share_now),
            "baseline": None if m is None else round_share(m),
            "delta": None if delta is None else round(delta, 3), "n48": len(hits48), "sources48": len(srcs),
            "slope": round_share(slope),
            "state": trend_state(score, slope, enough_baseline, is_new),
        }, shares, hits48

    theme_stats = {}
    theme_series = {}
    for t in theme_ids:
        stats, shares, _ = score_item(lambda a, t=t: t in a["_themes"], t_count[t])
        theme_stats[t] = stats
        theme_series[t] = shares

    # ---- entities
    e_count: dict[str, list[int]] = {}
    e_total = Counter()
    for a in arts:
        for k in a["_ents"]:
            e_total[k] += 1
    keep = {k for k, n in e_total.items() if n >= 3}
    for k in keep:
        e_count[k] = [0] * n_days
    e_src48: dict[str, set] = defaultdict(set)
    for a in arts:
        if a["_day"] is None:
            continue
        for k in a["_ents"] & keep:
            e_count[k][a["_day"]] += 1
    for a in recent48:
        for k in a["_ents"] & keep:
            e_src48[k].add(a["source"])

    def display_name(key):
        forms = surface_counts[key]
        if not forms:
            return key
        top = max(forms.values())
        candidates = [f for f, n in forms.items() if n >= 0.2 * top]
        return min(candidates, key=lambda f: (len(f), -forms[f]))

    ent_theme_counts: dict[str, Counter] = defaultdict(Counter)
    cutoff30 = now - timedelta(days=30)
    for a in arts:
        if a["_dt"] > cutoff30 and a["_themes"]:
            for k in a["_ents"] & keep:
                ent_theme_counts[k].update(a["_themes"])

    def ent_themes(key):
        return [t for t, _ in ent_theme_counts[key].most_common(3)]

    candidates = sorted(keep, key=lambda k: -sum(e_count[k][-30:]))[:400]
    ent_rows = []
    for k in candidates:
        stats, _, hits = score_item(lambda a, k=k: k in a["_ents"], e_count[k])
        ent_rows.append({
            "key": k, "name": display_name(k), **stats,
            "n7": sum(e_count[k][-7:]), "n30": sum(e_count[k][-30:]),
            "spark": e_count[k][-30:],
        })
    for row in ent_rows:
        row["themes"] = ent_themes(row["key"]) if row["n30"] >= 3 else []
    ent_rows.sort(key=lambda r: -r["n30"])
    rising_entities = sorted(
        [r for r in ent_rows if r["n48"] >= 4 and r["sources48"] >= 2 and r["state"] in ("rising", "emerging", "peaking")],
        key=lambda r: -r["score"],
    )[:15]

    # ---- stories (greedy TF-IDF clustering over the last days)
    story_arts = [a for a in arts if a["_dt"] > now - timedelta(days=STORY_WINDOW_DAYS)]
    df = Counter()
    raw_vecs = []
    for a in story_arts:
        tf = Counter()
        for tok in tokens(a["title"]):
            s = stem(tok)
            if s:
                tf[s] += 2
        for tok in tokens(a.get("lede", "")):
            s = stem(tok)
            if s:
                tf[s] += 1
        raw_vecs.append(tf)
        df.update(tf.keys())
    n_docs = max(len(story_arts), 1)
    for a, tf in zip(story_arts, raw_vecs):
        vec = {t: c * (math.log((n_docs + 1) / (df[t] + 1)) + 1) for t, c in tf.items()}
        norm = math.sqrt(sum(v * v for v in vec.values())) or 1.0
        a["_vec"] = {t: v / norm for t, v in vec.items()}

    clusters = []  # each: {"sum": dict, "norm": float, "members": [art], "last": dt}
    index: dict[str, set[int]] = defaultdict(set)
    for a in story_arts:
        cand_scores = Counter()
        for t, v in a["_vec"].items():
            for ci in index.get(t, ()):
                c = clusters[ci]
                if c["last"] >= a["_dt"] - timedelta(hours=STORY_ACTIVE_HOURS):
                    cand_scores[ci] += v * c["sum"][t]
        best, best_sim = None, 0.0
        for ci, dot in cand_scores.items():
            sim = dot / clusters[ci]["norm"]
            if sim > best_sim:
                best, best_sim = ci, sim
        if best is not None and best_sim >= STORY_SIMILARITY:
            c = clusters[best]
            for t, v in a["_vec"].items():
                c["sum"][t] = c["sum"].get(t, 0.0) + v
                index[t].add(best)
            c["norm"] = math.sqrt(sum(v * v for v in c["sum"].values())) or 1.0
            c["members"].append(a)
            c["last"] = max(c["last"], a["_dt"])
        else:
            clusters.append({"sum": dict(a["_vec"]), "norm": 1.0, "members": [a], "last": a["_dt"]})
            for t in a["_vec"]:
                index[t].add(len(clusters) - 1)

    stories = []
    for c in clusters:
        members = c["members"]
        srcs = {m["source"] for m in members}
        if len(srcs) < 2 and len(members) < 3:
            continue

        def centrality(m):
            return sum(v * c["sum"].get(t, 0.0) for t, v in m["_vec"].items()) / c["norm"]

        ranked = sorted(members, key=lambda m: (m.get("lang") == "fi", centrality(m)), reverse=True)
        ranked = sorted(ranked[:6], key=lambda m: len(m["title"]))  # shortest of the most central = cleanest label
        tc = Counter(t for m in members for t in m["_themes"])
        themes = [t for t, n in tc.most_common(2) if n >= 0.3 * len(members)]
        ec = Counter(k for m in members for k in m["_ents"] & keep)
        n24 = sum(1 for m in members if win.within(m["_dt"], 24))
        first = min(m["_dt"] for m in members)
        reach_h = None
        seen_src = set()
        for m in sorted(members, key=lambda m: m["_dt"]):
            seen_src.add(m["source"])
            if len(seen_src) == SPEED_OUTLETS:
                reach_h = round((m["_dt"] - first).total_seconds() / 3600, 1)
                break
        heat = (n24 + 0.05 * len(members)) * math.log1p(len(srcs)) / (1 + (now - c["last"]).total_seconds() / 86400)
        stories.append({
            "id": "s" + members[0]["id"][:10],
            "label": LABEL_PREFIX_RE.sub("", ranked[0]["title"]),
            "first_seen": iso(first), "last_seen": iso(c["last"]),
            "n": len(members), "n24": n24, "sources": sorted(srcs), "themes": themes,
            "entities": [display_name(k) for k, _ in ec.most_common(5)],
            "first_source": min(members, key=lambda m: m["_dt"])["source"],
            "heat": round(heat, 3), "reach_h": reach_h,
            "articles": [
                {"t": m["title"], "u": m["url"], "s": m["source"], "p": m["published"]}
                for m in sorted(members, key=lambda m: m["_dt"])[:40]
            ],
        })
    stories.sort(key=lambda s: -s["heat"])
    stories = stories[:120]

    # ---- per-theme detail files
    band_cache = {}
    for t in theme_ids:
        band_cache[t] = band_series(theme_series[t])
        outlets = {}
        for days in (7, 30, 90):
            cutoff = now - timedelta(days=days)
            c = Counter(a["source"] for a in arts if t in a["_themes"] and a["_dt"] > cutoff)
            outlets[str(days)] = c.most_common()
        co = Counter()
        ec = Counter()
        cutoff30 = now - timedelta(days=30)
        heads = []
        for a in reversed(arts):
            if t not in a["_themes"]:
                continue
            if a["_dt"] > cutoff30:
                co.update(x for x in a["_themes"] if x != t)
                ec.update(a["_ents"] & keep)
            if len(heads) < 40:
                heads.append({"t": a["title"], "u": a["url"], "s": a["source"], "p": a["published"]})
        write_json(SITE_DATA_DIR / "themes" / f"{t}.json", {
            "id": t, **theme_stats[t],
            "series": [{"d": dates[i], "n": t_count[t][i], "src": len(t_src[t][i]), "sh": theme_series[t][i], "tot": day_total[i]}
                       for i in range(n_days)],
            "band": band_cache[t],
            "outlets": outlets,
            "co_themes": co.most_common(6),
            "entities": [{"key": k, "name": display_name(k), "n": n} for k, n in ec.most_common(15)],
            "stories": [s["id"] for s in stories if t in s["themes"]][:12],
            "headlines": heads,
        })

    # ---- pulse + other files
    articles24 = [a for a in arts if win.within(a["_dt"], 24)]
    kpis = {
        "articles24": len(articles24),
        "sources24": len({a["source"] for a in articles24}),
        "stories24": sum(1 for s in stories if s["n24"] > 0 and len(s["sources"]) >= 2),
        "articles_total": len(arts),
        "days_of_data": sum(1 for d in day_total if d > 0),
        "full_days": sum(1 for f in full_day if f),
        "untagged48": round(sum(1 for a in recent48 if not a["_themes"]) / total48, 3),
    }
    ranked_themes = sorted(theme_ids, key=lambda t: -theme_stats[t]["score"])
    write_json(SITE_DATA_DIR / "pulse.json", {
        "updated": iso(now), "baseline_ready": enough_baseline, "trend_start": trend_start,
        "full_days": len(base_idx), "full_min": full_min, "kpis": kpis,
        "dates": dates, "totals": day_total,
        "themes": [{"id": t, **theme_stats[t], "spark": theme_series[t][-30:]} for t in ranked_themes],
        "series": theme_series,
        "stories": [{k: v for k, v in s.items() if k != "articles"} for s in stories[:12]],
        "rising_entities": rising_entities,
        "top_entities": ent_rows[:15],
    })
    write_json(SITE_DATA_DIR / "stories.json", {"updated": iso(now), "stories": stories})
    write_json(SITE_DATA_DIR / "climate.json", build_climate(
        now, arts, dates, day_total, base_idx, enough_baseline, trend_start, signals_cfg, themes_cfg,
        theme_stats, stories, win))
    write_json(SITE_DATA_DIR / "entities.json", {"updated": iso(now), "entities": ent_rows[:200]})
    cutoff_h = now - timedelta(days=HEADLINE_DAYS)
    write_json(SITE_DATA_DIR / "headlines.json", {
        "updated": iso(now),
        "items": [
            {"t": a["title"], "l": a.get("lede", "")[:160], "u": a["url"], "s": a["source"],
             "p": a["published"], "th": a["_themes"]}
            for a in reversed(arts) if a["_dt"] > cutoff_h
        ],
    })

    # ---- sources status
    by_src_24 = Counter(a["source"] for a in articles24)
    by_src_7 = Counter(a["source"] for a in arts if a["_dt"] > now - timedelta(days=7))
    last_seen = {}
    for a in arts:
        last_seen[a["source"]] = a["published"]
    fstatus = {s["id"]: s for s in (fetch_status or {}).get("sources", [])}
    src_rows = []
    for s in sources_cfg:
        st = fstatus.get(s["id"], {})
        src_rows.append({
            "id": s["id"], "name": s["name"], "homepage": s.get("homepage"), "lang": s.get("language"),
            "type": s.get("type"), "verified": s.get("verified", False), "weight": s.get("weight", 1.0),
            "state": st.get("state", "not_run"), "new": st.get("new", 0), "errors": st.get("errors", []),
            "feeds_used": st.get("feeds_used", []), "discovered": st.get("discovered", []),
            "n24": by_src_24.get(s["id"], 0), "n7": by_src_7.get(s["id"], 0), "last": last_seen.get(s["id"]),
        })

    # ---- regions (GDELT layer)
    regions_out = build_regions(gdelt, regions_cfg, theme_ids, now) if gdelt else None
    if regions_out:
        write_json(SITE_DATA_DIR / "regions.json", regions_out)

    write_json(SITE_DATA_DIR / "meta.json", {
        "updated": iso(now),
        "themes": [{"id": t["id"], "fi": t["fi"], "en": t["en"]} for t in themes_cfg],
        "sources": src_rows,
        "regions": [{"id": r["id"], "fi": r["fi"], "en": r["en"]} for r in regions_cfg],
        "has_regions": bool(regions_out), "baseline_ready": enough_baseline, "trend_start": trend_start,
        "gdelt": (gdelt or {}).get("status"),
        "fetch": {k: v for k, v in (fetch_status or {}).items() if k not in ("sources", "lens")},
    })
    lens_out = None
    try:  # the sustainability lens must never break the main update
        import lens
        lens_out = lens.build(now, arts, dates, (fetch_status or {}).get("lens"))
    except Exception as exc:
        print(f"Lens build failed: {type(exc).__name__}: {exc}")
    return {"articles": len(arts), "stories": len(stories), "entities": len(ent_rows), "today": str(today),
            "lens": lens_out}


def build_climate(now, arts, dates, day_total, base_idx, enough_baseline, trend_start, signals_cfg, themes_cfg,
                  theme_stats, stories, win) -> dict:
    """Data for the front page: change-climate signals, opportunity windows, shifts, story speed."""
    n_days = len(dates)
    last7 = set(range(n_days - 7, n_days))
    prev7 = set(range(n_days - 14, n_days - 7))
    total7 = sum(day_total[i] for i in last7) or 1
    signals = []
    for sg in signals_cfg:
        sid = sg["id"]
        daily = [0] * n_days
        heads = []
        for a in arts:
            if sid in a["_sig"] and a["_day"] is not None:
                daily[a["_day"]] += 1
        for a in reversed(arts):
            if sid in a["_sig"] and a["_day"] in last7 and len(heads) < 8:
                heads.append({"t": a["title"], "u": a["url"], "s": a["source"], "p": a["published"]})
        n7 = sum(daily[i] for i in last7)
        p7 = sum(daily[i] for i in prev7)
        normal = delta = None
        if enough_baseline:
            shares = [daily[i] / day_total[i] for i in base_idx if day_total[i]]
            m = sum(shares) / len(shares) if shares else 0
            normal = round(m * total7, 1)
            delta = round((n7 / total7) / m - 1, 3) if m > 0 else None
        signals.append({"id": sid, "fi": sg["fi"], "en": sg["en"], "fi_about": sg.get("fi_about", sg["fi"]),
                        "en_about": sg.get("en_about", sg["en"]), "n7": n7, "prev7": p7,
                        "normal7": normal, "delta": delta, "daily": daily[-14:], "headlines": heads})

    window_ok = {t["id"] for t in themes_cfg if t.get("window", True)}
    recent24 = [a for a in arts if win.within(a["_dt"], 24)]
    tot24 = max(len(recent24), 1)
    zones = {"open": [], "peaking": [], "fading": []}
    for t, st in theme_stats.items():
        if t not in window_ok or not enough_baseline:
            continue
        row = {"id": t, **{k: st[k] for k in ("state", "score", "share_now", "baseline", "delta", "n48", "sources48")}}
        if st["state"] in ("emerging", "rising"):
            share24 = sum(1 for a in recent24 if t in a["_themes"]) / tot24
            if st["sources48"] >= WINDOW_MIN_OUTLETS and st["baseline"] and share24 > st["baseline"]:
                zones["open"].append(row)
        elif st["state"] == "peaking":
            zones["peaking"].append(row)
        elif st["state"] == "fading":
            zones["fading"].append(row)
    for z in zones.values():
        z.sort(key=lambda r: -abs(r["score"]))
    shifts = sorted(
        [{"id": t, "delta": st["delta"], "share_now": st["share_now"], "baseline": st["baseline"]}
         for t, st in theme_stats.items() if st["delta"] is not None and st["baseline"] and st["baseline"] >= 0.01],
        key=lambda r: -r["delta"])

    cutoff7 = now - timedelta(days=7)
    fast = [s for s in stories if s.get("reach_h") is not None and parse_iso(s["first_seen"]) > cutoff7]
    speed = None
    if fast:
        hrs = sorted(s["reach_h"] for s in fast)
        mid = len(hrs) // 2
        median = hrs[mid] if len(hrs) % 2 else (hrs[mid - 1] + hrs[mid]) / 2
        quickest = min(fast, key=lambda s: s["reach_h"])
        speed = {"outlets": SPEED_OUTLETS, "median_h": round(median, 1), "stories": len(fast),
                 "fastest": {k: quickest[k] for k in ("id", "label", "first_source", "first_seen", "reach_h")}
                 | {"outlets_total": len(quickest["sources"])}}
    return {"updated": iso(now), "baseline_ready": enough_baseline, "trend_start": trend_start,
            "signals": signals, "windows": zones, "shifts": shifts, "speed": speed,
            "articles7": sum(day_total[i] for i in last7)}


def build_regions(gdelt: dict, regions_cfg, theme_ids, now: datetime) -> dict | None:
    """Theme shares per region from stored GDELT daily counts (share of all tracked themes)."""
    series = gdelt.get("series") or {}
    if not series:
        return None
    end = now.date()
    days = [(end - timedelta(days=i)).isoformat() for i in range(89, -1, -1)]
    out = {"updated": iso(now), "dates": days, "fetched": gdelt.get("status", {}).get("last_run"), "regions": {}}
    for r in regions_cfg:
        rid = r["id"]
        per_theme = series.get(rid, {})
        if not per_theme:
            continue
        totals = [sum(per_theme.get(t, {}).get(d, 0) for t in theme_ids) for d in days]
        themes = {}
        for t in theme_ids:
            counts = [per_theme.get(t, {}).get(d, 0) for d in days]
            shares = [round_share(c / tot) if tot else 0.0 for c, tot in zip(counts, totals)]
            valid = [i for i, tot in enumerate(totals) if tot > 0]
            if not valid:
                continue
            last = valid[-2:] if len(valid) >= 2 else valid
            now_share = sum(counts[i] for i in last) / max(sum(totals[i] for i in last), 1)
            base_i = [i for i in valid if len(days) - 30 <= i <= len(days) - 4]
            m, s = mean_std([shares[i] for i in base_i])
            z = (now_share - m) / (s + max(0.002, 0.25 * m)) if base_i else 0.0
            a3 = [i for i in valid[-3:]]
            b3 = [i for i in valid[-6:-3]]
            slope = (sum(shares[i] for i in a3) / max(len(a3), 1)) - (sum(shares[i] for i in b3) / max(len(b3), 1))
            themes[t] = {
                "shares": shares, "counts": counts, "share_now": round_share(now_share), "baseline": round_share(m),
                "delta": round(now_share / m - 1, 3) if m else None, "score": round(z, 2),
                "state": trend_state(z, slope, len(base_i) >= MIN_BASELINE_DAYS, False),
                "headlines": gdelt.get("articles", {}).get(rid, {}).get(t, [])[:10],
            }
        out["regions"][rid] = {"totals": totals, "themes": themes}
    return out if out["regions"] else None


if __name__ == "__main__":
    print(analyze())
