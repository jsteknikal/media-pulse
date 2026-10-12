"""Shared helpers for the Media Pulse pipeline. Standard library only."""
from __future__ import annotations

import gzip
import hashlib
import html
import json
import os
import re
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    from zoneinfo import ZoneInfo
    HELSINKI = ZoneInfo("Europe/Helsinki")
except Exception:  # pragma: no cover - tzdata missing
    HELSINKI = timezone(timedelta(hours=3))

ROOT = Path(__file__).resolve().parent.parent
CONFIG_DIR = Path(__file__).resolve().parent / "config"
DATA_DIR = Path(os.environ.get("MP_DATA_DIR", ROOT / "data"))
SITE_DATA_DIR = Path(os.environ.get("MP_SITE_DATA_DIR", ROOT / "site" / "data"))
USER_AGENT = os.environ.get(
    "MP_USER_AGENT",
    "MediaPulse/0.1 (headline trend research; +https://github.com/jsteknikal/media-pulse)",
)


def now_utc() -> datetime:
    """Current time; MP_NOW (ISO) overrides it for tests and sample data."""
    override = os.environ.get("MP_NOW")
    if override:
        return parse_iso(override)
    return datetime.now(timezone.utc).replace(microsecond=0)


def parse_iso(value: str) -> datetime:
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def local_date(dt: datetime) -> str:
    return dt.astimezone(HELSINKI).strftime("%Y-%m-%d")


def load_json(path: Path, default=None):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def write_json(path: Path, obj, compact: bool = True) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as fh:
        if compact:
            json.dump(obj, fh, ensure_ascii=False, separators=(",", ":"))
        else:
            json.dump(obj, fh, ensure_ascii=False, indent=1)
    tmp.replace(path)


def load_config(name: str):
    return load_json(CONFIG_DIR / name)


def short_hash(text: str, n: int = 12) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:n]


def http_get(url: str, timeout: int = 20, accept: str = "*/*") -> bytes:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT, "Accept": accept, "Accept-Encoding": "gzip"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = resp.read()
        if resp.headers.get("Content-Encoding", "").lower() == "gzip":
            body = gzip.decompress(body)
        return body


# ---------------------------------------------------------------- text

TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")


def clean_text(value: str | None, limit: int | None = None) -> str:
    if not value:
        return ""
    text = html.unescape(TAG_RE.sub(" ", html.unescape(value)))
    text = WS_RE.sub(" ", text).strip()
    if limit and len(text) > limit:
        text = text[: limit - 1].rsplit(" ", 1)[0] + "…"
    return text


LETTERS = "a-zåäöéüæøõšž"
TOKEN_RE = re.compile(rf"[0-9{LETTERS}]+(?:[-:][0-9{LETTERS}]+)*")


def tokens(text: str) -> list[str]:
    """Lowercase word tokens. 'EU:n' -> 'eu'; 'mm-kisat' -> 'mm-kisat', 'mm', 'kisat'."""
    out: list[str] = []
    for raw in TOKEN_RE.findall(text.lower()):
        base = raw.split(":", 1)[0]
        if not base:
            continue
        out.append(base)
        if "-" in base:
            out.extend(p for p in base.split("-") if p)
    return out


STOPWORDS = set(
    """
    ja on ei se että oli kun mutta myös joka jotka jonka joita hän he me ne nyt vielä jo sen sitä siitä
    tämä tämän tänään mukaan kertoo kertoi sanoo sanoi voi ovat olla ole kuin tai jos niin sekä eli mitä
    mikä miten miksi missä kaikki uusi uuden yli alle noin vuoden vuonna viime ensi kaksi kolme yksi saa
    tulee pitää alkaa lisää ollut olivat olisi oltava eikä vain jälkeen aikana kanssa välillä myöhemmin
    hänen heidän meidän sinun minun mutta koska vaan ehkä aina koko osa osan paljon vähän enemmän
    och att det som en ett är på för med av till den har inte om de var ska kan sig efter nu också säger
    ny nya år under över mot vid eller men så än från hur när där här
    the a an and or of to in on for with by from at is are was were be been it its this that these those
    as after over into about says said new more than but not have has had will would could can his her
    their they we you he she after before up out
    analyysi video videot katso kuvat kuva tiedetään asiantuntija kommentoi näin tutkimus live seuraa
    päivitetty kolumni pääkirjoitus mielipide lukijalta gallery watch photos opinion
    """.split()
)


