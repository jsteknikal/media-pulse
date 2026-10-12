/* Media Pulse — dashboard app (vanilla JS, hash routing, fi/en). */
(function () {
  "use strict";
  const { esc, sparkline, shareBar, lineChart, dotTimeline, hbars } = window.Charts;
  const app = document.getElementById("app");
  const cfg = window.MP_CONFIG || {};

  /* ------------------------------------------------------------ i18n */
  const T = {
    fi: {
      nav: { pulse: "Pulssi", stories: "Tarinat", names: "Nimet", regions: "Alueet", headlines: "Otsikot", sources: "Lähteet" },
      loading: "Ladataan…",
      noData: "Dataa ei vielä ole. Ensimmäinen päivitys täyttää näkymän – käynnistä se GitHubissa tai odota tasatuntia.",
      loadError: "Datan lataus epäonnistui",
      updated: "Päivitetty", updateNow: "Päivitä nyt", sources: "lähdettä",
      kpi: { articles24: "artikkelia 24 h", sources24: "lähdettä julkaissut 24 h", stories24: "tarinaa usealla medialla 24 h", days: "päivää dataa" },
      state: { emerging: "Uusi nousija", rising: "Nousussa", peaking: "Huipussa", fading: "Hiipumassa", steady: "Tasainen", collecting: "Kerää vertailua" },
      lead: (th, now, base) => `${th} nousee: ${now} uutisista viimeiset 48 tuntia, kun normaali on ${base}.`,
      leadPeak: (th, now, base) => `${th} on huipussa: ${now} uutisista viimeiset 48 tuntia, normaali ${base}.`,
      leadCalm: "Ei selviä nousijoita – uutisaiheet ovat tavanomaisella tasollaan.",
      leadCollecting: (d) => `Vertailudataa kerätään (${d} pv). Trendit näkyvät, kun dataa on noin viikolta.`,
      alsoRising: (list) => `Myös ${list} nousevat.`,
      alsoFading: (list) => `${list} hiipuu.`,
      boardTitle: "Teemat nyt",
      boardNote: "Osuus = teeman artikkelit viimeisten 48 tunnin uutisista. Pystyviiva on teeman tavallinen osuus (3–30 päivää sitten).",
      col: { theme: "Teema", state: "Tila", share: "Osuus nyt · normaali", trend: "30 pv", change: "Muutos" },
      untagged: (p) => `${p} artikkeleista ei osunut mihinkään teemaan.`,
      topStories: "Tarinat nyt", topStoriesNote: "Usean median samasta aiheesta tekemät jutut, ryhmiteltynä.",
      risingNames: "Nousevat nimet", mostNamed: "Mainituimmat 30 pv",
      articles: "artikkelia", outlets: "mediaa", firstBy: "Ensimmäisenä",
      allStories: "Kaikki tarinat", noStories: "Ei vielä tarinoita, joita useampi media olisi uutisoinut.",
      share: "Osuus uutisista", normalRange: "Normaali vaihteluväli", normal: "normaali",
      themeStatement: (th, now, base) => `${th}: ${now} uutisista viimeiset 48 tuntia. Normaali osuus on ${base}.`,
      showTable: "Näytä taulukkona", hideTable: "Piilota taulukko",
      date: "Päivä", count: "Artikkeleita", byOutlet: "Kuka uutisoi", namesInTheme: "Nimet teemassa (30 pv)",
      relatedThemes: "Usein samassa jutussa", latest: "Tuoreimmat otsikot", storiesInTheme: "Teeman tarinat",
      days: (n) => `${n} pv`,
      filterTheme: "Kaikki teemat", filterSource: "Kaikki mediat", search: "Hae otsikoista…", searchNames: "Hae nimeä…",
      shownOf: (a, b) => `Näytetään ${a} / ${b}`,
      namesTitle: "Nimet uutisissa", namesNote: "Henkilöt, organisaatiot ja paikat, tunnistettu isoista alkukirjaimista. Taivutusmuodot yhdistetään karkeasti.",
      ncol: { name: "Nimi", n48: "48 h", n7: "7 pv", n30: "30 pv", trend: "30 pv", themes: "Teemat" },
      regionsTitle: "Teemat alueittain",
      regionsNote: "Muutos tavalliseen osuuteen nähden. Lähde: GDELT, joka seuraa verkkomediaa maailmanlaajuisesti; osuus = teeman osuus kaikista seuratuista teemoista alueella. Suomi on tässä mukana GDELTin kautta, jotta alueet ovat vertailukelpoisia.",
      regionsEmpty: "Aluedata haetaan GDELTista kerran vuorokaudessa. Ensimmäinen haku kestää noin 15 minuuttia ja tapahtuu seuraavassa päivityksessä.",
      compareTitle: (th) => `${th} eri alueilla`, regionHeadlines: "Alueiden otsikot (24 h)", pickTheme: "Valitse teema",
      headlinesTitle: "Otsikot", headlinesNote: "Kaikki haetut otsikot kolmelta viime päivältä. Linkit vievät alkuperäiseen juttuun.",
      sourcesTitle: "Lähteet", sourcesNote: "Seurattavat mediat ja viimeisimmän haun tila. Syötteitä voi lisätä tai korjata tiedostossa pipeline/config/sources.json.",
      scol: { outlet: "Media", status: "Tila", n24: "24 h", n7: "7 pv", last: "Viimeisin", notes: "Huomiot" },
      sstate: { ok: "Toimii", partial: "Osittain", failed: "Ei toimi", disabled: "Pois päältä", not_run: "Ei haettu" },
      types: { public_broadcaster: "yleisradio", national_daily: "valtakunnallinen päivälehti", tabloid: "iltapäivälehti", commercial_tv: "kaupallinen tv", business: "talousmedia", regional: "maakuntalehti", online: "verkkomedia" },
      unverified: "Syötteen osoite tarkistamatta", discovered: "Löytyi syöte:", gdeltTitle: "GDELT-aluedata",
      gdeltStatus: (ok, q, when) => `${ok}/${q} hakua onnistui, viimeksi ${when}.`, gdeltNever: "GDELT-hakua ei ole vielä tehty.",
      gdeltFailed: "Epäonnistuneet haut",
      footer: "Data: suomalaisten medioiden julkiset RSS-syötteet ja GDELT Project. Otsikot linkittävät alkuperäiseen julkaisuun. Päivittyy tunneittain.",
      ago: (h) => (h < 1 ? "alle tunti sitten" : h < 24 ? `${Math.round(h)} h sitten` : `${Math.round(h / 24)} pv sitten`),
      back: "Takaisin", openArticle: "Avaa juttu",
    },
    en: {
      nav: { pulse: "Pulse", stories: "Stories", names: "Names", regions: "Regions", headlines: "Headlines", sources: "Sources" },
      loading: "Loading…",
      noData: "No data yet. The first update fills this page – start it on GitHub or wait for the top of the hour.",
      loadError: "Could not load data",
      updated: "Updated", updateNow: "Update now", sources: "sources",
      kpi: { articles24: "articles in 24 h", sources24: "outlets published in 24 h", stories24: "stories across outlets in 24 h", days: "days of data" },
      state: { emerging: "Emerging", rising: "Rising", peaking: "Peaking", fading: "Fading", steady: "Steady", collecting: "Building baseline" },
      lead: (th, now, base) => `${th} is rising: ${now} of news in the last 48 hours, against ${base} normally.`,
      leadPeak: (th, now, base) => `${th} is peaking: ${now} of news in the last 48 hours, against ${base} normally.`,
      leadCalm: "No clear risers – news themes are at their usual levels.",
      leadCollecting: (d) => `Building a baseline (${d} days so far). Trends appear after about a week of data.`,
      alsoRising: (list) => `${list} are also rising.`,
      alsoFading: (list) => `${list} is fading.`,
      boardTitle: "Themes now",
      boardNote: "Share = the theme's articles in the last 48 hours of news. The tick marks its usual share (3–30 days ago).",
      col: { theme: "Theme", state: "State", share: "Share now · normal", trend: "30 days", change: "Change" },
      untagged: (p) => `${p} of articles matched no theme.`,
      topStories: "Stories now", topStoriesNote: "Coverage of the same event by several outlets, grouped.",
      risingNames: "Rising names", mostNamed: "Most mentioned, 30 days",
      articles: "articles", outlets: "outlets", firstBy: "First by",
      allStories: "All stories", noStories: "No stories covered by several outlets yet.",
      share: "Share of news", normalRange: "Normal range", normal: "normal",
      themeStatement: (th, now, base) => `${th}: ${now} of news in the last 48 hours. Its normal share is ${base}.`,
      showTable: "Show as table", hideTable: "Hide table",
      date: "Date", count: "Articles", byOutlet: "Who covers it", namesInTheme: "Names in this theme (30 days)",
      relatedThemes: "Often in the same article", latest: "Latest headlines", storiesInTheme: "Stories in this theme",
      days: (n) => `${n} d`,
      filterTheme: "All themes", filterSource: "All outlets", search: "Search headlines…", searchNames: "Search names…",
      shownOf: (a, b) => `Showing ${a} of ${b}`,
      namesTitle: "Names in the news", namesNote: "People, organisations and places, detected from capitalised words. Finnish case forms are merged roughly.",
      ncol: { name: "Name", n48: "48 h", n7: "7 d", n30: "30 d", trend: "30 days", themes: "Themes" },
      regionsTitle: "Themes by region",
      regionsNote: "Change against each theme's normal share. Source: GDELT, which monitors online news worldwide; share = the theme's share of all tracked themes in the region. Finland appears here via GDELT so the regions are comparable.",
      regionsEmpty: "Regional data comes from GDELT once a day. The first pull takes about 15 minutes and happens in the next update.",
      compareTitle: (th) => `${th} across regions`, regionHeadlines: "Regional headlines (24 h)", pickTheme: "Pick a theme",
      headlinesTitle: "Headlines", headlinesNote: "Every headline collected in the last three days. Links go to the original article.",
      sourcesTitle: "Sources", sourcesNote: "Outlets tracked and the status of the latest fetch. Add or fix feeds in pipeline/config/sources.json.",
      scol: { outlet: "Outlet", status: "Status", n24: "24 h", n7: "7 d", last: "Latest", notes: "Notes" },
      sstate: { ok: "Working", partial: "Partly", failed: "Failing", disabled: "Disabled", not_run: "Not fetched" },
      types: { public_broadcaster: "public broadcaster", national_daily: "national daily", tabloid: "tabloid", commercial_tv: "commercial TV", business: "business media", regional: "regional daily", online: "online news" },
      unverified: "Feed URL not yet verified", discovered: "Found feed:", gdeltTitle: "GDELT regional data",
      gdeltStatus: (ok, q, when) => `${ok}/${q} queries succeeded, last run ${when}.`, gdeltNever: "No GDELT pull yet.",
      gdeltFailed: "Failed queries",
      footer: "Data: public RSS feeds of Finnish outlets and the GDELT Project. Headlines link to the original publisher. Updated hourly.",
      ago: (h) => (h < 1 ? "under an hour ago" : h < 24 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} d ago`),
      back: "Back", openArticle: "Open article",
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
    const g = { emerging: "↑", rising: "↗", peaking: "–", fading: "↘", steady: "·", collecting: "…" }[state] || "·";
    return `<span class="state ${esc(state)}"><span class="g" aria-hidden="true">${g}</span>${esc(t().state[state] || state)}</span>`;
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
    if (!P.baseline_ready) statement = t().leadCollecting(k.days_of_data);
    else if (hot.length) {
      const lead = hot[0];
      statement = (lead.state === "peaking" ? t().leadPeak : t().lead)(themeName(lead.id), pct(lead.share_now), pct(lead.baseline));
      const more = hot.slice(1, 3).map((x) => themeName(x.id).toLowerCase());
      if (more.length) extra.push(cap(t().alsoRising(listJoin(more))));
    } else statement = t().leadCalm;
    const fading = ranked.filter((x) => x.state === "fading").slice(-1);
    if (P.baseline_ready && fading.length) extra.push(cap(t().alsoFading(themeName(fading[0].id))));

    const maxShare = Math.max(...ranked.map((x) => Math.max(x.share_now, x.baseline)), 0.01);
    const rows = ranked.map((x) => `
      <a class="board-row" href="#/theme/${esc(x.id)}">
        <span class="name">${esc(themeName(x.id))}</span>
        ${stateBadge(x.state)}
        <span class="share-cell"><span class="val">${esc(pct(x.share_now))}</span>${shareBar(x.share_now, x.baseline, maxShare, 120)}<span class="small">${esc(pct(x.baseline))}</span></span>
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
      <section class="lede-block">
        <h1 class="statement">${esc(statement)}</h1>
        ${extra.length ? `<p class="sub">${esc(extra.join(" "))}</p>` : ""}
        <div class="meta-line"><span>${esc(t().updated)} <strong>${esc(fmtTime(P.updated))}</strong></span>
          <a class="btn" href="${esc(actionsUrl())}" target="_blank" rel="noopener">${esc(t().updateNow)}</a></div>
        <div class="kpis">
          <div class="kpi"><div class="v">${num(k.articles24)}</div><div class="l">${esc(t().kpi.articles24)}</div></div>
          <div class="kpi"><div class="v">${num(k.sources24)}</div><div class="l">${esc(t().kpi.sources24)}</div></div>
          <div class="kpi"><div class="v">${num(k.stories24)}</div><div class="l">${esc(t().kpi.stories24)}</div></div>
          <div class="kpi"><div class="v">${num(k.days_of_data)}</div><div class="l">${esc(t().kpi.days)}</div></div>
        </div>
      </section>
      <section class="section">
        <div class="section-head"><h2>${esc(t().boardTitle)}</h2><p>${esc(t().boardNote)}</p></div>
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

  async function viewTheme(id) {
    const [D, S] = await Promise.all([load(`themes/${id}`), load("stories")]);
    const name = themeName(id);
    let range = 90, outletRange = "30";
    app.innerHTML = `
      <section class="lede-block">
        <p class="small"><a href="#/">${esc(t().nav.pulse)}</a></p>
        <h1 class="statement">${esc(t().themeStatement(name, pct(D.share_now), pct(D.baseline)))}</h1>
        <div class="meta-line">${stateBadge(D.state)}<span>${esc(t().col.change)} <strong>${esc(signedPct(D.delta))}</strong></span><span>${num(D.n48)} ${esc(t().articles)} · ${num(D.sources48)} ${esc(t().outlets)} (48 h)</span></div>
      </section>
      <section class="panel chart-wrap">
        <div class="chart-tools">
          <div class="legend"><span><i class="key" style="background:var(--series-1)"></i>${esc(t().share)}</span><span><i class="key band"></i>${esc(t().normalRange)}</span></div>
          <div class="seg" role="group" id="rangeSeg">${[30, 90, 120].map((d) => `<button type="button" data-d="${d}" aria-pressed="${d === range}">${esc(t().days(d))}</button>`).join("")}</div>
        </div>
        <div class="chart" id="themeChart"></div>
        <div id="themeTable"></div>
      </section>
      <div class="cols section">
        <section><div class="section-head"><h2>${esc(t().byOutlet)}</h2>
          <div class="seg" role="group" id="outletSeg">${["7", "30", "90"].map((d) => `<button type="button" data-d="${d}" aria-pressed="${d === outletRange}">${esc(t().days(d))}</button>`).join("")}</div></div>
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
      <div class="filters"><label class="sr-only" for="stTheme">${esc(t().filterTheme)}</label>
        <select id="stTheme"><option value="">${esc(t().filterTheme)}</option>${META.themes.map((th) => `<option value="${esc(th.id)}">${esc(th[lang])}</option>`).join("")}</select></div>
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
      <div class="filters"><label class="sr-only" for="nq">${esc(t().searchNames)}</label><input id="nq" type="search" placeholder="${esc(t().searchNames)}"></div>
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
    const cell = (r, th) => {
      const d = R.regions[r].themes[th];
      if (!d) return `<td class="cell">–</td>`;
      const v = d.delta ?? 0;
      const amt = Math.round(Math.min(Math.abs(v), 1) * 85);
      const col = v >= 0 ? "var(--div-pos)" : "var(--div-neg)";
      const ink = amt > 50 ? "#fff" : "var(--ink)";
      return `<td class="cell" style="background:color-mix(in oklab, ${col} ${amt}%, var(--div-mid));color:${ink}"><a href="#/regions/${esc(th)}" aria-label="${esc(themeName(th))}, ${esc(regionName(r))}: ${esc(signedPct(d.delta))}">${esc(signedPct(d.delta))}</a></td>`;
    };
    app.innerHTML = `
      <section class="lede-block"><h1 class="statement">${esc(t().regionsTitle)}</h1><p class="sub">${esc(t().regionsNote)}</p>
        <div class="meta-line"><span>GDELT ${esc(t().updated.toLowerCase())} <strong>${esc(fmtTime(R.fetched || R.updated))}</strong></span></div></section>
      <section class="panel table-scroll"><table class="data grid-heat"><thead><tr><th>${esc(t().col.theme)}</th>${regionIds.map((r) => `<th class="n" style="text-align:center">${esc(regionName(r))}</th>`).join("")}</tr></thead>
        <tbody>${themeIds.map((th) => `<tr${th === sel ? ' style="outline:2px solid var(--accent);outline-offset:-2px"' : ""}><td><a href="#/regions/${esc(th)}">${esc(themeName(th))}</a></td>${regionIds.map((r) => cell(r, th)).join("")}</tr>`).join("")}</tbody></table></section>
      <section class="section panel chart-wrap"><div class="chart-tools"><h2>${esc(t().compareTitle(themeName(sel)))}</h2>
        <label class="sr-only" for="rTheme">${esc(t().pickTheme)}</label><select id="rTheme" class="btn">${themeIds.map((th) => `<option value="${esc(th)}" ${th === sel ? "selected" : ""}>${esc(themeName(th))}</option>`).join("")}</select></div>
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
        <label class="sr-only" for="hq">${esc(t().search)}</label><input id="hq" type="search" placeholder="${esc(t().search)}">
        <label class="sr-only" for="ht">${esc(t().filterTheme)}</label><select id="ht"><option value="">${esc(t().filterTheme)}</option>${META.themes.map((th) => `<option value="${esc(th.id)}">${esc(th[lang])}</option>`).join("")}</select>
        <label class="sr-only" for="hs">${esc(t().filterSource)}</label><select id="hs"><option value="">${esc(t().filterSource)}</option>${META.sources.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("")}</select>
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
      <section class="section"><h2>${esc(t().gdeltTitle)}</h2>
        <p>${g?.last_run ? esc(t().gdeltStatus(g.ok, g.queries, fmtTime(g.last_run))) : esc(t().gdeltNever)}${g?.stopped ? ` <span class="small">(${esc(g.stopped)})</span>` : ""}</p>
        ${failed.length ? `<h3>${esc(t().gdeltFailed)}</h3><ul class="small">${failed.slice(0, 30).map((e) => `<li>${esc(regionName(e.region))} / ${esc(themeName(e.theme))}: ${esc(e.timeline_error || e.articles_error)}</li>`).join("")}</ul>` : ""}
      </section>`;
  }

  /* ------------------------------------------------------------ shell */
  const routes = [
    [/^#?\/?$/, () => viewPulse(), "pulse"],
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
    document.getElementById("nav").innerHTML = ["pulse", "stories", "names", "regions", "headlines", "sources"].map((k) =>
      `<a href="#/${k === "pulse" ? "" : k}" ${k === active ? 'aria-current="page"' : ""}>${esc(t().nav[k])}</a>`).join("");
    document.querySelectorAll(".lang button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
    document.getElementById("footer").textContent = t().footer;
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
