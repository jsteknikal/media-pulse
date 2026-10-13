/* Media Pulse — small SVG chart kit (no dependencies). Exposes window.Charts. */
(function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------------- tooltip */
  const tip = {
    el: null,
    show(html, x, y) {
      this.el = this.el || document.getElementById("tooltip");
      if (!this.el) return;
      this.el.innerHTML = html;
      this.el.style.display = "block";
      const r = this.el.getBoundingClientRect();
      let left = x + 14, top = y + 14;
      if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
      if (top + r.height > window.innerHeight - 8) top = y - r.height - 14;
      this.el.style.left = Math.max(8, left) + "px";
      this.el.style.top = Math.max(8, top) + "px";
    },
    hide() { if (this.el) this.el.style.display = "none"; },
  };

  function niceMax(v) {
    if (!(v > 0)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((x) => n <= x);
    return step * p;
  }

  function el(tag, attrs, parent) {
    const node = document.createElementNS(NS, tag);
    for (const k in attrs || {}) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }

  /* ---------------- line chart (one y axis, optional baseline band) */
  function lineChart(container, opts) {
    container.__opts = opts;
    draw(container);
    if (!container.__ro && "ResizeObserver" in window) {
      let w = container.clientWidth;
      container.__ro = new ResizeObserver(() => {
        if (Math.abs(container.clientWidth - w) > 4) { w = container.clientWidth; draw(container); }
      });
      container.__ro.observe(container);
    }
  }

  function draw(container) {
    const o = container.__opts;
    const series = o.series.filter((s) => s.values && s.values.length);
    const dates = o.dates;
    const n = dates.length;
    const W = Math.max(280, container.clientWidth || 600);
    const H = o.height || 240;
    const multi = series.length > 1;
    const m = { l: 46, r: multi ? 104 : 56, t: 12, b: 26 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    let max = 0;
    series.forEach((s) => s.values.forEach((v) => { if (v > max) max = v; }));
    (o.band || []).forEach((b) => { if (b && b[1] > max) max = b[1]; });
    // counts (integer: true) get whole-number ticks: a top of at least 4, in steps of a whole number
    const yMax = o.integer ? Math.max(4, Math.ceil(niceMax(max * 1.06) / 4) * 4) : niceMax(max * 1.06);
    const x = (i) => m.l + (n > 1 ? (i * iw) / (n - 1) : iw / 2);
    const y = (v) => m.t + (1 - v / yMax) * ih;
    const fmt = o.format || ((v) => v);

    container.innerHTML = "";
    const svg = el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": o.label || "chart" }, container);

    // grid + y ticks: pick a step count that gives round tick values (15 % -> 5 steps of 3 %)
    const stepOk = (k, unit) => { const q = (yMax * 1000) / k; return Math.abs(q - Math.round(q)) < 1e-6 && Math.round(q) % unit === 0; };
    const steps = o.integer ? 4 : [4, 5, 3, 6].find((k) => stepOk(k, 10)) || [4, 5, 3, 6].find((k) => stepOk(k, 5)) || 4;
    for (let k = 0; k <= steps; k++) {
      const v = (yMax * k) / steps, yy = y(v);
      el("line", { x1: m.l, x2: W - m.r, y1: yy, y2: yy, class: k === 0 ? "baseline" : "gridline" }, svg);
      const t = el("text", { x: m.l - 8, y: yy + 4, "text-anchor": "end", class: "tick" }, svg);
      t.textContent = fmt(v, true);
    }
    // x ticks
    const nt = Math.max(2, Math.min(6, n, Math.floor(iw / 80)));
    for (let k = 0; k < nt; k++) {
      const i = Math.round((k * (n - 1)) / Math.max(nt - 1, 1));
      const t = el("text", { x: x(i), y: H - 6, "text-anchor": k === 0 ? "start" : k === nt - 1 ? "end" : "middle", class: "tick" }, svg);
      t.textContent = (o.fmtDate || ((d) => d))(dates[i]);
    }
    // band (baseline range)
    if (o.band) {
      let seg = [];
      const flush = () => {
        if (seg.length > 1) {
          const top = seg.map((i) => `${x(i)},${y(o.band[i][1])}`);
          const bot = seg.slice().reverse().map((i) => `${x(i)},${y(o.band[i][0])}`);
          el("path", { d: "M" + top.concat(bot).join("L") + "Z", fill: "var(--band)" }, svg);
        }
        seg = [];
      };
      o.band.forEach((b, i) => { if (b) seg.push(i); else flush(); });
      flush();
    }
    // lines
    series.forEach((s) => {
      const d = s.values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
      el("path", { d, fill: "none", stroke: s.color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
    });
    // end markers + labels
    const ends = series.map((s) => ({ s, yy: y(s.values[n - 1] || 0) }));
    ends.forEach(({ s, yy }) => el("circle", { cx: x(n - 1), cy: yy, r: 4, fill: s.color, stroke: "var(--surface)", "stroke-width": 2 }, svg));
    const sorted = ends.slice().sort((a, b) => a.yy - b.yy);
    const separated = sorted.every((e, i) => i === 0 || e.yy - sorted[i - 1].yy >= 14);
    if (!multi && ends.length) {
      const t = el("text", { x: x(n - 1) + 9, y: ends[0].yy + 4, class: "endlabel" }, svg);
      t.textContent = fmt(series[0].values[n - 1]);
    } else if (series.length <= 4 && separated) {
      ends.forEach(({ s, yy }) => {
        const t = el("text", { x: x(n - 1) + 9, y: yy + 4, class: "endlabel" }, svg);
        t.textContent = s.name;
      });
    }

    // hover layer: crosshair + tooltip
    const hl = el("line", { y1: m.t, y2: m.t + ih, class: "hover-line", visibility: "hidden" }, svg);
    const dots = series.map((s) => el("circle", { r: 4, fill: s.color, stroke: "var(--surface)", "stroke-width": 2, visibility: "hidden" }, svg));
    const hit = el("rect", { x: m.l, y: 0, width: iw, height: H, fill: "transparent" }, svg);
    const move = (ev) => {
      const r = svg.getBoundingClientRect();
      const px = ev.clientX - r.left;
      const i = Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / iw) * (n - 1))));
      hl.setAttribute("x1", x(i)); hl.setAttribute("x2", x(i)); hl.setAttribute("visibility", "visible");
      series.forEach((s, k) => { dots[k].setAttribute("cx", x(i)); dots[k].setAttribute("cy", y(s.values[i] || 0)); dots[k].setAttribute("visibility", "visible"); });
      let html = `<div class="tt-date">${esc((o.fmtDateLong || o.fmtDate || ((d) => d))(dates[i]))}</div>`;
      series.slice().sort((a, b) => (b.values[i] || 0) - (a.values[i] || 0)).forEach((s) => {
        html += `<div class="tt-row"><span><i class="sw" style="background:${s.color}"></i>${esc(s.name)}</span><b>${esc(fmt(s.values[i] || 0))}</b></div>`;
      });
      if (o.band && o.band[i]) html += `<div class="tt-row small"><span>${esc(o.bandLabel || "")}</span><span>${esc(fmt(o.band[i][0]))}–${esc(fmt(o.band[i][1]))}</span></div>`;
      if (o.extra) html += o.extra(i);
      tip.show(html, ev.clientX, ev.clientY);
    };
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerdown", move);
    hit.addEventListener("pointerleave", () => {
      tip.hide(); hl.setAttribute("visibility", "hidden"); dots.forEach((d) => d.setAttribute("visibility", "hidden"));
    });
  }

  /* ---------------- inline SVG strings */
  function sparkline(values, w = 120, h = 28) {
    if (!values || values.length < 2) return "";
    const max = Math.max(...values, 1e-9);
    const step = (w - 6) / (values.length - 1);
    const pts = values.map((v, i) => [3 + i * step, h - 3 - (v / max) * (h - 6)]);
    const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
    const last = pts[pts.length - 1];
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}" fill="none" stroke="var(--spark)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${last[0]}" cy="${last[1]}" r="3" fill="var(--accent)" stroke="var(--surface)" stroke-width="1.5"/></svg>`;
  }

  /* current share as a bar, normal share as a tick */
  function shareBar(now, base, max, w = 120) {
    const sx = (v) => Math.max(0, Math.min(w, (v / (max || 1)) * w));
    const nb = sx(now), bb = sx(base);
    return `<svg width="${w}" height="18" viewBox="0 0 ${w} 18" aria-hidden="true"><rect x="0" y="4" width="${w}" height="10" rx="3" fill="var(--grid)"/><rect x="0" y="4" width="${Math.max(nb, 2)}" height="10" rx="3" fill="var(--series-1)"/>${base > 0 ? `<rect x="${Math.min(bb, w - 2) - 1}" y="0" width="2" height="18" rx="1" fill="var(--ink)"/>` : ""}</svg>`;
  }

  /* ---------------- story timeline: one row per outlet, a dot per article */
  function dotTimeline(container, articles, opts) {
    const times = articles.map((a) => Date.parse(a.p));
    const t0 = Math.min(...times), t1 = Math.max(...times);
    const span = Math.max(t1 - t0, 3600e3);
    const bySource = new Map();
    articles.forEach((a, i) => { if (!bySource.has(a.s)) bySource.set(a.s, []); bySource.get(a.s).push(i); });
    container.innerHTML = "";
    const W = Math.max(280, container.clientWidth || 600);
    const labelW = W < 520 ? 96 : 150, rowH = 28, padR = 14;
    const H = bySource.size * rowH + 28;
    const svg = el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.label || "timeline" }, container);
    const x = (t) => labelW + 8 + ((t - t0) / span) * (W - labelW - 8 - padR);
    let row = 0;
    bySource.forEach((idxs, src) => {
      const yy = 14 + row * rowH;
      el("line", { x1: labelW + 8, x2: W - padR, y1: yy, y2: yy, class: "gridline" }, svg);
      const t = el("text", { x: 0, y: yy + 4, class: "endlabel" }, svg);
      const name = opts.sourceName(src);
      t.textContent = name.length > (labelW < 100 ? 13 : 22) ? name.slice(0, labelW < 100 ? 12 : 21) + "…" : name;
      idxs.forEach((i) => {
        const a = articles[i];
        const c = el("circle", { cx: x(times[i]), cy: yy, r: 5, fill: "var(--series-1)", stroke: "var(--surface)", "stroke-width": 2, tabindex: 0, style: "cursor:pointer" }, svg);
        const show = (ev) => tip.show(`<div class="tt-date">${esc(opts.fmtTime(a.p))} · ${esc(name)}</div><div>${esc(a.t)}</div>`, ev.clientX ?? 0, ev.clientY ?? 0);
        c.addEventListener("pointerenter", show);
        c.addEventListener("pointermove", show);
        c.addEventListener("pointerleave", () => tip.hide());
        c.addEventListener("click", () => window.open(a.u, "_blank", "noopener"));
        c.addEventListener("keydown", (e) => { if (e.key === "Enter") window.open(a.u, "_blank", "noopener"); });
      });
      row++;
    });
    const axisY = H - 6;
    [[t0, "start"], [t1, "end"]].forEach(([t, anchor]) => {
      const tx = el("text", { x: x(t), y: axisY, "text-anchor": anchor, class: "tick" }, svg);
      tx.textContent = opts.fmtTime(new Date(t).toISOString());
    });
  }

  function hbars(rows, fmt) {
    const max = Math.max(...rows.map((r) => r.value), 1);
    return `<div class="hbars">${rows.map((r) => `<div class="hbar"><span title="${esc(r.label)}">${esc(r.label)}</span><div class="track"><div class="fill" style="width:${(r.value / max) * 100}%"></div></div><span class="v">${esc(fmt ? fmt(r.value) : r.value)}</span></div>`).join("")}</div>`;
  }

  window.Charts = { lineChart, sparkline, shareBar, dotTimeline, hbars, tip, esc };
})();
