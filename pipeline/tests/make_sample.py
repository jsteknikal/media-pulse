"""Generate synthetic articles (and GDELT counts) for local testing. Never run against real data/.

Usage: MP_DATA_DIR=/tmp/x python pipeline/tests/make_sample.py [days]
Built-in signals: energy spikes in the last 3 days, technology rises over the last week,
sport fades in the last 5 days - the analysis should report exactly these.
"""
from __future__ import annotations

import json
import os
import random
import sys
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import DATA_DIR, iso, load_config, now_utc, short_hash, write_json  # noqa: E402

PLACES = ["Helsingissä", "Tampereella", "Oulussa", "Turussa", "Kuopiossa", "Jyväskylässä", "Lahdessa", "Vaasassa"]
BANK = {
    "politics": [("Hallitus esittää muutoksia {p} kuntien rahoitukseen", "Pääministeri Orpo puolusti esitystä eduskunnassa."),
                 ("Eduskunta äänestää budjettiriihen päätöksistä", "Oppositio ja SDP vaativat muutoksia, Purra kommentoi."),
                 ("Kokoomuksen kannatus laskee uudessa kannatusmittauksessa", "Perussuomalaiset ja SDP nousevat Ylen kyselyssä."),
                 ("Ministeri Purra: valtionvelan kasvu taitettava", "Hallitus valmistelee lisäsäästöjä eduskunnalle.")],
    "economy": [("Inflaatio hidastui syyskuussa – euribor laskee", "Suomen Pankki arvioi korkojen laskevan edelleen."),
                ("Nokian liikevaihto ylitti odotukset", "Pörssi reagoi Nokian tulokseen nousulla Helsingissä."),
                ("Konkurssien määrä kasvoi {p}", "Yritysten konkurssit lisääntyivät erityisesti rakennusalalla."),
                ("Osakemarkkinat nousivat Helsingin pörssissä", "Sijoittajat odottavat EKP:n korkopäätöstä.")],
    "labour": [("Työttömyys kasvoi {p} – nuorisotyöttömyys huolestuttaa", "TEM:n mukaan työllisyysaste laski."),
               ("Ammattiliitto uhkaa lakolla satamissa", "SAK ja työnantajat neuvottelevat työehtosopimuksesta."),
               ("Yhtiö aloittaa muutosneuvottelut {p}", "Irtisanomisia uhkaa satoja työntekijöitä.")],
    "security": [("Puolustusvoimat harjoittelee Naton kanssa {p}", "Naton harjoitukseen osallistuu tuhansia sotilaita."),
                 ("Supo varoittaa Venäjän hybridivaikuttamisesta", "Suojelupoliisin mukaan kyberhyökkäykset lisääntyvät."),
                 ("Rajavartiolaitos havaitsi droonin itärajalla", "Puolustusministeri Häkkänen kommentoi tilannetta.")],
    "international": [("EU sopi uusista pakotteista Venäjää vastaan", "Komissio esittää pakotepakettia Brysselissä."),
                      ("Trump ja Zelenskyi tapasivat Washingtonissa", "Ukrainan sota ja rauhanneuvottelut olivat esillä."),
                      ("Ulkoministeri Valtonen vierailee Kiinassa", "Suomen ja Kiinan suhteet ovat koetuksella.")],
    "energy": [("Sähkön hinta nousi ennätykseen pakkasten vuoksi", "Fingrid varoittaa sähköpulasta, kun pakkanen kiristyy."),
               ("Olkiluodon ydinvoimala vikaantui – sähkön hinta nousi", "Sähköpörssissä hinta nousi yli euroon kilowattitunnilta."),
               ("Tuulivoiman tuotanto romahti tyynen sään vuoksi", "Sähkön hinta nousee, Fingrid seuraa tilannetta."),
               ("Ilmastopaneeli: päästöt eivät vähene tarpeeksi", "Ilmastotavoitteet karkaavat, sanoo ilmastopaneeli.")],
    "health": [("Hyvinvointialue sulkee terveysaseman {p}", "Potilaat siirtyvät naapurikunnan terveyskeskukseen."),
               ("Influenssarokotukset alkavat – THL suosittelee", "Rokotteita on saatavilla terveysasemilta."),
               ("Hoitajapula pahenee sairaaloissa", "Tehy ja Super vaativat lisää hoitajia.")],
    "technology": [("Tekoäly mullistaa työn – yritykset ottavat ChatGPT:n käyttöön", "OpenAI julkaisi uuden tekoälymallin."),
                   ("Suomalainen tekoälystartup keräsi miljoonarahoituksen", "Startup kehittää tekoälyä {p}."),
                   ("Tietoturvatutkija varoittaa huijausviesteistä", "Kyberturvallisuuskeskus kehottaa varovaisuuteen."),
                   ("EU:n tekoälysäädös astuu voimaan", "Tekoälyn käyttöä rajoitetaan uusilla säännöillä.")],
    "education": [("Opettajat vaativat lisää resursseja kouluihin", "OAJ:n mukaan luokkakoot kasvavat {p}."),
                  ("Yliopistojen hakijamäärät kasvoivat", "Helsingin yliopisto ja Aalto saivat eniten hakemuksia.")],
    "culture": [("Euroviisukarsinnan artistit julkistettiin", "Ylen UMK:ssa kilpailee seitsemän artistia."),
                ("Elokuvafestivaali alkaa {p}", "Festivaalilla nähdään kymmeniä kotimaisia elokuvia.")],
    "sport": [("Leijonat kaatui Ruotsille jääkiekon ottelussa", "Jääkiekkoleijonien valmentaja Jalonen pettyi."),
              ("Huuhkajat voitti ottelun ja jatkaa MM-karsinnoissa", "Jalkapallomaajoukkue juhli maalia lopussa."),
              ("Liigan kärkiottelu ratkesi jatkoajalla {p}", "Joukkue nousi sarjataulukon kärkeen.")],
    "crime": [("Poliisi tutkii henkirikosta {p}", "Kaksi epäiltyä on pidätetty, kertoo poliisi."),
              ("Käräjäoikeus tuomitsi miehen petoksesta", "Syyttäjä vaati ehdotonta vankeutta.")],
    "housing": [("Asuntojen hinnat laskivat {p}", "Kiinteistönvälittäjät odottavat asuntokaupan elpyvän."),
                ("VR:n junaliikenteessä häiriöitä", "Junat myöhästelevät rautatien vian vuoksi.")],
    "society": [("Kela muuttaa toimeentulotuen ehtoja", "Muutos koskee tuhansia perheitä."),
                ("Myrsky katkaisi sähköt tuhansilta {p}", "Sää rauhoittuu huomenna, ennustaa Ilmatieteen laitos."),
                ("Eläkeläisten köyhyys yleistyy", "Vanhusjärjestöt vaativat toimia.")],
}
BASE_WEIGHT = {"politics": 12, "economy": 12, "labour": 5, "security": 6, "international": 10, "energy": 5,
               "health": 6, "technology": 5, "education": 3, "culture": 5, "sport": 14, "crime": 8,
               "housing": 5, "society": 7}