def stem(token: str) -> str | None:
    """Crude stem for similarity: drop stopwords/numbers, keep the first 6 letters."""
    if len(token) < 3 or token in STOPWORDS or token.isdigit():
        return None
    return token[:6]


# ---------------------------------------------------------------- themes

class ThemeMatcher:
    """Matches word stems from themes.json against tokens (see rules in the config note)."""

    def __init__(self, themes: list[dict]):
        self.themes = themes
        self.rules: dict[str, dict[str, list[tuple[str, str]]]] = {}
        for theme in themes:
            for lang, stems in theme.get("stems", {}).items():
                bucket = self.rules.setdefault(lang, {}).setdefault(theme["id"], [])
                for raw in stems:
                    raw = raw.lower()
                    if raw.startswith("^"):
                        bucket.append(("prefix", raw[1:]))
                    elif len(raw) <= 3:
                        bucket.append(("exact", raw))
                    elif len(raw) == 4:
                        bucket.append(("prefix", raw))
                    else:
                        bucket.append(("sub", raw))

    def _rules_for(self, lang: str):
        if lang in self.rules:
            return self.rules[lang].items()
        merged: dict[str, list] = {}
        for per_lang in self.rules.values():
            for tid, rules in per_lang.items():
                merged.setdefault(tid, []).extend(rules)
        return merged.items()

    @staticmethod
    def _hits(tok_set: set[str], rules) -> set[str]:
        found = set()
        for kind, s in rules:
            for tok in tok_set:
                if (kind == "exact" and tok == s) or (kind == "prefix" and tok.startswith(s)) or (
                    kind == "sub" and s in tok
                ):
                    found.add(s)
                    break
        return found

    def classify(self, title: str, lede: str, categories: list[str], lang: str, max_themes: int = 3):
        t_title = set(tokens(title))
        t_lede = set(tokens(lede)) - t_title
        t_cats = set(tokens(" ".join(categories)))
        scored = []
        for tid, rules in self._rules_for(lang):
            score = 2 * len(self._hits(t_title, rules)) + len(self._hits(t_lede, rules)) + 2 * len(
                self._hits(t_cats, rules)
            )
            if score >= 2:
                scored.append((score, tid))
        scored.sort(reverse=True)
        return [tid for _, tid in scored[:max_themes]]


# ---------------------------------------------------------------- entities

CAP_RE = re.compile(r"(?<![\w-])([A-ZÅÄÖ][a-zåäöéü]+(?:-[A-ZÅÄÖa-zåäö][a-zåäöéü]+)*|[A-ZÅÄÖ]{2,6})(?::[a-zåäö]+)?(?![\w-])")
SENTENCE_START_RE = re.compile(r"(?:^|[.!?:;]\s+|[\"“”«»–—-]\s*)$")
SUFFIXES = sorted(
    "lleen ineen issa issä ista istä illa illä ilta iltä ille iksi seen sta stä ssa ssä lla llä lta ltä lle ksi tta ttä han hen hin hon iin in en an än n a ä i".split(),
    key=len,
    reverse=True,
)
ENTITY_STOP = set(
    """
    yle stt hs is il mtv lännen media uutiset kuvat kuva video katso lue päivitetty tiistai keskiviikko
    torstai perjantai lauantai sunnuntai maanantai tammikuu helmikuu maaliskuu huhtikuu toukokuu kesäkuu
    heinäkuu elokuu syyskuu lokakuu marraskuu joulukuu monday tuesday wednesday thursday friday saturday
    sunday january february march april may june july august september october november december
    måndag tisdag onsdag torsdag fredag lördag söndag svenska nyheter news the this
    """.split()
)


def entity_key(word: str) -> str | None:
    w = word.lower()
    if w in ENTITY_STOP:
        return None
    if word.isupper():  # acronym
        return w if len(w) >= 2 else None
    base = w
    for _ in range(3):  # e.g. "ukrainassa" -> "ukraina" -> "ukrain" -> "ukra"
        for suf in SUFFIXES:
            if base.endswith(suf) and len(base) - len(suf) >= 4:
                base = base[: -len(suf)]
                break
    if len(base) < 3 or base in ENTITY_STOP or w.rstrip("n") in ENTITY_STOP:
        return None
    return base[:5]


def capitalized_words(text: str):
    """Yield (surface, is_sentence_start) for capitalised words and acronyms in text."""
    for m in CAP_RE.finditer(text):
        before = text[: m.start()]
        yield m.group(1), bool(SENTENCE_START_RE.search(before))
