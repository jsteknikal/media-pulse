# Media Pulse

Tracks which themes Finnish news media is covering, which are rising or fading, and which stories several outlets are running — plus a daily comparison with the Nordics, Europe and North America.

It costs nothing to run: GitHub Actions does the work every hour and GitHub Pages hosts the dashboard. There are no servers, databases or paid APIs.

## Setup (browser only, about 10 minutes)

1. **Create the repository.** On github.com, create a new **public** repository (e.g. `media-pulse`). Public keeps Actions minutes and Pages hosting free.
2. **Upload the files.** Open the empty repo → *uploading an existing file* → drag in every file and folder from this project → *Commit changes*. (Skip this if the code was pushed for you.)
3. **Turn on Pages.** *Settings → Pages → Build and deployment → Source:* choose **GitHub Actions**.
4. **Run the first update.** *Actions* tab → if asked, click *I understand my workflows, go ahead and enable them* → **Update Media Pulse** → **Run workflow**. Tick *Also pull regional GDELT data now* if you want the Regions page filled immediately (adds ~15 min).
5. **Open the dashboard** at `https://<your-username>.github.io/media-pulse/` (the link also appears in the finished workflow run).

After this it updates itself every hour. The **Update now** button on the dashboard opens the workflow page, where *Run workflow* triggers an update immediately.

If your repo isn't `jsteknikal/media-pulse`, change `repo` in `site/index.html` so the Update now button points to the right place.

## What to expect in the first days

- Trends need a baseline. Theme states show *Building baseline* until there is about a week of data; until then the shares and headlines still work.
- Only the three Yle feeds are verified. The other feed URLs are best guesses: if one fails, the pipeline looks for a feed link on the outlet's homepage. The **Sources** page shows what works, what failed and any feed it found — copy a found URL into `pipeline/config/sources.json` to make it permanent.
- The GDELT theme mapping for some themes (technology, culture, sport, housing) uses keyword queries and should be checked after the first regional pull; failed queries are listed on the Sources page.

## How it works

```
GitHub Actions (hourly)
  pipeline/fetch_rss.py    read public RSS feeds → new headlines appended to data/articles/YYYY/MM/DD/HH.jsonl
  pipeline/fetch_gdelt.py  once a day: theme volume + top headlines per region from the GDELT DOC API → data/gdelt/
  pipeline/analyze.py      tag themes, find names, group stories, score trends → site/data/*.json
  → commits data/ and publishes site/ to GitHub Pages
```

- **Themes** are matched with Finnish, Swedish and English word stems (`pipeline/config/themes.json`). No AI model is used, so tagging is approximate; add or remove stems to tune it. All history is re-tagged on every run, so edits apply retroactively.
- **Share** = a theme's articles in the last 48 hours ÷ all articles in that window. Its **normal** share is the average daily share 3–30 days ago.
- **States**: *Rising* / *Peaking* when the share is well above normal (score above 1.25, adjusted for how many outlets cover it), *Emerging* if it's new, *Fading* when well below normal and falling, otherwise *Steady*.
- **Stories** group headlines from the last 10 days by word similarity; a story needs 2+ outlets or 3+ articles.
- **Names** are capitalised words with Finnish case endings stripped (Kiinan, Kiinassa → Kiina). It's rough: expect some noise.
- **Regions** come from [GDELT](https://www.gdeltproject.org/), which monitors online news worldwide. Shares there are a theme's share of all tracked themes in that region, so regions compare like-for-like with each other (Finland is included via GDELT too).

## Copyright and fair use

Only headlines, the short description from the RSS feed, links and timestamps are stored — never full article text. The fetcher checks each site's robots.txt and identifies itself with a descriptive User-Agent. Finland's Copyright Act (section 13 b) allows text and data mining of lawfully accessible content unless the rightholder has reserved it; check outlets' terms before using this commercially or showing it to clients.

## Editing

All configuration is plain JSON and can be edited in the browser on GitHub (pencil icon):

- `pipeline/config/sources.json` — outlets and feed URLs; set `"active": false` to pause one.
- `pipeline/config/themes.json` — themes, stems, GDELT mapping.
- `pipeline/config/regions.json` — GDELT regions and their countries.

## Running locally (optional)

Python 3.10+ with no extra packages:

```
python pipeline/run.py                          # real fetch into data/
python -m unittest discover -s pipeline/tests   # tests
MP_DATA_DIR=/tmp/mp/data MP_SITE_DATA_DIR=site/data python pipeline/tests/make_sample.py   # sample data
MP_DATA_DIR=/tmp/mp/data MP_SKIP_FETCH=1 MP_GDELT=0 python pipeline/run.py
python -m http.server -d site 8000              # open http://localhost:8000
```

## Limits

- GitHub may delay scheduled runs by a few minutes at busy times.
- Repository size grows by roughly 100–200 MB a year from stored headlines.
- GitHub pauses scheduled workflows in repos with no activity for 60 days; the hourly data commits count as activity.
