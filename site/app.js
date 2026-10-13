/* Media Pulse — dashboard app (vanilla JS, hash routing, fi/en). */
(function () {
  "use strict";
  const { esc, sparkline, shareBar, lineChart, dotTimeline, hbars } = window.Charts;
  const app = document.getElementById("app");
  const cfg = window.MP_CONFIG || {};

  /* ------------------------------------------------------------ i18n */
  const T = {
    fi: {
      nav: { front: "Yleiskuva", lens: "Kestävyys", pulse: "Teemat", stories: "Tarinat", names: "Nimet", regions: "Alueet", headlines: "Otsikot", sources: "Lähteet" },
      loading: "Ladataan…",
      noData: "Dataa ei vielä ole. Ensimmäinen päivitys täyttää näkymän – käynnistä se GitHubissa tai odota tasatuntia.",
      loadError: "Datan lataus epäonnistui",
      updated: "Päivitetty", updateNow: "Päivitä nyt", sources: "lähdettä",
      kpi: { articles24: "artikkelia 24 h", sources24: "lähdettä julkaissut 24 h", stories24: "tarinaa usealla medialla 24 h", days: "täyttä päivää dataa" },
      state: { emerging: "Uusi nousija", rising: "Nousussa", peaking: "Huipussa", fading: "Hiipumassa", steady: "Tasainen", collecting: "Kerää vertailua" },
      lead: (th, now, base) => `${th} nousee: ${now} uutisista viimeiset 48 tuntia, kun normaali on ${base}.`,
      leadPeak: (th, now, base) => `${th} on huipussa: ${now} uutisista viimeiset 48 tuntia, normaali ${base}.`,
      leadCalm: "Ei selviä nousijoita – uutisaiheet ovat tavanomaisella tasollaan.",
      leadCollecting: (d) => `Trendit käynnistyvät ${d}. Siihen asti näet, mistä media puhuu nyt: osuudet, tarinat ja nimet.`,
      normalFrom: (d) => `Normaali taso ja muutos näkyvät ${d} alkaen, kun vertailudataa on viikolta kaikista medioista.`,
      alsoRising: (list) => `Myös ${list} nousevat.`,
      alsoFading: (list) => `${list} hiipuu.`,
      boardTitle: "Teemat nyt",
      boardNote: "Osuus = teeman artikkelit viimeisten 48 tunnin uutisista. Pystyviiva on teeman tavallinen osuus edeltävien neljän viikon ajalta.",
      col: { theme: "Teema", state: "Tila", share: "Osuus nyt · normaali", trend: "30 pv", change: "Muutos" },
      untagged: (p) => `${p} artikkeleista ei osunut mihinkään teemaan.`,
      topStories: "Tarinat nyt", topStoriesNote: "Usean median samasta aiheesta tekemät jutut, ryhmiteltynä.",
      risingNames: "Nousevat nimet", mostNamed: "Mainituimmat 30 pv",
      articles: "artikkelia", outlets: "mediaa", firstBy: "Ensimmäisenä",
      allStories: "Kaikki tarinat", noStories: "Ei vielä tarinoita, joita useampi media olisi uutisoinut.",
      share: "Osuus uutisista", normalRange: "Normaali vaihteluväli", normal: "normaali",
      themeStatement: (th, now, base) => `${th}: ${now} uutisista viimeiset 48 tuntia. Normaali osuus on ${base}.`,
      themeStatementNow: (th, now) => `${th}: ${now} uutisista viimeiset 48 tuntia.`,
      showTable: "Näytä taulukkona", hideTable: "Piilota taulukko",
      date: "Päivä", count: "Artikkeleita", byOutlet: "Kuka uutisoi", namesInTheme: "Nimet teemassa (30 pv)",
      relatedThemes: "Usein samassa jutussa", latest: "Tuoreimmat otsikot", storiesInTheme: "Teeman tarinat",
      days: (n) => `${n} pv`,
      lblTheme: "Teema", lblSource: "Media", lblSearch: "Hae otsikoista", lblSearchNames: "Hae nimeä", period: "Aikaväli", skip: "Siirry sisältöön",
      filterTheme: "Kaikki teemat", filterSource: "Kaikki mediat", search: "Hae otsikoista…", searchNames: "Hae nimeä…",
      shownOf: (a, b) => `Näytetään ${a} / ${b}`,
      namesTitle: "Nimet uutisissa", namesNote: "Henkilöt, organisaatiot ja paikat, tunnistettu isoista alkukirjaimista. Taivutusmuodot yhdistetään karkeasti.",
      ncol: { name: "Nimi", n48: "48 h", n7: "7 pv", n30: "30 pv", trend: "30 pv", themes: "Teemat" },
      regionsTitle: "Teemat alueittain",
      regionsNote: "Muutos tavalliseen osuuteen nähden. Lähde: GDELT, joka seuraa verkkomediaa maailmanlaajuisesti; osuus = teeman osuus kaikista seuratuista teemoista alueella. Suomi on tässä mukana GDELTin kautta, jotta alueet ovat vertailukelpoisia.",
      regionsEmpty: "Pohjoismaat, Eurooppa, Pohjois-Amerikka ja Lähi-itä ovat tulossa. Ne luetaan kunkin alueen omista medioista samalla tavalla kuin Suomi.",
      compareTitle: (th) => `${th} eri alueilla`, regionHeadlines: "Alueiden otsikot (24 h)", pickTheme: "Valitse teema",
      headlinesTitle: "Otsikot", headlinesNote: "Kaikki haetut otsikot kolmelta viime päivältä. Linkit vievät alkuperäiseen juttuun.",
      sourcesTitle: "Lähteet", sourcesNote: "Seurattavat mediat ja viimeisimmän haun tila. Syötteitä voi lisätä tai korjata tiedostossa pipeline/config/sources.json.",
      scol: { outlet: "Media", status: "Tila", n24: "24 h", n7: "7 pv", last: "Viimeisin", notes: "Huomiot" },
      sstate: { ok: "Toimii", partial: "Osittain", failed: "Ei toimi", disabled: "Pois päältä", not_run: "Ei haettu" },
      types: { public_broadcaster: "yleisradio", national_daily: "valtakunnallinen päivälehti", tabloid: "iltapäivälehti", commercial_tv: "kaupallinen tv", business: "talousmedia", regional: "maakuntalehti", online: "verkkomedia" },
      unverified: "Syötteen osoite tarkistamatta", discovered: "Löytyi syöte:", gdeltTitle: "GDELT-aluedata",
      gdeltStatus: (ok, q, when) => `${ok}/${q} hakua onnistui, viimeksi ${when}.`, gdeltNever: "GDELT-hakua ei ole vielä tehty.",
      gdeltFailed: "Epäonnistuneet haut",
      footer: "Data: suomalaisten medioiden julkiset RSS-syötteet. Vain otsikot ja linkit alkuperäiseen julkaisuun. Päivittyy automaattisesti päivän mittaan.",
      ago: (h) => (h < 1 ? "alle tunti sitten" : h < 24 ? `${Math.round(h)} h sitten` : `${Math.round(h / 24)} pv sitten`),
      back: "Takaisin", openArticle: "Avaa juttu",
      front: {
        heroOpen: (th) => `${th} nousee: ikkuna vaikuttaa keskusteluun on nyt auki.`,
        heroOpenSub: (now, base) => `${now} uutisista viimeiset 48 tuntia, kun normaali on ${base}.`,
        heroPeak: (th) => `Ei avautuvia ikkunoita juuri nyt: ${th} hallitsee uutisia.`,
        heroNone: "Ei avautuvia ikkunoita tällä viikolla.",
        heroNoneSub: "Uutisaiheet ovat tavanomaisella tasollaan. Hiljainen viikko on hyvä hetki viestiä.",
        alsoPeak: (th) => `${th} on huipussaan: siihen ehtisi enää reagoida.`,
        heroSignal: (n, about) => `Viime seitsemän päivän aikana suomalainen media julkaisi ${n} otsikkoa ${about}.`,
        heroSignalNone: "Muutosilmasto: mistä suomalainen media puhuu nyt ja mitä se tarkoittaa muutokselle.",
        preTrend: (d) => `Ikkunat ja muutokset normaaliin näkyvät ${d} alkaen, kun vertailudataa on kertynyt viikolta. Siihen asti sivu näyttää, mistä puhutaan nyt.`,
        cycleTitle: "Missä vaiheessa kukin aihe on",
        cycleNote: "Jokainen aihe nousee, huipentuu ja hiipuu. Mitä aiemmin aiheeseen tarttuu, sitä enemmän voi vaikuttaa siihen, miten siitä puhutaan.",
        zoneOpen: "Ikkuna auki", zoneOpenNote: "Kehys ei ole vielä lukittunut: voit vaikuttaa siihen.",
        zonePeak: "Reagoit", zonePeakNote: "Keskustelu on jo käynnissä, kehys on asettunut.",
        zoneFade: "Huomio siirtynyt", zoneFadeNote: "Hiljenevä aihe: rauhallinen hetki viestiä.",
        zoneEmpty: "Ei aiheita nyt", zoneFrom: (d) => `Näkyy ${d} alkaen`,
        climateTitle: "Muutosilmasto",
        climateNote: "Uutiset, joiden läpi ihmiset lukevat muutosta. Otsikoiden määrä viimeisen seitsemän päivän aikana.",
        climateLead: (label, n, x) => `${label}: ${n} otsikkoa tällä viikolla, ${x} normaalia enemmän. Muutoksia luetaan nyt tätä taustaa vasten.`,
        headlines7: "otsikkoa 7 pv", vsNormal: "normaaliin", normalFromShort: (d) => `normaali ${d} alkaen`,
        showHeadlines: "Näytä otsikot", noHeadlines: "Ei otsikoita tällä viikolla.",
        shiftTitle: "Huomio on nollasummapeliä",
        shiftNote: "Kun yksi aihe kasvaa, muut jäävät sen alle. Älä julkaise muutosta uutismyrskyn keskelle.",
        shiftLead: (up, d1, down, d2) => `${up}: ${d1} normaalia enemmän. ${down}: ${d2} vähemmän.`,
        speedTitle: "Kuinka nopeasti kertomus muodostuu",
        speedLead: (k, h) => `Viikon suurimmat uutiset ehtivät ${k} mediaan tyypillisesti ${h}.`,
        speedFast: (label, src, k, h) => `Nopein: ”${label}”. Ensimmäisenä ${src}, ${k} mediassa ${h}.`,
        speedNote: "Sen ajan organisaatiolla on, ennen kuin muut asettavat kehyksen.",
        speedNone: "Tällä viikolla mikään uutinen ei ole vielä levinnyt viiteen mediaan.",
        within: (h) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} minuutissa` : `${String(Math.round(h * 10) / 10).replace(".", ",")} tunnissa`),
        seeThemes: "Kaikki teemat", seeStory: "Avaa tarina",
      },
      lens: {
        title: "Kestävyys",
        heroNext: (n, what) => (n === 0 ? `Tänään: ${what}.` : n === 1 ? `Huomenna: ${what}.` : `${n} päivää: ${what}.`),
        heroSub: (k, m) => `Kestävyyslinssi seuraa ${k} aihetta ja ${m} valmisteilla olevaa säädöstä virallisista asiakirjoista mediaan, jotta muutoksen näkee ennen kuin siitä tulee otsikkouutinen.`,
        checked: (d) => `Säädösten tila tarkistettu käsin ${d}`,
        issuesTitle: "Aiheet", issuesNote: "Missä kukin aihe on nyt, seuraava virallinen askel ja kuinka paljon siitä kirjoitetaan.",
        col: { issue: "Aihe", stands: "Missä ollaan", next: "Seuraava askel", media: "Otsikoita 7 pv", trend: "14 pv" },
        mainstream: "Valtamedia", specialist: "Erikoismedia", mainShort: "valta", specShort: "erikois",
        inDays: (n) => (n === 0 ? "tänään" : n === 1 ? "huomenna" : `${n} päivän päästä`),
        showHeadlines: "Näytä otsikot", noHeadlines: "Ei osumia vielä.",
        pipeTitle: "Valmisteilla", pipeNote: "Säädökset, joita vielä kirjoitetaan, vaiheittain. Mitä aiempi vaihe, sitä enemmän tilaa vaikuttaa lopputulokseen.",
        roomToShape: "Tilaa vaikuttaa", pcol: { file: "Säädös", stage: "Vaihe", next: "Seuraava askel", timing: "Aikataulu" },
        stageAria: (name, stalled) => `Vaihe: ${name}${stalled ? " (jumissa)" : ""}`,
        official: "Virallinen tila", latestEvent: "viimeisin", changed: (a) => `Muuttui ${a}`, recordError: "Virallista tietoa ei saatu luettua tällä kertaa.",
        notRead: "Luetaan seuraavassa päivityksessä.",
        coverageTitle: "Kuinka paljon aiheesta kirjoitetaan", coverageNote: "Otsikot päivittäin. Erikoismedia liikkuu tyypillisesti ensin; valtamedia seuraa, kun aihe koskettaa laajemmin.",
        pickIssue: "Aihe", since: (a, b) => `Valtamedia laskettu ${a} alkaen${b ? `, erikoismedia ${b} alkaen` : ", erikoismedian syötteet alkavat seuraavassa päivityksessä"}.`,
        context: (n, name) => `Vertailun vuoksi: ${name.toLowerCase()}: ${n} otsikkoa 7 päivässä.`,
        calTitle: "Tulossa", calNote: "Tiedossa olevat päivät, joihin linssi laskee.", ccol: { when: "Milloin", what: "Mitä", issue: "Aihe" },
        sourcesTitle: "Erikoismedian lähteet", sourcesNote: "Linssin omat syötteet, erillään päälähteistä, jotta ne eivät muuta Media Pulsen trendien vertailutasoa.",
        all: "Kaikki", eu: "EU", fi: "Suomi",
        method: "Säädösten vaiheet ja päivämäärät on tarkistettu käsin virallisista lähteistä; Euroopan parlamentin lainsäädäntötietokannassa olevat säädökset luetaan automaattisesti. Mediaosumat lasketaan otsikoista ja ingresseistä sanalistoilla.",
      },
    },
    en: {
      nav: { front: "Overview", lens: "Sustainability", pulse: "Themes", stories: "Stories", names: "Names", regions: "Regions", headlines: "Headlines", sources: "Sources" },
      loading: "Loading…",
      noData: "No data yet. The first update fills this page – start it on GitHub or wait for the top of the hour.",
      loadError: "Could not load data",
      updated: "Updated", updateNow: "Update now", sources: "sources",
      kpi: { articles24: "articles in 24 h", sources24: "outlets published in 24 h", stories24: "stories across outlets in 24 h", days: "full days of data" },
      state: { emerging: "Emerging", rising: "Rising", peaking: "Peaking", fading: "Fading", steady: "Steady", collecting: "Building baseline" },
      lead: (th, now, base) => `${th} is rising: ${now} of news in the last 48 hours, against ${base} normally.`,
      leadPeak: (th, now, base) => `${th} is peaking: ${now} of news in the last 48 hours, against ${base} normally.`,
      leadCalm: "No clear risers – news themes are at their usual levels.",
      leadCollecting: (d) => `Trends start on ${d}. Until then you see what the media is covering now: shares, stories and names.`,
      normalFrom: (d) => `Normal levels and change appear from ${d}, once there is a week of full days from all outlets.`,
      alsoRising: (list) => `${list} are also rising.`,
      alsoFading: (list) => `${list} is fading.`,
      boardTitle: "Themes now",
      boardNote: "Share = the theme's articles in the last 48 hours of news. The tick marks its usual share over the previous four weeks.",
      col: { theme: "Theme", state: "State", share: "Share now · normal", trend: "30 days", change: "Change" },
      untagged: (p) => `${p} of articles matched no theme.`,
      topStories: "Stories now", topStoriesNote: "Coverage of the same event by several outlets, grouped.",
      risingNames: "Rising names", mostNamed: "Most mentioned, 30 days",
      articles: "articles", outlets: "outlets", firstBy: "First by",
      allStories: "All stories", noStories: "No stories covered by several outlets yet.",
      share: "Share of news", normalRange: "Normal range", normal: "normal",
      themeStatement: (th, now, base) => `${th}: ${now} of news in the last 48 hours. Its normal share is ${base}.`,
      themeStatementNow: (th, now) => `${th}: ${now} of news in the last 48 hours.`,
      showTable: "Show as table", hideTable: "Hide table",
      date: "Date", count: "Articles", byOutlet: "Who covers it", namesInTheme: "Names in this theme (30 days)",
      relatedThemes: "Often in the same article", latest: "Latest headlines", storiesInTheme: "Stories in this theme",
      days: (n) => `${n} d`,
      lblTheme: "Theme", lblSource: "Outlet", lblSearch: "Search headlines", lblSearchNames: "Search names", period: "Time range", skip: "Skip to content",
      filterTheme: "All themes", filterSource: "All outlets", search: "Search headlines…", searchNames: "Search names…",
      shownOf: (a, b) => `Showing ${a} of ${b}`,
      namesTitle: "Names in the news", namesNote: "People, organisations and places, detected from capitalised words. Finnish case forms are merged roughly.",
      ncol: { name: "Name", n48: "48 h", n7: "7 d", n30: "30 d", trend: "30 days", themes: "Themes" },
      regionsTitle: "Themes by region",
      regionsNote: "Change against each theme's normal share. Source: GDELT, which monitors online news worldwide; share = the theme's share of all tracked themes in the region. Finland appears here via GDELT so the regions are comparable.",
      regionsEmpty: "The Nordics, Europe, North America and the Middle East are coming, read from each region's own outlets in the same way as Finland.",
      compareTitle: (th) => `${th} across regions`, regionHeadlines: "Regional headlines (24 h)", pickTheme: "Pick a theme",
      headlinesTitle: "Headlines", headlinesNote: "Every headline collected in the last three days. Links go to the original article.",
      sourcesTitle: "Sources", sourcesNote: "Outlets tracked and the status of the latest fetch. Add or fix feeds in pipeline/config/sources.json.",
      scol: { outlet: "Outlet", status: "Status", n24: "24 h", n7: "7 d", last: "Latest", notes: "Notes" },
      sstate: { ok: "Working", partial: "Partly", failed: "Failing", disabled: "Disabled", not_run: "Not fetched" },
      types: { public_broadcaster: "public broadcaster", national_daily: "national daily", tabloid: "tabloid", commercial_tv: "commercial TV", business: "business media", regional: "regional daily", online: "online news" },
      unverified: "Feed URL not yet verified", discovered: "Found feed:", gdeltTitle: "GDELT regional data",
      gdeltStatus: (ok, q, when) => `${ok}/${q} queries succeeded, last run ${when}.`, gdeltNever: "No GDELT pull yet.",
      gdeltFailed: "Failed queries",
      footer: "Data: public RSS feeds of Finnish outlets. Headlines only, linking to the original publisher. Updates automatically through the day.",
      ago: (h) => (h < 1 ? "under an hour ago" : h < 24 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} d ago`),
      back: "Back", openArticle: "Open article",
      front: {
        heroOpen: (th) => `${th} is rising: the window to shape that conversation is open now.`,
        heroOpenSub: (now, base) => `${now} of news in the last 48 hours, against ${base} normally.`,
        heroPeak: (th) => `No windows opening right now: ${th} dominates the news.`,
        heroNone: "No windows are opening this week.",
        heroNoneSub: "News themes are at their usual levels. A quiet week is a good moment to communicate.",
        alsoPeak: (th) => `${th} is peaking: you would be reacting, not shaping.`,
        heroSignal: (n, about) => `In the past seven days, Finnish media ran ${n} headlines on ${about}.`,
        heroSignalNone: "The change climate: what Finnish media is discussing now, and what it means for change.",
        preTrend: (d) => `Windows and changes against normal appear from ${d}, once there is a week of data to compare with. Until then, this page shows what is being discussed now.`,
        cycleTitle: "Where each issue is on its cycle",
        cycleNote: "Every issue rises, peaks and fades. The earlier you engage, the more you can shape how it is framed.",
        zoneOpen: "Window open", zoneOpenNote: "The framing isn't set yet: you can still shape it.",
        zonePeak: "You'd be reacting", zonePeakNote: "The conversation is under way and the framing is set.",
        zoneFade: "Attention has moved on", zoneFadeNote: "A quieting issue: a calm moment to communicate.",
        zoneEmpty: "No issues now", zoneFrom: (d) => `Shown from ${d}`,
        climateTitle: "The change climate",
        climateNote: "The news people read change through. Headlines in the past seven days.",
        climateLead: (label, n, x) => `${label}: ${n} headlines this week, ${x} above normal. Expect change to be read through that lens.`,
        headlines7: "headlines, 7 days", vsNormal: "vs normal", normalFromShort: (d) => `normal from ${d}`,
        showHeadlines: "Show headlines", noHeadlines: "No headlines this week.",
        shiftTitle: "Attention is zero-sum",
        shiftNote: "When one issue surges, others are pushed out. Don't announce change into a news storm.",
        shiftLead: (up, d1, down, d2) => `${up}: ${d1} above normal. ${down}: ${d2} below.`,
        speedTitle: "How fast narratives form",
        speedLead: (k, h) => `This week's biggest stories typically reached ${k} outlets ${h}.`,
        speedFast: (label, src, k, h) => `The fastest: “${label}”. ${src} first, ${k} outlets ${h}.`,
        speedNote: "That is the time an organisation has before others set the framing.",
        speedNone: "No story has reached five outlets yet this week.",
        within: (h) => (h < 1 ? `within ${Math.max(1, Math.round(h * 60))} minutes` : `within ${Math.round(h * 10) / 10} hours`),
        seeThemes: "All themes", seeStory: "Open story",
      },
      lens: {
        title: "Sustainability",
        heroNext: (n, what) => (n === 0 ? `Today: ${what}.` : n === 1 ? `Tomorrow: ${what}.` : `${n} days to go: ${what}.`),
        heroSub: (k, m) => `The sustainability lens follows ${k} issues and ${m} rules in preparation, from official records to media coverage, so you see change coming before it becomes headline news.`,
        checked: (d) => `Rule status hand-checked on ${d}`,
        issuesTitle: "Issues", issuesNote: "Where each issue stands, its next formal step and how much it is being written about.",
        col: { issue: "Issue", stands: "Where it stands", next: "Next step", media: "Headlines, 7 days", trend: "14 days" },
        mainstream: "Mainstream", specialist: "Specialist", mainShort: "main", specShort: "spec.",
        inDays: (n) => (n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`),
        showHeadlines: "Show headlines", noHeadlines: "No matches yet.",
        pipeTitle: "In preparation", pipeNote: "Rules still being written, by stage. The earlier the stage, the more room to shape the outcome.",
        roomToShape: "Room to shape", pcol: { file: "Rule", stage: "Stage", next: "Next step", timing: "Timing" },
        stageAria: (name, stalled) => `Stage: ${name}${stalled ? " (stalled)" : ""}`,
        official: "Official record", latestEvent: "latest", changed: (a) => `Changed ${a}`, recordError: "The official record could not be read this time.",
        notRead: "Read on the next update.",
        coverageTitle: "How much the issue is written about", coverageNote: "Headlines per day. Specialist media usually moves first; mainstream follows when an issue touches more people.",
        pickIssue: "Issue", since: (a, b) => `Mainstream counted since ${a}${b ? `, specialist since ${b}` : "; specialist feeds start with the next update"}.`,
        context: (n, name) => `For comparison, ${name.toLowerCase()}: ${n} headlines in 7 days.`,
        calTitle: "Coming up", calNote: "Known dates the lens counts down to.", ccol: { when: "When", what: "What", issue: "Issue" },
        sourcesTitle: "Specialist sources", sourcesNote: "The lens's own feeds, kept apart from the main outlets so they do not change Media Pulse's trend baselines.",
        all: "All", eu: "EU", fi: "Finland",
        method: "Rule stages and dates are hand-checked against official sources; rules in the European Parliament's Legislative Observatory are read automatically. Media matches are counted from headlines and ledes using word lists.",
      },
    },
  };
  let lang = (() => {
    try { const s = localStorage.getItem("mp-lang"); if (s === "fi" || s === "en") return s; } catch (e) { /* ignore */ }
    return (navigator.language || "fi").toLowerCase().startsWith("fi") ? "fi" : "en";
  })();
  const t = () => T[lang];
  const locale = () => (lang === "fi" ? "fi-FI" : "en-GB");

  /* ------------------------------------------------------------ formatting */
  const pct = (v, axis) => {
    const p = (v || 0) * 100;
    const digits = axis ? (p === Math.round(p) ? 0 : 1) : p < 10 ? 1 : 0;
    return new Intl.NumberFormat(locale(), { maximumFractionDigits: digits, minimumFractionDigits: axis ? 0 : digits }).format(p) + (lang === "fi" ? " %" : "%");
  };
  const num = (v) => new Intl.NumberFormat(locale()).format(v || 0);
  const signedPct = (d) => {
    if (d === null || d === undefined) return "–";
    const p = Math.round(d * 100);
    return (p > 0 ? "+" : p < 0 ? "−" : "±") + num(Math.abs(p)) + (lang === "fi" ? " %" : "%");
  };
  const dayDate = (d) => new Date(d + "T12:00:00");
  const fmtDate = (d) => new Intl.DateTimeFormat(locale(), { day: "numeric", month: lang === "fi" ? "numeric" : "short" }).format(dayDate(d));
  const fmtDateLong = (d) => new Intl.DateTimeFormat(locale(), { weekday: "short", day: "numeric", month: "long", year: "numeric" }).format(dayDate(d));
  const fmtTime = (iso) => {
    const dt = new Date(iso);
    if (isNaN(dt)) return "";
    return new Intl.DateTimeFormat(locale(), { day: "numeric", month: lang === "fi" ? "numeric" : "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Helsinki" }).format(dt);
  };
  const dayMonth = (d) => (d ? new Intl.DateTimeFormat(locale(), { day: "numeric", month: "long" }).format(dayDate(d)) : "");
  const ago = (iso) => t().ago((Date.now() - Date.parse(iso)) / 3600e3);
  const listJoin = (items) => new Intl.ListFormat(locale(), { style: "long", type: "conjunction" }).format(items);
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  /* ------------------------------------------------------------ data */
  const cache = {};
  async function load(name) {
    if (!cache[name]) {
      cache[name] = fetch(`data/${name}.json`, { cache: "no-cache" }).then((r) => {
        if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
        return r.json();
      });
      cache[name].catch(() => delete cache[name]);
    }
    return cache[name];
  }
  let META = null;
  const themeName = (id) => { const th = (META?.themes || []).find((x) => x.id === id); return th ? th[lang] : id; };
  const sourceName = (id) => { const s = (META?.sources || []).find((x) => x.id === id); return s ? s.name : id; };
  const regionName = (id) => { const r = (META?.regions || []).find((x) => x.id === id); return r ? r[lang] : id; };
  const REGION_COLORS = { finland: "var(--series-1)", nordics: "var(--series-2)", europe: "var(--series-3)", north_america: "var(--series-4)" };
  const actionsUrl = () => `https://github.com/${cfg.repo}/actions/workflows/${cfg.workflow}`;

  const stateBadge = (state) => {
    return `<span class="state ${esc(state)}"><span class="g" aria-hidden="true"></span>${esc(t().state[state] || state)}</span>`;
  };
  const themeTags = (ids) => `<span class="tags">${(ids || []).map((id) => `<a class="tag" href="#/theme/${esc(id)}">${esc(themeName(id))}</a>`).join("")}</span>`;

  function tableToggle(host, columns, rows) {
    const id = "tbl" + Math.random().toString(36).slice(2, 8);
    host.insertAdjacentHTML("beforeend", `<p style="margin:8px 0 0"><button class="linkbtn" aria-expanded="false" aria-controls="${id}">${esc(t().showTable)}</button></p><div id="${id}" class="table-scroll" hidden></div>`);
    const btn = host.querySelector(`[aria-controls="${id}"]`);
    const box = host.querySelector("#" + id);
    btn.addEventListener("click", () => {
      const open = box.hidden;
      box.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
      btn.textContent = open ? t().hideTable : t().showTable;
      if (open && !box.innerHTML) {
        box.innerHTML = `<table class="data"><thead><tr>${columns.map((c, i) => `<th class="${i ? "n" : ""}">${esc(c)}</th>`).join("")}</tr></thead><tbody>${rows
          .map((r) => `<tr>${r.map((v, i) => `<td class="${i ? "n" : ""}">${esc(v)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table>`;
      }
    });
  }

  /* ------------------------------------------------------------ views */
  async function viewPulse() {
    const P = await load("pulse");
    const k = P.kpis;
    if (!k || !k.articles_total) { app.innerHTML = `<p class="notice">${esc(t().noData)}</p>`; return; }
    const ranked = P.themes;
    const hot = ranked.filter((x) => ["emerging", "rising", "peaking"].includes(x.state));
    let statement, extra = [];
    if (!P.baseline_ready) statement = t().leadCollecting(dayMonth(P.trend_start));
    else if (hot.length) {
      const lead = hot[0];
      statement = (lead.state === "peaking" ? t().leadPeak : t().lead)(themeName(lead.id), pct(lead.share_now), pct(lead.baseline));
      const more = hot.slice(1, 3).map((x) => { const n = themeName(x.id); return n.charAt(0).toLowerCase() + n.slice(1); });
      if (more.length) extra.push(cap(t().alsoRising(listJoin(more))));
    } else statement = t().leadCalm;
    const fading = ranked.filter((x) => x.state === "fading").slice(-1);
    if (P.baseline_ready && fading.length) extra.push(cap(t().alsoFading(themeName(fading[0].id))));

    const maxShare = Math.max(...ranked.map((x) => Math.max(x.share_now, x.baseline || 0)), 0.01);
    const rows = ranked.map((x) => `
      <a class="board-row" href="#/theme/${esc(x.id)}">
        <span class="name">${esc(themeName(x.id))}</span>
        ${stateBadge(x.state)}
        <span class="share-cell"><span class="val">${esc(pct(x.share_now))}</span>${shareBar(x.share_now, x.baseline || 0, maxShare, 120)}<span class="small">${x.baseline == null ? "–" : esc(pct(x.baseline))}</span></span>
        <span class="spark">${sparkline(x.spark, 120, 28)}</span>
        <span class="delta ${x.delta > 0.1 ? "up" : x.delta < -0.1 ? "down" : ""}">${esc(signedPct(x.delta))}</span>
      </a>`).join("");

    const storyItems = (P.stories || []).slice(0, 8).map((s) => `
      <li><a class="story-title" href="#/story/${esc(s.id)}">${esc(s.label)}</a>
      <div class="small">${num(s.n)} ${esc(t().articles)} · ${s.sources.length} ${esc(t().outlets)} · ${esc(ago(s.last_seen))}</div>
      <div style="margin-top:6px">${themeTags(s.themes)}</div></li>`).join("");
    const entItems = (list, key) => list.map((e) => `
      <li class="ent-row"><span><span class="name">${esc(e.name)}</span><br><span class="small">${num(e[key])} · ${e.themes?.length ? esc(e.themes.map(themeName).join(", ")) : ""}</span></span>
      ${sparkline(e.spark, 96, 24)}<span>${key === "n48" ? stateBadge(e.state) : ""}</span></li>`).join("");

    app.innerHTML = `
      <div><section class="lede-block wide">
        <h1 class="statement">${esc(statement)}</h1>
        ${extra.length ? `<p class="sub">${esc(extra.join(" "))}</p>` : ""}
        <div class="meta-line"><span>${esc(t().updated)} <strong>${esc(fmtTime(P.updated))}</strong></span>
          <a class="btn" href="${esc(actionsUrl())}" target="_blank" rel="noopener">${esc(t().updateNow)}</a></div>
        <div class="kpis">
          <div class="kpi"><div class="v">${num(k.articles24)}</div><div class="l">${esc(t().kpi.articles24)}</div></div>
          <div class="kpi"><div class="v">${num(k.sources24)}</div><div class="l">${esc(t().kpi.sources24)}</div></div>
          <div class="kpi"><div class="v">${num(k.stories24)}</div><div class="l">${esc(t().kpi.stories24)}</div></div>
          <div class="kpi"><div class="v">${num(k.full_days ?? k.days_of_data)}</div><div class="l">${esc(t().kpi.days)}</div></div>
        </div>
      </section></div>
      <section class="section">
        <div class="section-head"><h2>${esc(t().boardTitle)}</h2><p>${esc(P.baseline_ready ? t().boardNote : t().normalFrom(dayMonth(P.trend_start)))}</p></div>
        <div class="panel board" role="list">
          <div class="board-head" aria-hidden="true"><span>${esc(t().col.theme)}</span><span>${esc(t().col.state)}</span><span>${esc(t().col.share)}</span><span>${esc(t().col.trend)}</span><span class="r">${esc(t().col.change)}</span></div>
          ${rows}
        </div>
        ${k.untagged48 > 0.05 ? `<p class="small" style="margin-top:8px">${esc(t().untagged(pct(k.untagged48)))}</p>` : ""}
      </section>
      <div class="cols section">
        <section>
          <div class="section-head"><h2>${esc(t().topStories)}</h2><a class="small" href="#/stories">${esc(t().allStories)}</a></div>
          ${storyItems ? `<ul class="list">${storyItems}</ul>` : `<p class="empty">${esc(t().noStories)}</p>`}
        </section>
        <section>
          ${P.rising_entities?.length ? `<div class="section-head"><h2>${esc(t().risingNames)}</h2></div><ul class="list">${entItems(P.rising_entities.slice(0, 6), "n48")}</ul>` : ""}
          <div class="section-head" style="margin-top:${P.rising_entities?.length ? 28 : 0}px"><h2>${esc(t().mostNamed)}</h2><a class="small" href="#/names">${esc(t().nav.names)}</a></div>
          <ul class="list">${entItems((P.top_entities || []).slice(0, 8), "n30")}</ul>
        </section>
      </div>`;
  }


  /* ------------------------------------------------------------ front page: the change climate */
  function cycleSvg(zones, ready) {
    const W = 760, H = 210, base = 170, x0 = 20, x1 = 740;
    const curve = (x) => base - 130 * Math.exp(-Math.pow((x - 400) / 130, 2));
    let d = "";
    for (let x = x0; x <= x1; x += 6) d += `${x === x0 ? "M" : "L"}${x},${curve(x).toFixed(1)}`;
    const zoneX = { open: [150, 345], peaking: [345, 455], fading: [455, 700] };
    const dotX = { open: [250, 340], peaking: [370, 430], fading: [470, 590] };  // dots sit on the slope, not the foot
    const dots = (key, color) => {
      const items = (zones[key] || []).slice(0, 4);
      const [a, b] = dotX[key];
      return items.map((_, i) => {
        const x = items.length === 1 ? (a + b) / 2 : a + ((b - a) * (i + 0.5)) / items.length;
        return `<circle cx="${x}" cy="${curve(x)}" r="7" fill="${color}" stroke="var(--base-bg)" stroke-width="2"/>`;
      }).join("");
    };
    const band = (key, fill) => `<rect x="${zoneX[key][0]}" y="20" width="${zoneX[key][1] - zoneX[key][0]}" height="${base - 20}" fill="${fill}"/>`;
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(t().front.cycleTitle)}" preserveAspectRatio="xMidYMid meet">
      ${band("open", "var(--window-band)")}
      <line x1="${x0}" x2="${x1}" y1="${base}" y2="${base}" stroke="var(--axis)" stroke-width="1"/>
      <path d="${d}" fill="none" stroke="var(--base-text)" stroke-width="2" stroke-linecap="round"/>
      <line x1="345" x2="345" y1="20" y2="${base}" stroke="var(--hairline)" stroke-dasharray="3 4"/>
      <line x1="455" x2="455" y1="20" y2="${base}" stroke="var(--hairline)" stroke-dasharray="3 4"/>
      ${ready ? dots("open", "var(--brand-orange)") + dots("peaking", "var(--base-text)") + dots("fading", "var(--grey-500)") : ""}
      <text x="247" y="${base + 26}" text-anchor="middle" class="cyc-label">${esc(t().front.zoneOpen)}</text>
      <text x="400" y="${base + 26}" text-anchor="middle" class="cyc-label">${esc(t().front.zonePeak)}</text>
      <text x="578" y="${base + 26}" text-anchor="middle" class="cyc-label">${esc(t().front.zoneFade)}</text>
    </svg>`;
  }

  function barsSvg(values) {
    const w = 112, h = 36, n = values.length, max = Math.max(...values, 1), bw = w / n;
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${values.map((v, i) => {
      const bh = v ? Math.max(2, (v / max) * (h - 2)) : 1;
      return `<rect x="${(i * bw + 1).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${bh.toFixed(1)}" fill="${i === n - 1 ? "var(--brand-orange)" : "var(--spark)"}"/>`;
    }).join("")}</svg>`;
  }

  const hoursShort = (h) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : `${new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(h)} h`);

  async function viewFront() {
    const C = await load("climate");
    const F = t().front;
    const ready = C.baseline_ready;
    const startD = dayMonth(C.trend_start);
    const label = (o) => (lang === "fi" ? o.fi : o.en);
    const lc = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
    const open = C.windows.open || [], peak = C.windows.peaking || [], fade = C.windows.fading || [];
    const sigs = C.signals || [];
    const topSig = sigs.slice().sort((a, b) => b.n7 - a.n7)[0];

    let hero, heroSub = [];
    if (ready && open.length) {
      hero = F.heroOpen(themeName(open[0].id));
      heroSub.push(F.heroOpenSub(pct(open[0].share_now), pct(open[0].baseline)));
      if (peak.length) heroSub.push(F.alsoPeak(themeName(peak[0].id)));
    } else if (ready && peak.length) {
      hero = F.heroPeak(lc(themeName(peak[0].id)));
    } else if (ready) {
      hero = F.heroNone; heroSub.push(F.heroNoneSub);
    } else {
      hero = topSig && topSig.n7 ? F.heroSignal(num(topSig.n7), lang === "fi" ? topSig.fi_about : topSig.en_about) : F.heroSignalNone;
      heroSub.push(F.preTrend(startD));
    }

    const zoneList = (items, key) => {
      if (!ready) return `<p class="small">${esc(F.zoneFrom(startD))}</p>`;
      if (!items.length) return `<p class="small">${esc(F.zoneEmpty)}</p>`;
      return `<ul class="zone-list">${items.slice(0, 4).map((r) => `<li><a href="#/theme/${esc(r.id)}">${esc(themeName(r.id))}</a>
        <span class="small">${esc(pct(r.share_now))} · ${esc(signedPct(r.delta))}</span></li>`).join("")}</ul>`;
    };

    const climateLeadSig = ready ? sigs.filter((s) => s.delta != null && s.delta > 0.5 && s.n7 >= 3).sort((a, b) => b.delta - a.delta)[0] : null;
    const sigCards = sigs.map((s) => `
      <article class="signal">
        <h3>${esc(label(s))}</h3>
        <div class="signal-row"><div><div class="signal-n">${num(s.n7)}</div><div class="small">${esc(F.headlines7)}</div></div>${barsSvg(s.daily)}</div>
        <p class="small signal-delta">${ready ? (s.delta == null ? "–" : `<strong>${esc(signedPct(s.delta))}</strong> ${esc(F.vsNormal)}`) : esc(F.normalFromShort(startD))}</p>
        <details><summary>${esc(F.showHeadlines)}</summary>${s.headlines.length ? `<ul class="list">${s.headlines.slice(0, 6).map((h) => `<li><a class="story-title" href="${esc(h.u)}" target="_blank" rel="noopener">${esc(h.t)}</a><div class="small">${esc(sourceName(h.s))} · ${esc(fmtTime(h.p))}</div></li>`).join("")}</ul>` : `<p class="small">${esc(F.noHeadlines)}</p>`}</details>
      </article>`).join("");

    let shiftHtml;
    const shifts = C.shifts || [];
    if (ready && shifts.length >= 2) {
      const ups = shifts.filter((r) => r.delta > 0).slice(0, 4);
      const downs = shifts.filter((r) => r.delta < 0).slice(-4).reverse();
      const rows = ups.concat(downs);
      const max = Math.max(...rows.map((r) => Math.abs(r.delta)), 0.1);
      shiftHtml = `${ups.length && downs.length ? `<p class="section-lead">${esc(F.shiftLead(themeName(ups[0].id), signedPct(ups[0].delta).replace(/^\+/, ""), themeName(downs[0].id), signedPct(downs[0].delta).replace(/^[−-]/, "")))}</p>` : ""}
        <div class="diverge" role="list">${rows.map((r) => {
          const w = (Math.abs(r.delta) / max) * 50;
          return `<div class="div-row" role="listitem"><a href="#/theme/${esc(r.id)}">${esc(themeName(r.id))}</a>
            <div class="div-track" aria-hidden="true"><span class="div-bar ${r.delta >= 0 ? "pos" : "neg"}" style="${r.delta >= 0 ? `left:50%;width:${w}%` : `right:50%;width:${w}%`}"></span></div>
            <span class="div-val">${esc(signedPct(r.delta))}</span></div>`;
        }).join("")}</div>`;
    } else {
      shiftHtml = `<p class="small">${esc(F.zoneFrom(startD))}</p>`;
    }

    const sp = C.speed;
    const speedHtml = sp
      ? `<div class="speed"><div class="speed-n">${esc(hoursShort(sp.median_h))}</div>
          <div><p class="section-lead">${esc(F.speedLead(sp.outlets, F.within(sp.median_h)))}</p>
          <p>${esc(F.speedFast(sp.fastest.label, sourceName(sp.fastest.first_source), sp.outlets, F.within(sp.fastest.reach_h)))} <a href="#/story/${esc(sp.fastest.id)}">${esc(F.seeStory)}</a></p>
          <p class="small">${esc(F.speedNote)}</p></div></div>`
      : `<p class="small">${esc(F.speedNone)}</p>`;

    app.innerHTML = `
      <div class="hero theme-neon"><section class="lede-block wide">
        <h1 class="statement">${esc(hero)}</h1>
        ${heroSub.map((x) => `<p class="sub">${esc(x)}</p>`).join("")}
        <div class="meta-line"><span>${esc(t().updated)} <strong>${esc(fmtTime(C.updated))}</strong></span>
          <span>${num(C.articles7)} ${esc(t().articles)} · 7 ${esc(lang === "fi" ? "pv" : "days")}</span>
          <a class="btn" href="${esc(actionsUrl())}" target="_blank" rel="noopener">${esc(t().updateNow)}</a></div>
      </section></div>

      <section class="section">
        <div class="section-head"><h2>${esc(F.cycleTitle)}</h2><p>${esc(F.cycleNote)}</p></div>
        <div class="cycle">${cycleSvg(C.windows, ready)}</div>
        <div class="zones">
          <div class="zone open"><h3>${esc(F.zoneOpen)}</h3><p class="small">${esc(F.zoneOpenNote)}</p>${zoneList(open, "open")}</div>
          <div class="zone"><h3>${esc(F.zonePeak)}</h3><p class="small">${esc(F.zonePeakNote)}</p>${zoneList(peak, "peaking")}</div>
          <div class="zone"><h3>${esc(F.zoneFade)}</h3><p class="small">${esc(F.zoneFadeNote)}</p>${zoneList(fade, "fading")}</div>
        </div>
      </section>

      <section class="section">
        <div class="section-head"><h2>${esc(F.climateTitle)}</h2><p>${esc(F.climateNote)}</p></div>
        ${climateLeadSig ? `<p class="section-lead">${esc(F.climateLead(label(climateLeadSig), num(climateLeadSig.n7), signedPct(climateLeadSig.delta).replace(/^\+/, "")))}</p>` : ""}
        <div class="signals">${sigCards}</div>
      </section>

      <div class="cols section">
        <section><div class="section-head"><h2>${esc(F.shiftTitle)}</h2></div><p class="small" style="margin-top:0">${esc(F.shiftNote)}</p>${shiftHtml}</section>
        <section><div class="section-head"><h2>${esc(F.speedTitle)}</h2></div>${speedHtml}</section>
      </div>
      <p class="section"><a class="btn" href="#/themes">${esc(F.seeThemes)}</a></p>`;
  }

  /* ------------------------------------------------------------ sustainability lens */
  async function viewLens() {
    const D = await load("lens");
    const L = t().lens;
    const nm = (o) => (o ? (lang === "fi" ? o.fi : o.en) : "");
    const daysTo = (d) => Math.round((Date.parse(d + "T12:00:00Z") - Date.parse(D.today + "T12:00:00Z")) / 864e5);
    const fullDate = (d) => new Intl.DateTimeFormat(locale(), { day: "numeric", month: "long", year: "numeric" }).format(dayDate(d));
    const issues = D.issues.filter((i) => !i.context);
    const ctx = D.issues.find((i) => i.context);
    const issueName = (id) => nm(D.issues.find((i) => i.id === id)) || "";
    const stages = (D.stages || {})[lang] || [];
    const stagesShort = (D.stages_short || {})[lang] || stages;

    // hero: the next dated milestone
    const nextEv = D.calendar.find((e) => e.date);
    const hero = nextEv ? L.heroNext(daysTo(nextEv.date), nm(nextEv)) : L.title;

    const issueRows = issues.map((i) => {
      const nextTxt = i.next ? `${esc(nm(i.next))}${i.next_date ? `<div class="small">${esc(fullDate(i.next_date))} · ${esc(L.inDays(daysTo(i.next_date)))}</div>` : ""}` : "–";
      const bars = barsSvg(i.main_daily.slice(-14).map((v, j) => v + i.spec_daily.slice(-14)[j]));
      const heads = i.headlines.length
        ? `<ul class="list">${i.headlines.slice(0, 6).map((h) => `<li><a class="story-title" href="${esc(h.u)}" target="_blank" rel="noopener">${esc(h.t)}</a><div class="small">${esc(h.k === "spec" ? lensSource(D, h.s) : sourceName(h.s))} · ${esc(h.k === "spec" ? L.specialist : L.mainstream)} · ${esc(fmtTime(h.p))}</div></li>`).join("")}</ul>`
        : `<p class="small">${esc(L.noHeadlines)}</p>`;
      return `<tr>
        <th scope="row"><strong>${esc(nm(i))}</strong></th>
        <td data-label="${esc(L.col.stands)}">${esc(nm(i.status))}</td>
        <td data-label="${esc(L.col.next)}">${nextTxt}</td>
        <td class="lens-media" data-label="${esc(L.col.media)}"><div class="lens-n"><span><strong>${num(i.main7)}</strong> ${esc(L.mainShort)}</span><span><strong>${num(i.spec7)}</strong> ${esc(L.specShort)}</span></div>${bars}
          <details><summary>${esc(L.showHeadlines)}</summary>${heads}</details></td>
      </tr>`;
    }).join("");

    // pipeline
    const pipeRows = D.files.map((f) => {
      const cells = stages.map((_, k) => `<span class="${k < f.stage ? "done" : k === f.stage ? "now" + (f.stalled ? " stalled" : "") : ""}"></span>`).join("");
      const o = f.official;
      let rec = "";
      if (o) {
        if (o.error && !o.stage) rec = `<div class="small">${esc(L.recordError)} <a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(L.official)}</a></div>`;
        else if (!o.stage && !o.latest) rec = `<div class="small"><a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(L.official)}</a>: ${esc(L.notRead)}</div>`;
        else rec = `<div class="small"><a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(L.official)}</a>: ${esc(o.stage || "")}${o.latest ? ` · ${esc(L.latestEvent)} ${esc(fmtDate(o.latest[0]))}: ${esc(o.latest[1])}` : ""}${o.changed ? ` <strong class="changed">${esc(L.changed(ago(o.changed)))}</strong>` : ""}</div>`;
      }
      const nextTxt = `${esc(nm(f.next))}${f.next_date ? `<div class="small">${esc(fullDate(f.next_date))} · ${esc(L.inDays(daysTo(f.next_date)))}</div>` : ""}`;
      const kind = f.timing?.kind || "unknown";
      return `<div class="pipe-row" role="row">
        <div role="cell"><span class="name">${esc(nm(f))}</span> <span class="where">${esc(f.where === "FI" ? L.fi : L.eu)}</span><div class="small">${esc(nm(f.why))}</div>${rec}</div>
        <div role="cell"><span class="track" role="img" aria-label="${esc(L.stageAria(stages[f.stage] || "", f.stalled))}">${cells}</span><span class="track-now small" aria-hidden="true">${esc(stages[f.stage] || "")}</span></div>
        <div role="cell">${nextTxt}</div>
        <div role="cell"><span class="st ${esc(kind)}">${esc(nm(f.timing))}</span></div>
      </div>`;
    }).join("");

    const calRows = D.calendar.map((e) => {
      const when = e.date ? `${fullDate(e.date)}<div class="small">${esc(L.inDays(daysTo(e.date)))}</div>` : esc(nm(e.when));
      return `<tr><td>${when}</td><td>${esc(nm(e))}</td><td>${e.issue ? esc(issueName(e.issue)) : esc(L.all)}</td></tr>`;
    }).join("");

    const srcRows = (D.sources || []).map((s) => `<li><a href="${esc(s.homepage)}" target="_blank" rel="noopener">${esc(s.name)}</a> <span class="small">${esc(s.lang)} · <span class="status-dot ${esc(s.state)}">${esc(t().sstate[s.state] || s.state)}</span> · ${num(s.n7)} ${esc(lang === "fi" ? "otsikkoa 7 pv" : "headlines, 7 days")}</span></li>`).join("");

    app.innerHTML = `
      <div class="hero theme-neon"><section class="lede-block wide">
        <h1 class="statement">${esc(hero)}</h1>
        <p class="sub">${esc(L.heroSub(issues.length, D.files.length))}</p>
        <div class="meta-line"><span>${esc(t().updated)} <strong>${esc(fmtTime(D.updated))}</strong></span><span>${esc(L.checked(fullDate(D.pipeline_checked)))}</span></div>
      </section></div>

      <section class="section">
        <div class="section-head"><h2>${esc(L.issuesTitle)}</h2><p>${esc(L.issuesNote)}</p></div>
        <div class="panel"><table class="data lens-table">
          <thead><tr><th scope="col">${esc(L.col.issue)}</th><th scope="col">${esc(L.col.stands)}</th><th scope="col">${esc(L.col.next)}</th><th scope="col">${esc(L.col.media)}</th></tr></thead>
          <tbody>${issueRows}</tbody></table></div>
      </section>

      <section class="section">
        <div class="section-head"><h2>${esc(L.pipeTitle)}</h2><p>${esc(L.pipeNote)}</p></div>
        <div class="panel pipe" role="table" aria-label="${esc(L.pipeTitle)}">
          <div class="pipe-head" role="row">
            <div role="columnheader">${esc(L.pcol.file)}</div>
            <div role="columnheader"><span class="sr-only">${esc(L.pcol.stage)}</span><span class="tlabels" aria-hidden="true"><span class="shape">${esc(L.roomToShape)}</span></span><span class="tlabels" aria-hidden="true">${stagesShort.map((x) => `<span>${esc(x)}</span>`).join("")}</span></div>
            <div role="columnheader">${esc(L.pcol.next)}</div>
            <div role="columnheader">${esc(L.pcol.timing)}</div>
          </div>
          ${pipeRows}
        </div>
      </section>

      <section class="section">
        <div class="section-head"><h2>${esc(L.coverageTitle)}</h2><p>${esc(L.coverageNote)}</p></div>
        <div class="filters"><label class="field">${esc(L.pickIssue)}<select id="lensIssue">${issues.map((i) => `<option value="${esc(i.id)}">${esc(nm(i))}</option>`).join("")}</select></label></div>
        <div class="chart-wrap"><div id="lensChart" class="chart"></div></div>
        <div id="lensChartTable"></div>
        <p class="small">${esc(L.since(D.since_main ? fullDate(D.since_main) : "–", D.since_spec ? fullDate(D.since_spec) : null))}${ctx ? " " + esc(L.context(num(ctx.main7 + ctx.spec7), nm(ctx))) : ""}</p>
      </section>

      <div class="cols section">
        <section><div class="section-head"><h2>${esc(L.calTitle)}</h2></div><p class="small" style="margin-top:0">${esc(L.calNote)}</p>
          <div class="table-scroll"><table class="data"><thead><tr><th scope="col">${esc(L.ccol.when)}</th><th scope="col">${esc(L.ccol.what)}</th><th scope="col">${esc(L.ccol.issue)}</th></tr></thead><tbody>${calRows}</tbody></table></div></section>
        <section><div class="section-head"><h2>${esc(L.sourcesTitle)}</h2></div><p class="small" style="margin-top:0">${esc(L.sourcesNote)}</p><ul class="list">${srcRows}</ul>
          <p class="small">${esc(L.method)}</p></section>
      </div>`;

    const start = D.since_main ? D.dates.indexOf(D.since_main) : -1;
    const days = Math.min(60, Math.max(14, start >= 0 ? D.dates.length - start : 60));
    const draw = (id) => {
      const i = issues.find((x) => x.id === id) || issues[0];
      const dates = D.dates.slice(-days);
      const host = document.getElementById("lensChart");
      lineChart(host, {
        dates, height: 240, label: `${nm(i)}: ${L.coverageTitle}`,
        series: [
          { name: L.mainstream, values: i.main_daily.slice(-days), color: "var(--series-1)" },
          { name: L.specialist, values: i.spec_daily.slice(-days), color: "var(--series-2)" },
        ],
        format: (v) => num(Math.round(v)), integer: true, fmtDate, fmtDateLong,
      });
      const tbl = document.getElementById("lensChartTable");
      tbl.innerHTML = "";
      tableToggle(tbl, [t().date, L.mainstream, L.specialist], dates.map((d, k) => [fmtDate(d), num(i.main_daily.slice(-days)[k]), num(i.spec_daily.slice(-days)[k])]).reverse());
    };
    const sel = document.getElementById("lensIssue");
    const busiest = issues.slice().sort((a, b) => (b.main7 + b.spec7) - (a.main7 + a.spec7))[0];
    if (busiest) sel.value = busiest.id;
    sel.addEventListener("change", (e) => draw(e.target.value));
    draw(sel.value);
  }
  const lensSource = (D, id) => ((D.sources || []).find((s) => s.id === id) || {}).name || id;

  async function viewTheme(id) {
    const [D, S] = await Promise.all([load(`themes/${id}`), load("stories")]);
    const name = themeName(id);
    let range = 90, outletRange = "30";
    app.innerHTML = `
      <section class="lede-block">
        <p class="small"><a href="#/themes">${esc(t().nav.pulse)}</a></p>
        <h1 class="statement">${esc(D.baseline == null ? t().themeStatementNow(name, pct(D.share_now)) : t().themeStatement(name, pct(D.share_now), pct(D.baseline)))}</h1>
        <div class="meta-line">${stateBadge(D.state)}${D.delta == null ? "" : `<span>${esc(t().col.change)} <strong>${esc(signedPct(D.delta))}</strong></span>`}<span>${num(D.n48)} ${esc(t().articles)} · ${num(D.sources48)} ${esc(t().outlets)} (48 h)</span></div>
        ${D.baseline == null && META.trend_start ? `<p class="small" style="margin-top:var(--space-4xs)">${esc(t().normalFrom(dayMonth(META.trend_start)))}</p>` : ""}
      </section>
      <section class="panel chart-wrap">
        <div class="chart-tools">
          <div class="legend"><span><i class="key" style="background:var(--series-1)"></i>${esc(t().share)}</span>${D.baseline == null ? "" : `<span><i class="key band"></i>${esc(t().normalRange)}</span>`}</div>
          <div class="seg" role="group" aria-label="${esc(t().period)}" id="rangeSeg">${[30, 90, 120].map((d) => `<button type="button" class="mt-toggle" data-d="${d}" aria-pressed="${d === range}"><span class="mt-toggle-dot" aria-hidden="true"></span>${esc(t().days(d))}</button>`).join("")}</div>
        </div>
        <div class="chart" id="themeChart"></div>
        <div id="themeTable"></div>
      </section>
      <div class="cols section">
        <section><div class="section-head"><h2>${esc(t().byOutlet)}</h2>
          <div class="seg" role="group" aria-label="${esc(t().period)}" id="outletSeg">${["7", "30", "90"].map((d) => `<button type="button" class="mt-toggle" data-d="${d}" aria-pressed="${d === outletRange}"><span class="mt-toggle-dot" aria-hidden="true"></span>${esc(t().days(d))}</button>`).join("")}</div></div>
          <div id="outlets"></div></section>
        <section><div class="section-head"><h2>${esc(t().namesInTheme)}</h2></div>
          <ul class="list">${(D.entities || []).slice(0, 10).map((e) => `<li class="ent-row" style="grid-template-columns:1fr auto"><span class="name">${esc(e.name)}</span><span class="small">${num(e.n)}</span></li>`).join("")}</ul>
          ${D.co_themes?.length ? `<h3 style="margin-top:24px">${esc(t().relatedThemes)}</h3>${themeTags(D.co_themes.map((c) => c[0]))}` : ""}
        </section>
      </div>
      <section class="section"><div class="section-head"><h2>${esc(t().storiesInTheme)}</h2></div><ul class="list" id="themeStories"></ul></section>
      <section class="section"><div class="section-head"><h2>${esc(t().latest)}</h2></div><ul class="list">${(D.headlines || []).slice(0, 20).map(headlineItem).join("")}</ul></section>`;

    const first = Math.max(0, D.series.findIndex((p) => p.tot > 0));
    const drawChart = () => {
      const start = Math.max(first, D.series.length - range);
      const s = D.series.slice(start);
      lineChart(document.getElementById("themeChart"), {
        label: `${name}: ${t().share}`, dates: s.map((p) => p.d), height: 260,
        series: [{ name: t().share, values: s.map((p) => p.sh), color: "var(--series-1)" }],
        band: D.band.slice(start), bandLabel: t().normalRange, format: pct, fmtDate, fmtDateLong,
        extra: (i) => `<div class="tt-row small"><span>${esc(t().count)}</span><span>${num(s[i].n)}</span></div>`,
      });
    };
    drawChart();
    tableToggle(document.getElementById("themeTable"), [t().date, t().share, t().count],
      D.series.slice(first).reverse().map((p) => [fmtDateLong(p.d), pct(p.sh), num(p.n)]));
    document.getElementById("rangeSeg").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      range = +b.dataset.d;
      e.currentTarget.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      drawChart();
    });
    const drawOutlets = () => {
      const rows = (D.outlets[outletRange] || []).slice(0, 12).map(([s, n]) => ({ label: sourceName(s), value: n }));
      document.getElementById("outlets").innerHTML = rows.length ? hbars(rows, num) : `<p class="empty">–</p>`;
    };
    drawOutlets();
    document.getElementById("outletSeg").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      outletRange = b.dataset.d;
      e.currentTarget.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      drawOutlets();
    });
    const byId = Object.fromEntries(S.stories.map((s) => [s.id, s]));
    document.getElementById("themeStories").innerHTML = (D.stories || []).map((sid) => byId[sid]).filter(Boolean).slice(0, 8).map(storyItem).join("")
      || `<li class="empty">${esc(t().noStories)}</li>`;
  }

  function headlineItem(h) {
    return `<li><a class="story-title" href="${esc(h.u)}" target="_blank" rel="noopener">${esc(h.t)}</a>
      <div class="small">${esc(sourceName(h.s))} · ${esc(fmtTime(h.p))}</div>${h.l ? `<div class="small" style="color:var(--ink-2)">${esc(h.l)}</div>` : ""}
      ${h.th?.length ? `<div style="margin-top:6px">${themeTags(h.th)}</div>` : ""}</li>`;
  }
  function storyItem(s) {
    return `<li><a class="story-title" href="#/story/${esc(s.id)}">${esc(s.label)}</a>
      <div class="small">${num(s.n)} ${esc(t().articles)} · ${s.sources.length} ${esc(t().outlets)} · ${esc(t().firstBy)} ${esc(sourceName(s.first_source))}, ${esc(fmtTime(s.first_seen))}</div>
      <div style="margin-top:6px">${themeTags(s.themes)}</div></li>`;
  }

  async function viewStories() {
    const S = await load("stories");
    app.innerHTML = `
      <section class="lede-block"><h1 class="statement">${esc(t().nav.stories)}</h1><p class="sub">${esc(t().topStoriesNote)}</p></section>
      <div class="filters"><div class="field"><label for="stTheme">${esc(t().lblTheme)}</label>
        <select id="stTheme"><option value="">${esc(t().filterTheme)}</option>${META.themes.map((th) => `<option value="${esc(th.id)}">${esc(th[lang])}</option>`).join("")}</select></div></div>
      <ul class="list" id="storyList"></ul>`;
    const render = () => {
      const f = document.getElementById("stTheme").value;
      const list = S.stories.filter((s) => !f || s.themes.includes(f));
      document.getElementById("storyList").innerHTML = list.map(storyItem).join("") || `<li class="empty">${esc(t().noStories)}</li>`;
    };
    document.getElementById("stTheme").addEventListener("change", render);
    render();
  }

  async function viewStory(id) {
    const S = await load("stories");
    const s = S.stories.find((x) => x.id === id);
    if (!s) { app.innerHTML = `<p class="notice">${esc(t().noStories)}</p>`; return; }
    app.innerHTML = `
      <section class="lede-block"><p class="small"><a href="#/stories">${esc(t().nav.stories)}</a></p>
        <h1 class="statement">${esc(s.label)}</h1>
        <div class="meta-line"><span><strong>${num(s.n)}</strong> ${esc(t().articles)}</span><span><strong>${s.sources.length}</strong> ${esc(t().outlets)}</span>
          <span>${esc(t().firstBy)} <strong>${esc(sourceName(s.first_source))}</strong>, ${esc(fmtTime(s.first_seen))}</span>${themeTags(s.themes)}</div>
        ${s.entities?.length ? `<p class="small" style="margin-top:8px">${esc(s.entities.join(", "))}</p>` : ""}
      </section>
      <section class="panel chart-wrap"><div class="chart" id="storyTimeline"></div></section>
      <section class="section"><ul class="list">${s.articles.slice().reverse().map((a) => headlineItem({ ...a })).join("")}</ul></section>`;
    dotTimeline(document.getElementById("storyTimeline"), s.articles, { sourceName, fmtTime, label: s.label });
  }

  async function viewNames() {
    const E = await load("entities");
    app.innerHTML = `
      <section class="lede-block"><h1 class="statement">${esc(t().namesTitle)}</h1><p class="sub">${esc(t().namesNote)}</p></section>
      <div class="filters"><div class="field"><label for="nq">${esc(t().lblSearchNames)}</label><input id="nq" type="search" placeholder="${esc(t().searchNames)}"></div></div>
      <div class="panel table-scroll"><table class="data"><thead><tr><th>${esc(t().ncol.name)}</th><th>${esc(t().col.state)}</th><th class="n">${esc(t().ncol.n48)}</th><th class="n">${esc(t().ncol.n7)}</th><th class="n">${esc(t().ncol.n30)}</th><th>${esc(t().ncol.trend)}</th><th>${esc(t().ncol.themes)}</th></tr></thead><tbody id="nbody"></tbody></table></div>`;
    const render = () => {
      const q = document.getElementById("nq").value.trim().toLowerCase();
      document.getElementById("nbody").innerHTML = E.entities.filter((e) => !q || e.name.toLowerCase().includes(q)).slice(0, 150).map((e) => `
        <tr><td><strong>${esc(e.name)}</strong></td><td>${stateBadge(e.state)}</td><td class="n">${num(e.n48)}</td><td class="n">${num(e.n7)}</td><td class="n">${num(e.n30)}</td>
        <td>${sparkline(e.spark, 110, 24)}</td><td>${themeTags(e.themes)}</td></tr>`).join("");
    };
    document.getElementById("nq").addEventListener("input", render);
    render();
  }

  async function viewRegions(themeId) {
    if (!META.has_regions) { app.innerHTML = `<section class="lede-block"><h1 class="statement">${esc(t().regionsTitle)}</h1></section><p class="notice">${esc(t().regionsEmpty)}</p>`; return; }
    const R = await load("regions");
    const regionIds = META.regions.map((r) => r.id).filter((r) => R.regions[r]);
    const themeIds = META.themes.map((x) => x.id);
    const sel = themeId && themeIds.includes(themeId) ? themeId : themeIds.slice().sort((a, b) =>
      Math.max(...regionIds.map((r) => R.regions[r].themes[b]?.score || 0)) - Math.max(...regionIds.map((r) => R.regions[r].themes[a]?.score || 0)))[0];
    const isDark = getComputedStyle(document.documentElement).getPropertyValue("--is-dark").trim() === "1";
    const cell = (r, th) => {
      const d = R.regions[r].themes[th];
      if (!d) return `<td class="cell">–</td>`;
      const v = d.delta ?? 0;
      const amt = Math.round(Math.min(Math.abs(v), 1) * 85);
      const col = v >= 0 ? "var(--div-pos)" : "var(--div-neg)";
      // Text contrast >= 4.5:1 at every shade: black on light pages; on dark pages white up to 75 %, then black.
      const ink = isDark ? (amt > 75 ? "#000" : "#fff") : "#000";
      return `<td class="cell" style="background:color-mix(in srgb, ${col} ${amt}%, var(--div-mid));color:${ink}"><a href="#/regions/${esc(th)}" aria-label="${esc(themeName(th))}, ${esc(regionName(r))}: ${esc(signedPct(d.delta))}">${esc(signedPct(d.delta))}</a></td>`;
    };
    app.innerHTML = `
      <section class="lede-block"><h1 class="statement">${esc(t().regionsTitle)}</h1><p class="sub">${esc(t().regionsNote)}</p>
        <div class="meta-line"><span>GDELT ${esc(t().updated.toLowerCase())} <strong>${esc(fmtTime(R.fetched || R.updated))}</strong></span></div></section>
      <section class="panel table-scroll"><table class="data grid-heat"><thead><tr><th>${esc(t().col.theme)}</th>${regionIds.map((r) => `<th class="n" style="text-align:center">${esc(regionName(r))}</th>`).join("")}</tr></thead>
        <tbody>${themeIds.map((th) => `<tr${th === sel ? ' class="selected" aria-current="true"' : ""}><td><a href="#/regions/${esc(th)}">${esc(themeName(th))}</a></td>${regionIds.map((r) => cell(r, th)).join("")}</tr>`).join("")}</tbody></table></section>
      <section class="section panel chart-wrap"><div class="chart-tools"><h2>${esc(t().compareTitle(themeName(sel)))}</h2>
        <div class="field"><label for="rTheme">${esc(t().pickTheme)}</label><select id="rTheme" class="inline-select">${themeIds.map((th) => `<option value="${esc(th)}" ${th === sel ? "selected" : ""}>${esc(themeName(th))}</option>`).join("")}</select></div></div>
        <div class="legend">${regionIds.map((r) => `<span><i class="key" style="background:${REGION_COLORS[r] || "var(--muted)"}"></i>${esc(regionName(r))}</span>`).join("")}</div>
        <div class="chart" id="regionChart"></div><div id="regionTable"></div></section>
      <section class="section"><div class="section-head"><h2>${esc(t().regionHeadlines)}</h2></div><div class="cols" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:28px">
        ${regionIds.map((r) => `<div><h3>${esc(regionName(r))}</h3><ul class="list">${(R.regions[r].themes[sel]?.headlines || []).slice(0, 5).map((h) => `<li><a class="story-title" href="${esc(h.u)}" target="_blank" rel="noopener">${esc(h.t)}</a><div class="small">${esc(h.d)}</div></li>`).join("") || "<li class='small'>–</li>"}</ul></div>`).join("")}
      </div></section>`;
    document.getElementById("rTheme").addEventListener("change", (e) => { location.hash = `#/regions/${e.target.value}`; });
    const days = R.dates.slice(-60);
    const series = regionIds.map((r) => ({ name: regionName(r), color: REGION_COLORS[r] || "var(--muted)", values: (R.regions[r].themes[sel]?.shares || []).slice(-60) }));
    lineChart(document.getElementById("regionChart"), { label: t().compareTitle(themeName(sel)), dates: days, series, format: pct, fmtDate, fmtDateLong, height: 260 });
    tableToggle(document.getElementById("regionTable"), [t().date, ...series.map((s) => s.name)],
      days.map((d, i) => [fmtDateLong(d), ...series.map((s) => pct(s.values[i] || 0))]).reverse());
  }

  async function viewHeadlines() {
    const H = await load("headlines");
    app.innerHTML = `
      <section class="lede-block"><h1 class="statement">${esc(t().headlinesTitle)}</h1><p class="sub">${esc(t().headlinesNote)}</p></section>
      <div class="filters">
        <div class="field"><label for="hq">${esc(t().lblSearch)}</label><input id="hq" type="search" placeholder="${esc(t().search)}"></div>
        <div class="field"><label for="ht">${esc(t().lblTheme)}</label><select id="ht"><option value="">${esc(t().filterTheme)}</option>${META.themes.map((th) => `<option value="${esc(th.id)}">${esc(th[lang])}</option>`).join("")}</select></div>
        <div class="field"><label for="hs">${esc(t().lblSource)}</label><select id="hs"><option value="">${esc(t().filterSource)}</option>${META.sources.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("")}</select></div>
        <span class="small" id="hcount"></span></div>
      <ul class="list" id="hlist"></ul>`;
    const render = () => {
      const q = document.getElementById("hq").value.trim().toLowerCase();
      const th = document.getElementById("ht").value, so = document.getElementById("hs").value;
      const items = H.items.filter((h) => (!q || (h.t + " " + h.l).toLowerCase().includes(q)) && (!th || h.th.includes(th)) && (!so || h.s === so));
      document.getElementById("hcount").textContent = t().shownOf(num(Math.min(items.length, 200)), num(items.length));
      document.getElementById("hlist").innerHTML = items.slice(0, 200).map(headlineItem).join("");
    };
    ["hq", "ht", "hs"].forEach((idx) => document.getElementById(idx).addEventListener("input", render));
    render();
  }

  async function viewSources() {
    const rows = META.sources.map((s) => {
      const notes = [];
      if (!s.verified) notes.push(t().unverified);
      if (s.discovered?.length) notes.push(`${t().discovered} ${s.discovered[0]}`);
      if (s.errors?.length) notes.push(s.errors[0]);
      return `<tr><td><a href="${esc(s.homepage)}" target="_blank" rel="noopener"><strong>${esc(s.name)}</strong></a><div class="small">${esc(s.lang)} · ${esc(t().types[s.type] || s.type || "")}</div></td>
        <td><span class="status-dot ${esc(s.state)}">${esc(t().sstate[s.state] || s.state)}</span></td><td class="n">${num(s.n24)}</td><td class="n">${num(s.n7)}</td>
        <td>${s.last ? esc(fmtTime(s.last)) : "–"}</td><td class="small" style="max-width:360px;overflow-wrap:anywhere">${esc(notes.join(" · "))}</td></tr>`;
    }).join("");
    const g = META.gdelt;
    const failed = (g?.report || []).filter((e) => e.timeline_error || e.articles_error);
    app.innerHTML = `
      <section class="lede-block"><h1 class="statement">${esc(t().sourcesTitle)}</h1><p class="sub">${esc(t().sourcesNote)}</p></section>
      <section class="panel table-scroll"><table class="data"><thead><tr><th>${esc(t().scol.outlet)}</th><th>${esc(t().scol.status)}</th><th class="n">${esc(t().scol.n24)}</th><th class="n">${esc(t().scol.n7)}</th><th>${esc(t().scol.last)}</th><th>${esc(t().scol.notes)}</th></tr></thead><tbody>${rows}</tbody></table></section>
      ${!META.has_regions ? "" : `<section class="section"><h2>${esc(t().gdeltTitle)}</h2>
        <p>${g?.last_run ? esc(t().gdeltStatus(g.ok, g.queries, fmtTime(g.last_run))) : esc(t().gdeltNever)}${g?.stopped ? ` <span class="small">(${esc(g.stopped)})</span>` : ""}</p>
        ${failed.length ? `<h3>${esc(t().gdeltFailed)}</h3><ul class="small">${failed.slice(0, 30).map((e) => `<li>${esc(regionName(e.region))} / ${esc(themeName(e.theme))}: ${esc(e.timeline_error || e.articles_error)}</li>`).join("")}</ul>` : ""}
      </section>`}`;
  }

  /* ------------------------------------------------------------ shell */
  const routes = [
    [/^#?\/?$/, () => viewFront(), "front"],
    [/^#\/sustainability$/, () => viewLens(), "lens"],
    [/^#\/themes$/, () => viewPulse(), "pulse"],
    [/^#\/theme\/([\w-]+)$/, (m) => viewTheme(m[1]), "pulse"],
    [/^#\/stories$/, () => viewStories(), "stories"],
    [/^#\/story\/([\w-]+)$/, (m) => viewStory(m[1]), "stories"],
    [/^#\/names$/, () => viewNames(), "names"],
    [/^#\/regions(?:\/([\w-]+))?$/, (m) => viewRegions(m[1]), "regions"],
    [/^#\/headlines$/, () => viewHeadlines(), "headlines"],
    [/^#\/sources$/, () => viewSources(), "sources"],
  ];

  function renderChrome(active) {
    document.documentElement.lang = lang;
    document.getElementById("nav").innerHTML = ["front", "lens", "pulse", "stories", "names", "regions", "headlines", "sources"].map((k) =>
      `<a href="#/${k === "front" ? "" : k === "pulse" ? "themes" : k === "lens" ? "sustainability" : k}" ${k === active ? 'aria-current="page"' : ""}>${esc(t().nav[k])}</a>`).join("");
    document.querySelectorAll(".lang button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
    document.getElementById("footer").textContent = t().footer;
    const skip = document.querySelector(".skip-link"); if (skip) skip.textContent = t().skip;
  }

  async function route() {
    const hash = location.hash || "#/";
    window.Charts.tip.hide();
    for (const [re, fn, active] of routes) {
      const m = hash.match(re);
      if (m) {
        renderChrome(active);
        try {
          if (!META) META = await load("meta");
          await fn(m);
        } catch (err) {
          console.error(err);
          app.innerHTML = `<p class="notice">${esc(t().loadError)}: ${esc(err.message)}. ${esc(t().noData)}</p>`;
        }
        return;
      }
    }
    location.hash = "#/";
  }

  document.querySelectorAll(".lang button").forEach((b) => b.addEventListener("click", () => {
    lang = b.dataset.lang;
    try { localStorage.setItem("mp-lang", lang); } catch (e) { /* ignore */ }
    route();
  }));
  window.addEventListener("hashchange", () => { route(); window.scrollTo(0, 0); });
  route();
})();
