// Normalize a Health Auto Export (iOS) JSON export into one record per day:
//   { "YYYY-MM-DD": { weight: lb, sleep: hours, steps: count } }
// Accepts the app's REST body ({ data: { metrics: [...] } }), a bare { metrics: [...] },
// an already-normalized { days: {...} } (passed through), or the flat body the iOS
// Shortcut sends (see fromShortcut below).
//
// Assumptions about the export (set in the app's automation settings):
//   - Metrics: Weight (weight_body_mass), Sleep Analysis (sleep_analysis), Step Count (step_count)
//   - Time grouping: Day. Unaggregated data also works; it is rolled up here.
// Dates use the phone's local date (first 10 chars of "2026-10-04 07:02:00 -0400").

const KG_TO_LB = 2.20462;
const day = (s) => (typeof s === 'string' ? s.slice(0, 10) : null);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const round = (v, p) => Math.round(v * 10 ** p) / 10 ** p;

export function normalize(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Payload is not an object');
  if (payload.days && typeof payload.days === 'object') return clean(payload.days);
  const flat = normalizeKeys(payload);
  if (['weight', 'sleep_minutes', 'steps'].some((k) => k in flat)) return clean(fromShortcut(flat));
  const metrics = payload.data?.metrics ?? payload.metrics;
  if (!Array.isArray(metrics)) throw new Error('No metrics array found in payload');

  const out = {};
  const put = (d, k, v) => { if (d && v != null) (out[d] ??= {})[k] = v; };

  for (const m of metrics) {
    const name = String(m.name || '').toLowerCase();
    const units = String(m.units || '').toLowerCase();
    const rows = Array.isArray(m.data) ? m.data : [];

    if (name === 'weight_body_mass' || name === 'body_mass' || name === 'weight') {
      // Several weigh-ins in a day: keep the earliest (the morning weigh-in).
      const first = {};
      for (const r of rows) {
        const d = day(r.date), q = num(r.qty);
        if (!d || q == null) continue;
        if (!first[d] || r.date < first[d].date) first[d] = r;
      }
      for (const [d, r] of Object.entries(first)) put(d, 'weight', round(units === 'kg' ? r.qty * KG_TO_LB : r.qty, 1));
    } else if (name === 'step_count' || name === 'steps') {
      const sum = {};
      for (const r of rows) { const d = day(r.date), q = num(r.qty); if (d && q != null) sum[d] = (sum[d] || 0) + q; }
      for (const [d, v] of Object.entries(sum)) put(d, 'steps', Math.round(v));
    } else if (name === 'sleep_analysis') {
      const sum = {};
      for (const r of rows) {
        // Aggregated rows carry totalSleep/asleep (hours); unaggregated rows carry a stage + qty.
        const agg = num(r.totalSleep) ?? num(r.asleep);
        const d = day(r.sleepEnd || r.endDate || r.date);
        let hrs = agg;
        if (hrs == null && num(r.qty) != null) {
          const stage = String(r.value || '').toLowerCase();
          if (stage.includes('bed') || stage.includes('awake')) continue;
          hrs = units.startsWith('min') ? r.qty / 60 : r.qty;
        }
        if (d && hrs != null) sum[d] = (sum[d] || 0) + hrs;
      }
      for (const [d, v] of Object.entries(sum)) put(d, 'sleep', round(v, 2));
    }
  }
  return clean(out);
}

// The iOS Shortcut runs each morning and sends one flat object:
//   { weight, sleep_minutes, steps }  (optionally date and steps_date, as YYYY-MM-DD)
// date = today (this morning's weigh-in and last night's sleep), steps_date = yesterday
// (a full day of steps). When the dates are left out they are filled in from the
// current day in TRACKER_TZ (default America/New_York). Shortcuts may send numbers as text like "170.2 lb" or "12,034",
// and leaves a field empty when there is no sample, so parse leniently.
function parseNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const m = v.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}
// "Sleep Minutes", "sleep-minutes" and "SleepMinutes" all become "sleep_minutes".
function normalizeKeys(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = k.trim().replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    out[key] = v;
  }
  if ('sleep' in out && !('sleep_minutes' in out)) out.sleep_minutes = out.sleep;
  return out;
}
const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim());
function localDay(offsetDays = 0, now = new Date()) {
  const tz = (typeof process !== 'undefined' && process.env && process.env.TRACKER_TZ) || 'America/New_York';
  // en-CA formats as YYYY-MM-DD.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
function fromShortcut(p) {
  const out = {};
  const date = isDay(p.date) ? p.date.trim() : localDay(0);
  let w = parseNum(p.weight);
  // Apple Health may hand back kilograms; the goal range (168–225 lb) never overlaps kg values.
  if (w != null && (/kg/i.test(String(p.weight)) || w < 120)) w *= KG_TO_LB;
  if (w != null) (out[date] ??= {}).weight = round(w, 1);
  const sleepMin = parseNum(p.sleep_minutes);
  if (sleepMin != null && sleepMin > 0) (out[date] ??= {}).sleep = round(sleepMin / 60, 2);
  const sd = isDay(p.steps_date) ? p.steps_date.trim() : localDay(-1);
  const steps = parseNum(p.steps);
  if (steps != null) (out[sd] ??= {}).steps = Math.round(steps);
  return out;
}

// Keep only well-formed dates and plausible values.
function clean(days) {
  const out = {};
  for (const [d, v] of Object.entries(days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !v || typeof v !== 'object') continue;
    const r = {};
    if (num(v.weight) != null && v.weight > 50 && v.weight < 600) r.weight = v.weight;
    if (num(v.sleep) != null && v.sleep >= 0 && v.sleep <= 24) r.sleep = v.sleep;
    if (num(v.steps) != null && v.steps >= 0 && v.steps < 200000) r.steps = Math.round(v.steps);
    if (Object.keys(r).length) out[d] = r;
  }
  return out;
}
