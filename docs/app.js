/* 225 Pounds of Bad Intentions: site logic.
 * No build step and no dependencies. Charts are hand-drawn SVG.
 */
(() => {
  'use strict';

  // ---------------------------------------------------------------- config
  const CONFIG = {
    startWeight: 168,
    goalWeight: 225,
    weeklyTargetLb: 5,
    // 'YYYY-MM-DD'. null = first day that has data.
    startDate: null,
    // 'YYYY-MM-DD'. null = startDate + enough weeks to hit the goal at weeklyTargetLb.
    goalDate: null,
    // Where the published data lives, tried in order. GitHub Pages serves /docs,
    // so the sync workflow copies public data into docs/data/.
    dataBases: ['data/', '../data/'],
    sleepGoalHours: 7,
    stepsGoal: 10000,
  };

  // Confirmed ladder. Names are used exactly as written in the SOP.
  // Colors step through one blue ramp (light to dark) so each rung reads as "further along".
  const MILESTONES = [
    { min: 168, max: 173, name: "Oh Shoot, He's Really Doing It", color: '#86b6ef' },
    { min: 173, max: 180, name: 'Pardon My Gains', color: '#6da7ec' },
    { min: 180, max: 186, name: 'Grown Man Portions', color: '#5598e7' },
    { min: 186, max: 190, name: 'Five Meals a Day, Keep the Gains at Play', color: '#3987e5' },
    { min: 190, max: 196, name: 'Uncharted Territory', color: '#2a78d6' },
    { min: 196, max: 202, name: '200 and Feeling Dangerous', color: '#256abf' },
    { min: 202, max: 210, name: 'Big Boy Rules', color: '#1c5cab' },
    { min: 210, max: 218, name: 'Heavyweight Behavior', color: '#184f95' },
    { min: 218, max: 225, name: 'Steven Jeanty, Built for Plenty — 225 Pounds of Bad Intentions', color: '#104281', finale: true },
  ];
  const GOAL_COLOR = '#eb6834';

  // Provisional point values (BI-003 will replace these).
  const POINTS = {
    weight: { label: 'Weight gain goal', max: 30 },  // scaled by % of the weekly target hit so far
    sleep: { label: 'Sleep', per: 4, max: 28 },      // per night at or above the sleep goal
    exercise: { label: 'Exercise', per: 5, max: 25 }, // per logged workout
    nutrition: { label: 'Nutrition', per: 2, max: 14 }, // per day with a food log
    meds: { label: 'Medication', per: 1, max: 21 },  // per check ticked
  };

  // ------------------------------------------------------------- utilities
  const $ = (sel, root = document) => root.querySelector(sel);
  const DAY = 864e5;
  const toDn = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) / DAY; };
  const fromDn = (n) => new Date(n * DAY).toISOString().slice(0, 10);
  const localToday = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const fmtDate = (s, opts = { month: 'short', day: 'numeric' }) =>
    new Date(toDn(s) * DAY).toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' });
  const fmt1 = (n) => (n == null ? '—' : n.toFixed(1));
  const fmtInt = (n) => (n == null ? '—' : Math.round(n).toLocaleString());
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hash = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
  const store = {
    get(k, fallback) { try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } },
  };

  function milestoneFor(w) {
    if (!isNum(w)) return null;
    if (w >= CONFIG.goalWeight) return MILESTONES[MILESTONES.length - 1];
    return MILESTONES.find((m) => w < m.max) || MILESTONES[0];
  }

  // Mood 1–10 → red..amber..green. The face shape (frown → smile) and the number
  // carry the value too, so color is never the only cue.
  function moodColor(m) {
    const stops = [[1, [208, 59, 59]], [5.5, [250, 178, 25]], [10, [12, 163, 12]]];
    const t = clamp(m, 1, 10);
    const [a, b] = t <= 5.5 ? [stops[0], stops[1]] : [stops[1], stops[2]];
    const f = (t - a[0]) / (b[0] - a[0]);
    const c = a[1].map((v, i) => Math.round(v + (b[1][i] - v) * f));
    return `rgb(${c.join(',')})`;
  }
  function moodFacePath(m) {
    const k = (clamp(m, 1, 10) - 5.5) / 4.5; // -1 frown .. +1 smile
    return `M7 15 Q12 ${(15 + 5 * k).toFixed(2)} 17 15`;
  }
  function moodFaceSVG(m, size = 40) {
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" role="img" aria-label="Mood ${m} of 10">
      <circle cx="12" cy="12" r="11" fill="${moodColor(m)}"/>
      <circle cx="8.5" cy="9.5" r="1.4" fill="#0b0b0b"/><circle cx="15.5" cy="9.5" r="1.4" fill="#0b0b0b"/>
      <path d="${moodFacePath(m)}" fill="none" stroke="#0b0b0b" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  }

  // ------------------------------------------------------------ data load
  const params = new URLSearchParams(location.search);
  const DEMO = params.has('demo');
  if (params.has('owner')) store.set('bi.owner', true);
  const OWNER = store.get('bi.owner', false);

  async function loadJSON(name) {
    for (const base of CONFIG.dataBases) {
      try {
        const res = await fetch(base + name, { cache: 'no-cache' });
        if (res.ok) return await res.json();
      } catch { /* try next base */ }
    }
    return null;
  }

  // Seeded generator for ?demo so the page can be previewed before real data exists.
  function demoData() {
    let seed = 42;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const end = toDn(localToday());
    const startDn = end - 41;
    const days = {}, entries = {};
    let w = 168.4;
    for (let dn = startDn; dn <= end; dn++) {
      const date = fromDn(dn);
      w += 0.62 + (rnd() - 0.5) * 1.3;
      const day = {};
      if (rnd() > 0.2) day.weight = +w.toFixed(1);
      if (rnd() > 0.08) day.sleep = +(5.2 + rnd() * 3.4).toFixed(1);
      if (rnd() > 0.05) day.steps = Math.round(5500 + rnd() * 11000);
      days[date] = day;
      if (rnd() > 0.15) {
        entries[date] = {
          mood: Math.round(clamp(6 + (rnd() - 0.5) * 6 + (day.sleep > 7 ? 1 : -1), 1, 10)),
          checks: [rnd() > 0.1, rnd() > 0.15, rnd() > 0.25].filter(Boolean).length,
          workout: rnd() > 0.4,
          ate: rnd() > 0.2,
        };
      }
    }
    return { health: { updated: new Date().toISOString(), days }, manual: { entries } };
  }

  // Normalize an entry from either the public file or the owner's local log.
  function normEntry(e) {
    if (!e) return null;
    const checks = isNum(e.checks) ? e.checks : ['am1', 'am2', 'pm'].filter((k) => e[k]).length;
    return {
      mood: isNum(e.mood) ? e.mood : null,
      checks,
      workout: !!e.workout,
      ate: typeof e.ate === 'boolean' ? e.ate : !!(e.nutrition && e.nutrition.trim()),
    };
  }

  // Build one row per calendar day from first to last data day.
  function buildRows(health, manual, local) {
    const hd = (health && health.days) || {};
    const me = { ...((manual && manual.entries) || {}), ...local };
    const dates = [...Object.keys(hd), ...Object.keys(me)].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    if (!dates.length) return [];
    let first = toDn(dates[0]);
    if (CONFIG.startDate) first = Math.min(first, toDn(CONFIG.startDate));
    const last = toDn(dates[dates.length - 1]);
    const rows = [];
    for (let dn = first; dn <= last; dn++) {
      const date = fromDn(dn);
      const h = hd[date] || {};
      const e = normEntry(me[date]);
      rows.push({
        date, dn,
        wRaw: isNum(h.weight) ? h.weight : null,
        sleep: isNum(h.sleep) ? h.sleep : null,
        steps: isNum(h.steps) ? h.steps : null,
        mood: e ? e.mood : null,
        checks: e ? e.checks : 0,
        workout: e ? e.workout : false,
        ate: e ? e.ate : false,
        logged: !!e,
      });
    }
    // Interpolate weight gaps linearly (no extrapolation past the first/last weigh-in),
    // then smooth with a centered 7-day mean (truncated at the edges).
    const known = rows.map((r, i) => (r.wRaw != null ? i : -1)).filter((i) => i >= 0);
    const interp = new Array(rows.length).fill(null);
    for (let k = 0; k < known.length; k++) {
      const i = known[k];
      interp[i] = rows[i].wRaw;
      const j = known[k + 1];
      if (j != null) for (let t = i + 1; t < j; t++) interp[t] = rows[i].wRaw + (rows[j].wRaw - rows[i].wRaw) * ((t - i) / (j - i));
    }
    rows.forEach((r, i) => {
      if (interp[i] == null) { r.w = null; return; }
      let s = 0, n = 0;
      for (let t = i - 3; t <= i + 3; t++) if (interp[t] != null) { s += interp[t]; n++; }
      r.w = s / n;
    });
    return rows;
  }

  // ---------------------------------------------------------------- facts
  let FACTS = { sources: {}, facts: [] };
  function factCondition(row, rows, i) {
    const c = new Set();
    if (row) {
      if (isNum(row.sleep) && row.sleep < CONFIG.sleepGoalHours) c.add('sleep-low');
      if (isNum(row.steps) && row.steps >= CONFIG.stepsGoal) c.add('steps-high');
      if (isNum(row.mood) && row.mood <= 4) c.add('mood-low');
      const prev = rows && rows[i - 7];
      if (isNum(row.w) && prev && isNum(prev.w) && row.w - prev.w < 1) c.add('weight-flat');
    }
    return c;
  }
  function pickFact(topic, key, conds = new Set()) {
    const pool = FACTS.facts.filter((f) => f.topic === topic);
    if (!pool.length) return null;
    const matched = pool.filter((f) => f.when && conds.has(f.when));
    const general = pool.filter((f) => !f.when);
    const list = matched.length ? matched : (general.length ? general : pool);
    return list[hash(key) % list.length];
  }
  const factSource = (f) => `${FACTS.sources[f.source] || f.source}${f.where ? `, ${f.where}` : ''}`;

  // --------------------------------------------------------------- render
  let ROWS = [];
  let range = store.get('bi.range', 28);
  let charts = [];

  function render(health) {
    const hasData = ROWS.length > 0;
    $('#empty-state').hidden = hasData;
    $('#trends').hidden = !hasData;
    renderHero(health);
    renderLadder();
    renderBadges();
    renderScore();
    if (hasData) renderCharts();
  }

  function startDn() {
    if (CONFIG.startDate) return toDn(CONFIG.startDate);
    return ROWS.length ? ROWS[0].dn : toDn(localToday());
  }
  function goalDn() {
    if (CONFIG.goalDate) return toDn(CONFIG.goalDate);
    const weeks = Math.ceil((CONFIG.goalWeight - CONFIG.startWeight) / CONFIG.weeklyTargetLb);
    return startDn() + weeks * 7;
  }

  function renderHero(health) {
    const weighed = ROWS.filter((r) => r.wRaw != null);
    const latest = weighed[weighed.length - 1];
    const w = latest ? latest.wRaw : null;
    const m = milestoneFor(w ?? CONFIG.startWeight);
    const done = isNum(w) && w >= CONFIG.goalWeight;
    $('#hero-title').textContent = done ? 'Goal reached: 225 Pounds of Bad Intentions' : m.name;

    $('#stat-weight').textContent = w != null ? `${fmt1(w)} lb` : '—';
    if (latest) {
      const li = ROWS.indexOf(latest);
      const wk = ROWS[li - 7];
      const delta = wk && isNum(wk.w) && isNum(latest.w) ? latest.w - wk.w : null;
      $('#stat-weight-sub').textContent = `trend ${fmt1(latest.w)}${delta != null ? ` · ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} this week` : ''}`;
    } else {
      $('#stat-weight-sub').textContent = `start ${CONFIG.startWeight} lb`;
    }

    const today = toDn(localToday());
    const gdn = goalDn();
    const left = Math.max(0, gdn - today);
    $('#stat-days').textContent = String(left);
    $('#stat-days-sub').textContent = `goal date ${fmtDate(fromDn(gdn))}`;

    const toGo = Math.max(0, CONFIG.goalWeight - (w ?? CONFIG.startWeight));
    $('#stat-togo').textContent = `${fmt1(toGo)} lb`;
    $('#stat-togo-sub').textContent = left > 0 && toGo > 0 ? `needs ${(toGo / (left / 7)).toFixed(1)} lb/week` : (toGo > 0 ? 'past goal date' : 'done');

    // Progress bar: one segment per rung, each filled in its own rung color.
    const track = $('#progress-track');
    const cur = clamp(w ?? CONFIG.startWeight, CONFIG.startWeight, CONFIG.goalWeight);
    track.innerHTML = MILESTONES.map((ms) => {
      const pct = clamp((cur - ms.min) / (ms.max - ms.min), 0, 1) * 100;
      return `<div class="progress-seg" style="flex:${ms.max - ms.min}" title="${esc(`${ms.min}–${ms.max}: ${ms.name}`)}">
        <div class="progress-fill" style="width:${pct}%;background:${ms.color}"></div></div>`;
    }).join('') + `<div class="progress-marker" style="left:${((cur - CONFIG.startWeight) / (CONFIG.goalWeight - CONFIG.startWeight)) * 100}%"></div>`;
    $('#progress').setAttribute('aria-label', `Progress: ${fmt1(cur)} of ${CONFIG.goalWeight} pounds, milestone "${m.name}"`);

    const upd = health && health.updated ? new Date(health.updated) : null;
    $('#freshness').textContent = upd && !isNaN(upd)
      ? `Synced from Apple Health · updated ${upd.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
      : (ROWS.length ? '' : 'Waiting for the first Apple Health sync.');
  }

  function renderLadder() {
    const latest = [...ROWS].reverse().find((r) => r.wRaw != null);
    const cur = milestoneFor(latest ? latest.wRaw : CONFIG.startWeight);
    $('#ladder').innerHTML = [...MILESTONES].reverse().map((ms) => `
      <li class="rung${ms === cur ? ' current' : ''}${ms.finale ? ' finale' : ''}">
        <span class="rung-swatch" style="background:${ms.color}" aria-hidden="true"></span>
        <span class="rung-range">${ms.min}–${ms.max}</span>
        <span class="rung-name">${esc(ms.name)}</span>
      </li>`).join('');
  }

  function renderBadges() {
    // Badges unlock on the smoothed trend so one heavy morning can't unlock one early.
    const best = ROWS.reduce((mx, r) => (isNum(r.w) && r.w > mx ? r.w : mx), -Infinity);
    const any = ROWS.some((r) => r.wRaw != null);
    const items = MILESTONES.map((ms, i) => ({
      label: String(ms.min), name: ms.name, color: ms.color,
      unlocked: i === 0 ? any : best >= ms.min,
      need: i === 0 ? 'first weigh-in' : `${ms.min} lb trend`,
    }));
    items.push({ label: '225', name: '225 Pounds of Bad Intentions', color: GOAL_COLOR, unlocked: best >= CONFIG.goalWeight, need: '225 lb trend' });
    $('#badges').innerHTML = items.map((b) => `
      <li class="badge${b.unlocked ? '' : ' locked'}">
        <div class="badge-disc" style="background:${b.color}" aria-hidden="true">${b.label}</div>
        ${esc(b.name)}
        <span class="badge-state">${b.unlocked ? 'Unlocked' : `Locked · ${b.need}`}</span>
      </li>`).join('');
  }

  function renderScore() {
    const todayDn = toDn(localToday());
    const dow = (new Date(todayDn * DAY).getUTCDay() + 6) % 7; // Monday = 0
    const mon = todayDn - dow;
    const elapsed = dow + 1;
    const week = ROWS.filter((r) => r.dn >= mon && r.dn <= todayDn);
    const byDn = new Map(ROWS.map((r) => [r.dn, r]));

    // Weight: trend gain since the day before Monday vs the pro-rated weekly target.
    const before = byDn.get(mon - 1);
    const lastW = [...week].reverse().find((r) => isNum(r.w));
    const firstW = before && isNum(before.w) ? before : week.find((r) => isNum(r.w));
    const gain = lastW && firstW && lastW !== firstW ? lastW.w - firstW.w : 0;
    const target = CONFIG.weeklyTargetLb * (elapsed / 7);

    const s = {
      weight: Math.round(clamp(gain / target, 0, 1) * POINTS.weight.max),
      sleep: Math.min(POINTS.sleep.max, week.filter((r) => isNum(r.sleep) && r.sleep >= CONFIG.sleepGoalHours).length * POINTS.sleep.per),
      exercise: Math.min(POINTS.exercise.max, week.filter((r) => r.workout).length * POINTS.exercise.per),
      nutrition: Math.min(POINTS.nutrition.max, week.filter((r) => r.ate).length * POINTS.nutrition.per),
      meds: Math.min(POINTS.meds.max, week.reduce((a, r) => a + r.checks, 0) * POINTS.meds.per),
    };
    const total = Object.values(s).reduce((a, b) => a + b, 0);
    const max = Object.values(POINTS).reduce((a, p) => a + p.max, 0);
    $('#score-total').textContent = String(total);
    $('#score-max').textContent = `/ ${max} pts`;
    $('#score-list').innerHTML = Object.entries(POINTS).map(([k, p]) => `
      <li class="score-item">
        <span>${p.label}</span>
        <span class="score-bar" aria-hidden="true"><span style="width:${(s[k] / p.max) * 100}%"></span></span>
        <span class="score-pts">${s[k]} / ${p.max}</span>
      </li>`).join('');

    // Streak: consecutive days with a weigh-in or a log entry, ending today (or yesterday
    // if today hasn't been logged yet).
    let dn = todayDn;
    const active = (r) => r && (r.wRaw != null || r.logged);
    if (!active(byDn.get(dn))) dn--;
    let streak = 0;
    while (active(byDn.get(dn))) { streak++; dn--; }
    $('#streak').textContent = `${streak}-day streak`;
  }

  // --------------------------------------------------------------- charts
  function niceTicks(lo, hi, count = 4) {
    const span = hi - lo || 1;
    const step0 = span / count;
    const mag = 10 ** Math.floor(Math.log10(step0));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) || step0;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
    return out;
  }
  function barPath(x, y, w, h, r) {
    r = Math.min(r, w / 2, h);
    if (h <= 0) return '';
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }

  function visibleRows() {
    return range > 0 ? ROWS.slice(-range) : ROWS;
  }

  function renderCharts() {
    const rows = visibleRows();
    const specs = [
      { id: 'chart-weight', topic: 'weight', h: 150, kind: 'line', val: (r) => r.w },
      { id: 'chart-sleep', topic: 'sleep', h: 110, kind: 'bar', val: (r) => r.sleep, goal: CONFIG.sleepGoalHours, goalLabel: `${CONFIG.sleepGoalHours}h`, floor0: true },
      { id: 'chart-steps', topic: 'steps', h: 110, kind: 'bar', val: (r) => r.steps, goal: CONFIG.stepsGoal, goalLabel: '10k', floor0: true, tickFmt: (v) => (v >= 1000 ? `${v / 1000}k` : String(v)) },
      { id: 'chart-mood', topic: 'mood', h: 110, kind: 'mood', val: (r) => r.mood, domain: [1, 10], ticks: [1, 5, 10] },
    ];
    charts = specs.map((spec) => drawChart(spec, rows));
    renderTable(rows);
  }

  function drawChart(spec, rows) {
    const fig = $('#' + spec.id);
    const plot = $('.plot', fig);
    const W = Math.max(280, plot.clientWidth || fig.clientWidth || 600);
    const H = spec.h;
    const m = { l: 40, r: 10, t: 10, b: 22 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const n = rows.length;
    const bw = iw / Math.max(n, 1);
    const xOf = (i) => m.l + (i + 0.5) * bw;

    const vals = rows.map(spec.val).filter(isNum);
    let lo, hi;
    if (spec.domain) [lo, hi] = spec.domain;
    else if (!vals.length) [lo, hi] = [0, 1];
    else {
      lo = spec.floor0 ? 0 : Math.min(...vals);
      hi = Math.max(...vals, spec.goal || -Infinity);
      if (!spec.floor0) { const pad = Math.max(1, (hi - lo) * 0.1); lo -= pad; hi += pad; }
      else hi *= 1.08;
    }
    const ticks = spec.ticks || niceTicks(lo, hi);
    if (!spec.domain && !spec.floor0) { lo = Math.min(lo, ticks[0]); hi = Math.max(hi, ticks[ticks.length - 1]); }
    const yOf = (v) => m.t + ih - ((v - lo) / (hi - lo || 1)) * ih;
    const tf = spec.tickFmt || ((v) => String(v));

    let g = `<g class="grid">${ticks.map((t) => `<line x1="${m.l}" x2="${W - m.r}" y1="${yOf(t)}" y2="${yOf(t)}"/>`).join('')}</g>`;
    g += ticks.map((t) => `<text class="tick" x="${m.l - 6}" y="${yOf(t) + 4}" text-anchor="end">${tf(t)}</text>`).join('');
    g += `<line class="baseline" x1="${m.l}" x2="${W - m.r}" y1="${m.t + ih}" y2="${m.t + ih}"/>`;

    // Date labels: first, middle, last.
    if (n) {
      const idx = [...new Set([0, Math.floor((n - 1) / 2), n - 1])];
      g += idx.map((i, k) => `<text class="tick" x="${xOf(i)}" y="${H - 6}" text-anchor="${k === 0 && idx.length > 1 ? 'start' : (i === n - 1 && idx.length > 1 ? 'end' : 'middle')}">${fmtDate(rows[i].date)}</text>`).join('');
    }

    if (spec.goal != null && spec.goal >= lo && spec.goal <= hi) {
      g += `<line class="goal-line" x1="${m.l}" x2="${W - m.r}" y1="${yOf(spec.goal)}" y2="${yOf(spec.goal)}"/>`;
      g += `<text class="goal-label" x="${W - m.r}" y="${yOf(spec.goal) - 4}" text-anchor="end">goal ${spec.goalLabel}</text>`;
    }

    if (!vals.length) {
      g += `<text class="empty-label" x="${m.l + iw / 2}" y="${m.t + ih / 2}" text-anchor="middle">No data in this range</text>`;
    } else if (spec.kind === 'line') {
      // Next milestone threshold as a reference line, if it is in view.
      const lastW = [...rows].reverse().find((r) => isNum(r.w));
      const next = lastW && MILESTONES.find((ms) => ms.min > lastW.w);
      if (next && next.min <= hi) {
        g += `<line class="goal-line" x1="${m.l}" x2="${W - m.r}" y1="${yOf(next.min)}" y2="${yOf(next.min)}"/>`;
        g += `<text class="goal-label" x="${W - m.r}" y="${yOf(next.min) - 4}" text-anchor="end">next milestone ${next.min}</text>`;
      }
      let d = '', pen = false;
      rows.forEach((r, i) => {
        const v = spec.val(r);
        if (!isNum(v)) { pen = false; return; }
        d += `${pen ? 'L' : 'M'}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`;
        pen = true;
      });
      g += `<path class="line" d="${d}"/>`;
    } else if (spec.kind === 'bar') {
      const w = Math.max(1, bw - 2);
      g += rows.map((r, i) => {
        const v = spec.val(r);
        if (!isNum(v)) return '';
        const y = yOf(v);
        const under = spec.goal != null && v < spec.goal;
        return `<path class="bar${under ? ' under' : ''}" d="${barPath(xOf(i) - w / 2, y, w, m.t + ih - y, w >= 8 ? 4 : 1)}"/>`;
      }).join('');
    } else if (spec.kind === 'mood') {
      let d = '', pen = false;
      rows.forEach((r, i) => {
        if (!isNum(r.mood)) { pen = false; return; }
        d += `${pen ? 'L' : 'M'}${xOf(i).toFixed(1)},${yOf(r.mood).toFixed(1)}`;
        pen = true;
      });
      g += `<path d="${d}" fill="none" stroke="var(--axis)" stroke-width="1.5"/>`;
      const size = clamp(bw - 2, 8, 16);
      g += rows.map((r, i) => {
        if (!isNum(r.mood)) return '';
        const cx = xOf(i), cy = yOf(r.mood), s = size / 24;
        return `<g transform="translate(${(cx - size / 2).toFixed(1)},${(cy - size / 2).toFixed(1)}) scale(${s.toFixed(3)})">
          <circle cx="12" cy="12" r="11.5" fill="${moodColor(r.mood)}" stroke="var(--surface)" stroke-width="2"/>
          ${size >= 12 ? `<circle cx="8.5" cy="9.5" r="1.6" fill="#0b0b0b"/><circle cx="15.5" cy="9.5" r="1.6" fill="#0b0b0b"/><path d="${moodFacePath(r.mood)}" fill="none" stroke="#0b0b0b" stroke-width="2" stroke-linecap="round"/>` : ''}
        </g>`;
      }).join('');
    }

    g += `<g class="hover" visibility="hidden"><line class="crosshair" y1="${m.t}" y2="${m.t + ih}"/><circle class="hover-dot" r="4"/></g>`;
    g += `<rect class="hit" x="${m.l}" y="0" width="${iw}" height="${H}"/>`;

    const label = `${fig.querySelector('figcaption').textContent} chart, ${n} days`;
    plot.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${g}</svg>`;
    const svg = $('svg', plot);
    const chart = { spec, rows, svg, xOf, yOf, bw, m, plot, fig };

    const onMove = (ev) => {
      const rect = svg.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * W;
      const i = clamp(Math.floor((x - m.l) / bw), 0, n - 1);
      showHover(i, chart, ev);
    };
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerdown', onMove);
    svg.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') hideHover(); });
    return chart;
  }

  function showHover(i, src, ev) {
    const rows = src.rows;
    const r = rows[i];
    if (!r) return;
    for (const c of charts) {
      const hov = $('.hover', c.svg);
      const x = c.xOf(i);
      const v = c.spec.val(r);
      hov.setAttribute('visibility', 'visible');
      const line = $('.crosshair', hov);
      line.setAttribute('x1', x); line.setAttribute('x2', x);
      const dot = $('.hover-dot', hov);
      if (isNum(v) && c.spec.kind === 'line') { dot.setAttribute('cx', x); dot.setAttribute('cy', c.yOf(v)); dot.setAttribute('visibility', 'visible'); }
      else dot.setAttribute('visibility', 'hidden');
    }

    const gi = ROWS.indexOf(r);
    const fact = pickFact(src.spec.topic, r.date + src.spec.topic, factCondition(r, ROWS, gi));
    const tip = $('#chart-tip');
    tip.innerHTML = `
      <div class="tip-date">${fmtDate(r.date, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
      <div class="tip-row"><span>Weight trend</span><span>${r.w != null ? `${fmt1(r.w)} lb` : '—'}</span></div>
      <div class="tip-row"><span>Weighed</span><span>${r.wRaw != null ? `${fmt1(r.wRaw)} lb` : (r.w != null ? 'no weigh-in' : '—')}</span></div>
      <div class="tip-row"><span>Sleep</span><span>${r.sleep != null ? `${fmt1(r.sleep)} h` : '—'}</span></div>
      <div class="tip-row"><span>Steps</span><span>${fmtInt(r.steps)}</span></div>
      <div class="tip-row"><span>Mood</span><span>${r.mood != null ? `${r.mood}/10` : '—'}</span></div>
      ${fact ? `<p class="tip-fact">${esc(fact.text)}<span class="tip-src">${esc(factSource(fact))}</span></p>` : ''}`;
    tip.hidden = false;

    // Position inside #trends, beside the crosshair, flipping to stay on screen.
    const host = $('#trends').getBoundingClientRect();
    const svgRect = src.svg.getBoundingClientRect();
    const px = svgRect.left + (src.xOf(i) / parseFloat(src.svg.getAttribute('viewBox').split(' ')[2])) * svgRect.width;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let left = px - host.left + 14;
    if (left + tw > host.width - 8) left = px - host.left - tw - 14;
    left = clamp(left, 8, Math.max(8, host.width - tw - 8));
    let top = (ev ? ev.clientY : svgRect.top) - host.top - th / 2;
    top = clamp(top, 8, host.height - th - 8);
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }
  function hideHover() {
    for (const c of charts) $('.hover', c.svg).setAttribute('visibility', 'hidden');
    $('#chart-tip').hidden = true;
  }

  function renderTable(rows) {
    const body = [...rows].reverse().map((r) => `<tr>
      <td>${fmtDate(r.date, { weekday: 'short', month: 'short', day: 'numeric' })}</td>
      <td>${fmt1(r.wRaw)}</td><td>${fmt1(r.w)}</td><td>${fmt1(r.sleep)}</td><td>${fmtInt(r.steps)}</td><td>${r.mood ?? '—'}</td></tr>`).join('');
    $('#data-table').innerHTML = `<thead><tr><th>Date</th><th>Weighed (lb)</th><th>Trend (lb)</th><th>Sleep (h)</th><th>Steps</th><th>Mood</th></tr></thead><tbody>${body}</tbody>`;
  }

  // ------------------------------------------------------- fact popovers
  function openFact(btn) {
    const f = btn.dataset.factId
      ? FACTS.facts.find((x) => x.id === btn.dataset.factId)
      : pickFact(btn.dataset.factTopic, String(Date.now() / 6e4 | 0));
    if (!f) return;
    const pop = $('#fact-pop');
    $('#fact-text').textContent = f.text;
    $('#fact-src').textContent = factSource(f);
    pop.hidden = false;
    const r = btn.getBoundingClientRect();
    const pw = pop.offsetWidth;
    pop.style.left = `${clamp(r.left + window.scrollX - pw / 2, 16 + window.scrollX, window.scrollX + document.documentElement.clientWidth - pw - 16)}px`;
    pop.style.top = `${r.bottom + window.scrollY + 8}px`;
    pop.dataset.for = btn.dataset.factId || btn.dataset.factTopic;
  }
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.info');
    const pop = $('#fact-pop');
    if (btn) { ev.stopPropagation(); openFact(btn); return; }
    if (ev.target.closest('.fact-close') || !ev.target.closest('#fact-pop')) pop.hidden = true;
    if (!ev.target.closest('svg') && !ev.target.closest('#chart-tip')) hideHover();
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { $('#fact-pop').hidden = true; hideHover(); } });

  // --------------------------------------------------- owner log + sync
  const LOG_KEY = 'bi.log';
  const SETTINGS_KEY = 'bi.sync';
  const localLog = () => store.get(LOG_KEY, {});

  function setupOwner() {
    if (!OWNER || DEMO) return;
    const openBtn = $('#log-open');
    openBtn.hidden = false;
    const sheet = $('#log-sheet');
    const form = $('#log-form');
    const moodIn = $('#mood-input');
    const syncMoodFace = () => { $('#mood-out').textContent = moodIn.value; $('#mood-face').innerHTML = moodFaceSVG(+moodIn.value); };
    moodIn.addEventListener('input', syncMoodFace);

    const fill = (date) => {
      const e = localLog()[date] || {};
      form.date.value = date;
      form.am1.checked = !!e.am1; form.am2.checked = !!e.am2; form.pm.checked = !!e.pm;
      form.workout.checked = !!e.workout;
      moodIn.value = e.mood || 5;
      form.nutrition.value = e.nutrition || '';
      syncMoodFace();
    };
    form.date.addEventListener('change', () => fill(form.date.value));
    openBtn.addEventListener('click', () => { fill(localToday()); updateSyncStatus(); sheet.showModal(); });
    $('#log-close').addEventListener('click', () => sheet.close());

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const log = localLog();
      log[form.date.value] = {
        am1: form.am1.checked, am2: form.am2.checked, pm: form.pm.checked,
        workout: form.workout.checked, mood: +moodIn.value,
        nutrition: form.nutrition.value.trim(),
        savedAt: new Date().toISOString(),
      };
      store.set(LOG_KEY, log);
      const pending = new Set(store.get('bi.pending', []));
      pending.add(form.date.value);
      store.set('bi.pending', [...pending]);
      rebuild();
      sheet.close();
      await syncToGitHub();
    });

    // Settings
    const ss = $('#settings-sheet');
    const sf = $('#settings-form');
    $('#settings-open').addEventListener('click', () => {
      const s = store.get(SETTINGS_KEY, {});
      sf.owner.value = s.owner || ''; sf.repo.value = s.repo || ''; sf.branch.value = s.branch || 'main'; sf.token.value = s.token || '';
      ss.showModal();
    });
    $('#settings-close').addEventListener('click', () => ss.close());
    sf.addEventListener('submit', (ev) => {
      ev.preventDefault();
      store.set(SETTINGS_KEY, { owner: sf.owner.value.trim(), repo: sf.repo.value.trim(), branch: sf.branch.value.trim() || 'main', token: sf.token.value.trim() });
      ss.close();
      syncToGitHub();
    });
    $('#owner-off').addEventListener('click', () => {
      store.del('bi.owner');
      location.href = location.pathname;
    });

    syncToGitHub();
  }

  function updateSyncStatus(msg) {
    const pending = store.get('bi.pending', []);
    const s = store.get(SETTINGS_KEY, {});
    $('#sync-status').textContent = msg
      || (!s.token ? 'Saved on this device only. Add sync settings to commit entries to GitHub.'
        : pending.length ? `${pending.length} entr${pending.length === 1 ? 'y' : 'ies'} waiting to sync.` : 'All entries synced.');
  }

  const b64enc = (str) => { let bin = ''; new TextEncoder().encode(str).forEach((b) => { bin += String.fromCharCode(b); }); return btoa(bin); };
  const b64dec = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

  let syncing = false;
  async function syncToGitHub() {
    const s = store.get(SETTINGS_KEY, {});
    const pending = store.get('bi.pending', []);
    if (!s.token || !s.owner || !s.repo || !pending.length || syncing || !navigator.onLine) { updateSyncStatus(); return; }
    syncing = true;
    updateSyncStatus('Syncing…');
    const url = `https://api.github.com/repos/${encodeURIComponent(s.owner)}/${encodeURIComponent(s.repo)}/contents/data/manual-log.json`;
    const headers = { Authorization: `Bearer ${s.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    try {
      let sha, remote = { entries: {} };
      const get = await fetch(`${url}?ref=${encodeURIComponent(s.branch)}`, { headers, cache: 'no-store' });
      if (get.ok) {
        const j = await get.json();
        sha = j.sha;
        remote = JSON.parse(b64dec(j.content));
        remote.entries = remote.entries || {};
      } else if (get.status !== 404) throw new Error(`GitHub read failed (${get.status})`);

      const log = localLog();
      for (const d of pending) if (log[d]) {
        const { savedAt, ...e } = log[d];
        remote.entries[d] = e;
      }
      remote.entries = Object.fromEntries(Object.entries(remote.entries).sort(([a], [b]) => a.localeCompare(b)));
      const body = {
        message: `Log ${pending.slice().sort().join(', ')}`,
        content: b64enc(JSON.stringify(remote, null, 2) + '\n'),
        branch: s.branch,
      };
      if (sha) body.sha = sha;
      const put = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(body) });
      if (!put.ok) throw new Error(`GitHub write failed (${put.status})`);
      store.set('bi.pending', []);
      updateSyncStatus('Synced to GitHub.');
    } catch (err) {
      updateSyncStatus(`${err.message}. Entries are kept on this device and will retry.`);
    } finally {
      syncing = false;
    }
  }
  window.addEventListener('online', () => syncToGitHub());

  // ---------------------------------------------------------------- boot
  let HEALTH = null, MANUAL = null;
  function rebuild() {
    ROWS = buildRows(HEALTH, MANUAL, OWNER && !DEMO ? localLog() : {});
    render(HEALTH);
  }

  function setupRange() {
    const seg = $('#range');
    const mark = () => seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(+b.dataset.range === range)));
    seg.addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      range = +b.dataset.range;
      store.set('bi.range', range);
      mark();
      hideHover();
      renderCharts();
    });
    mark();
  }

  async function boot() {
    setupRange();
    const factsP = fetch('facts.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (DEMO) {
      $('#demo-banner').hidden = false;
      ({ health: HEALTH, manual: MANUAL } = demoData());
    } else {
      [HEALTH, MANUAL] = await Promise.all([loadJSON('health-data.json'), loadJSON('manual-log.json')]);
    }
    FACTS = (await factsP) || FACTS;
    rebuild();
    setupOwner();

    let t;
    window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { if (ROWS.length) { hideHover(); renderCharts(); } }, 150); });

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is best-effort */ });
    }
  }

  boot();
})();
