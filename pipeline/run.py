"""Entry point used by the GitHub Action: fetch feeds, maybe pull GDELT, rebuild dashboard data."""
from __future__ import annotations

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))

from analyze import analyze  # noqa: E402
from common import now_utc  # noqa: E402
import fetch_gdelt  # noqa: E402
import fetch_rss  # noqa: E402
import lens  # noqa: E402


def main() -> int:
    now = now_utc()
    t0 = time.time()
    fetch_status = {"time": None, "new_articles": 0, "sources": []}
    if os.environ.get("MP_SKIP_FETCH") != "1":
        fetch_status = fetch_rss.run(now)
        print(f"RSS: {fetch_status['new_articles']} new articles")
        for s in fetch_status["sources"]:
            if s.get("state") != "ok":
                print(f"  ! {s['id']}: {s.get('state')} {'; '.join(s.get('errors', []))[:200]}")
    lens_status = None
    if os.environ.get("MP_SKIP_FETCH") != "1":
        try:  # the sustainability lens must never break the main update
            lens_status = lens.fetch(now)
            print(f"Lens feeds: {lens_status['new_articles']} new articles")
            for s in lens_status["sources"]:
                if s.get("state") != "ok":
                    print(f"  ! {s['id']}: {s.get('state')} {'; '.join(s.get('errors', []))[:200]}")
            state = lens.watch(now)
            for ref, rec in state.items():
                if not ref.startswith("_"):
                    print(f"  official record {ref}: {rec.get('title')} | {rec.get('stage')} | {rec.get('latest')} {rec.get('error') or ''}")
        except Exception as exc:
            print(f"Lens fetch failed: {exc}")
    fetch_status["lens"] = lens_status
    gdelt = None
    if os.environ.get("MP_GDELT", "1") == "0":
        print("GDELT: switched off (regional data comes from own feeds from phase 2)")
    else:
        try:
            gdelt = fetch_gdelt.run(now)
            st = gdelt.get("status") or {}
            print(f"GDELT: last run {st.get('last_run')}, {st.get('ok')}/{st.get('queries')} ok")
        except Exception as exc:  # GDELT must never break the hourly update
            print(f"GDELT failed: {exc}")
            gdelt = fetch_gdelt.load_state()
    result = analyze(now, fetch_status=fetch_status, gdelt=gdelt)
    print("Analysis:", json.dumps(result), f"({time.time() - t0:.0f}s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