PREFIX = ["", "", "", "Analyysi: ", "Video: ", "Tutkimus: ", "Näin: "]
SUFFIX = ["", "", "", " – asiantuntija kommentoi", " – katso kuvat", " – tämä tiedetään"]


def weight(theme, days_ago):
    w = BASE_WEIGHT[theme]
    if theme == "energy" and days_ago <= 2:
        w *= 4
    if theme == "technology" and days_ago <= 7:
        w *= 1 + (8 - days_ago) * 0.25
    if theme == "sport" and days_ago <= 4:
        w *= 0.35
    return w


def main(days: int = 60, per_day: int = 260, seed: int = 7):
    rng = random.Random(seed)
    now = now_utc()
    sources = [s["id"] for s in load_config("sources.json")["sources"] if s.get("language") == "fi"]
    themes = list(BANK)
    count = 0
    for d in range(days - 1, -1, -1):
        day_start = now - timedelta(days=d + 1)
        events = {t: [(rng.choice(BANK[t]), rng.choice(PLACES)) for _ in range(2)] for t in themes}
        ws = [weight(t, d) for t in themes]
        rows = []
        for i in range(per_day + rng.randint(-30, 30)):
            t = rng.choices(themes, ws)[0]
            (title, lede), place = rng.choice(events[t])
            title = rng.choice(PREFIX) + title.format(p=place) + rng.choice(SUFFIX)
            src = rng.choice(sources)
            ts = day_start + timedelta(minutes=rng.randint(0, 24 * 60 - 1))
            url = f"https://example.invalid/{src}/{d}/{i}"
            rows.append({"id": short_hash(url), "url": url, "title": title, "lede": lede.format(p=place),
                         "published": iso(ts), "fetched": iso(ts), "source": src, "lang": "fi", "cats": []})
        rows.sort(key=lambda r: r["published"])
        folder = DATA_DIR / "articles" / (day_start + timedelta(hours=12)).strftime("%Y/%m/%d")
        folder.mkdir(parents=True, exist_ok=True)
        with open(folder / "12.jsonl", "w", encoding="utf-8") as fh:
            for r in rows:
                fh.write(json.dumps(r, ensure_ascii=False) + "\n")
        count += len(rows)

    # fake GDELT history
    regions = [r["id"] for r in load_config("regions.json")["regions"]]
    series = {}
    for r_i, r in enumerate(regions):
        series[r] = {}
        for t in themes:
            series[r][t] = {}
            for d in range(days):
                day = (now - timedelta(days=d)).date().isoformat()
                base = BASE_WEIGHT[t] * (40 + 30 * r_i)
                if t == "technology" and r == "north_america" and d <= 5:
                    base *= 2.5
                series[r][t][day] = int(base * rng.uniform(0.8, 1.2))
    articles = {r: {t: [{"t": f"Sample {t} headline {k} ({r})", "u": "https://example.invalid/g",
                         "d": "example.com", "c": "Sample", "l": "English", "p": "20261012T080000Z"}
                        for k in range(3)] for t in themes} for r in regions}
    write_json(DATA_DIR / "gdelt" / "series.json", series)
    write_json(DATA_DIR / "gdelt" / "articles.json", articles)
    write_json(DATA_DIR / "gdelt" / "status.json", {"last_run": iso(now), "queries": 56, "ok": 56, "report": []})
    print(f"wrote {count} sample articles to {DATA_DIR}")


if __name__ == "__main__":
    if Path(DATA_DIR).resolve() == (Path(__file__).resolve().parents[2] / "data").resolve() and not os.environ.get("MP_ALLOW_REAL"):
        sys.exit("Refusing to write sample data into the real data/ folder. Set MP_DATA_DIR.")
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 60)
