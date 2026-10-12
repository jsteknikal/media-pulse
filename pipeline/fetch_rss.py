"""Fetch public RSS/Atom feeds and append new articles to data/articles/YYYY/MM/DD/HH.jsonl.

Only headline, short lede, link, time and categories are stored - never full article text.
"""
from __future__ import annotations

import json
import re
import urllib.parse
import urllib.robotparser
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

from common import (
    DATA_DIR, USER_AGENT, clean_text, http_get, iso, load_config, now_utc, parse_iso, short_hash, tokens,
)

ATOM = "{http://www.w3.org/2005/Atom}"
DC = "{http://purl.org/dc/elements/1.1/}"
LINK_ALT_RE = re.compile(
    r"<link[^>]+type=[\"']application/(?:rss|atom)\+xml[\"'][^>]*>", re.IGNORECASE
)
HREF_RE = re.compile(r"href=[\"']([^\"']+)[\"']", re.IGNORECASE)


def _text(el, *names):
    for name in names:
        found = el.find(name)
        if found is not None and (found.text or "").strip():
            return found.text
    return ""


def _parse_date(value: str | None):
    if not value:
        return None
    value = value.strip()
    try:
        dt = parsedate_to_datetime(value)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError, IndexError):
        pass
    try:
        return parse_iso(value)
    except ValueError:
        return None


def parse_feed(body: bytes) -> list[dict]:
    """Return raw items: title, link, summary, published (datetime|None), categories."""
    root = ET.fromstring(body)
    items = []
    for it in root.iter("item"):  # RSS 2.0 / RDF
        cats = [clean_text(c.text) for c in it.findall("category") if c.text]
        items.append({
            "title": _text(it, "title"),
            "link": _text(it, "link") or _text(it, "guid"),
            "summary": _text(it, "description", f"{DC}description"),
            "published": _parse_date(_text(it, "pubDate", f"{DC}date")),
            "categories": cats,
        })
    for it in root.iter(f"{ATOM}entry"):  # Atom
        link = ""
        for ln in it.findall(f"{ATOM}link"):
            if ln.get("rel", "alternate") == "alternate" and ln.get("href"):
                link = ln.get("href")
                break
        cats = [c.get("term") or c.get("label") for c in it.findall(f"{ATOM}category")]
        items.append({
            "title": _text(it, f"{ATOM}title"),
            "link": link,
            "summary": _text(it, f"{ATOM}summary", f"{ATOM}content"),
            "published": _parse_date(_text(it, f"{ATOM}published", f"{ATOM}updated")),
            "categories": [c for c in cats if c],
        })
    return items


def discover_feeds(homepage: str) -> list[str]:
    try:
        page = http_get(homepage, accept="text/html").decode("utf-8", "replace")
    except Exception:
        return []
    urls = []
    for tag in LINK_ALT_RE.findall(page):
        href = HREF_RE.search(tag)
        if href:
            urls.append(urllib.parse.urljoin(homepage, href.group(1)))
    return urls[:3]


class Robots:
    def __init__(self):
        self.cache: dict[str, urllib.robotparser.RobotFileParser | None] = {}

    def allowed(self, url: str) -> bool:
        parts = urllib.parse.urlsplit(url)
        host = f"{parts.scheme}://{parts.netloc}"
        if host not in self.cache:
            rp = urllib.robotparser.RobotFileParser()
            try:
                rp.parse(http_get(host + "/robots.txt", timeout=10).decode("utf-8", "replace").splitlines())
                self.cache[host] = rp
            except Exception:
                self.cache[host] = None  # no robots.txt reachable -> allowed
        rp = self.cache[host]
        return True if rp is None else rp.can_fetch(USER_AGENT, url)


def article_dir_for(dt: datetime):
    return DATA_DIR / "articles" / dt.strftime("%Y/%m/%d")


def iter_article_files(since: datetime, until: datetime):
    day = since.date()
    while day <= until.date():
        folder = DATA_DIR / "articles" / day.strftime("%Y/%m/%d")
        if folder.exists():
            yield from sorted(folder.glob("*.jsonl"))
        day += timedelta(days=1)


def load_articles(since: datetime, until: datetime) -> list[dict]:
    out = []
    for path in iter_article_files(since - timedelta(days=1), until):
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    art = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if since <= parse_iso(art["published"]) <= until + timedelta(hours=1):
                    out.append(art)
    return out


def normalize_title(title: str) -> str:
    return " ".join(tokens(title))


def run(now: datetime | None = None) -> dict:
    now = now or now_utc()
    config = load_config("sources.json")
    recent = load_articles(now - timedelta(days=7), now)
    seen_ids = {a["id"] for a in recent}
    seen_titles = {(a["source"], normalize_title(a["title"])) for a in recent}
    robots = Robots()
    status, new_articles = [], []

    for src in config["sources"]:
        if src.get("active", True) is False:
            status.append({"id": src["id"], "state": "disabled"})
            continue
        st = {"id": src["id"], "state": "ok", "fetched": 0, "new": 0, "errors": [], "feeds_used": []}
        feeds = list(src.get("feeds", []))
        tried_discovery = False
        got_any = False
        while feeds:
            url = feeds.pop(0)
            if not robots.allowed(url):
                st["errors"].append(f"robots.txt disallows {url}")
                continue
            try:
                items = parse_feed(http_get(url, accept="application/rss+xml, application/atom+xml, */*"))
            except Exception as exc:  # network, HTTP or XML errors
                st["errors"].append(f"{url}: {type(exc).__name__}: {str(exc)[:120]}")
                items = None
            if items is None and not feeds and not got_any and not tried_discovery and src.get("homepage"):
                tried_discovery = True
                found = [u for u in discover_feeds(src["homepage"]) if u not in src.get("feeds", [])]
                if found:
                    st["discovered"] = found
                    feeds.extend(found)
                continue
            if items is None:
                continue
            got_any = True
            st["feeds_used"].append(url)
            st["fetched"] += len(items)
            for raw in items:
                link = (raw["link"] or "").strip()
                title = clean_text(raw["title"], 300)
                if not link or not title:
                    continue
                aid = short_hash(link)
                tkey = (src["id"], normalize_title(title))
                if aid in seen_ids or tkey in seen_titles:
                    continue
                published = raw["published"] or now
                published = min(published.astimezone(now.tzinfo), now)
                if published < now - timedelta(days=7):
                    continue  # stale items re-surfacing in a feed
                seen_ids.add(aid)
                seen_titles.add(tkey)
                new_articles.append({
                    "id": aid,
                    "url": link,
                    "title": title,
                    "lede": clean_text(raw["summary"], 400),
                    "published": iso(published),
                    "fetched": iso(now),
                    "source": src["id"],
                    "lang": src.get("language", "fi"),
                    "cats": [c for c in raw["categories"] if c][:5],
                })
                st["new"] += 1
        if not got_any:
            st["state"] = "failed"
        elif st["errors"]:
            st["state"] = "partial"
        status.append(st)

    if new_articles:
        folder = article_dir_for(now)
        folder.mkdir(parents=True, exist_ok=True)
        with open(folder / f"{now:%H}.jsonl", "a", encoding="utf-8") as fh:
            for art in new_articles:
                fh.write(json.dumps(art, ensure_ascii=False) + "\n")

    return {"time": iso(now), "new_articles": len(new_articles), "sources": status}


if __name__ == "__main__":
    result = run()
    print(json.dumps({k: v for k, v in result.items() if k != "sources"}))
    for s in result["sources"]:
        print(f"  {s['id']:<14} {s['state']:<8} new={s.get('new', 0)} {'; '.join(s.get('errors', []))[:160]}")
