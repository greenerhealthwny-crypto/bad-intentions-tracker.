#!/usr/bin/env node
// Copy public data into docs/data/ (GitHub Pages only serves /docs).
// The manual log is reduced to what the site renders: mood, a count of checks,
// whether a workout and a food log happened. Check names and food text stay out.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const read = (p, fallback) => { try { return JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8')); } catch { return fallback; } };
const write = (p, v) => writeFileSync(new URL(p, import.meta.url), JSON.stringify(v, null, 2) + '\n');

mkdirSync(new URL('../docs/data/', import.meta.url), { recursive: true });

const health = read('../data/health-data.json', { updated: null, days: {} });
write('../docs/data/health-data.json', health);

const manual = read('../data/manual-log.json', { entries: {} });
const entries = {};
for (const [d, e] of Object.entries(manual.entries || {})) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !e) continue;
  const mood = Number.isInteger(e.mood) && e.mood >= 1 && e.mood <= 10 ? e.mood : null;
  entries[d] = {
    ...(mood != null && { mood }),
    checks: ['am1', 'am2', 'pm'].filter((k) => e[k] === true).length,
    workout: e.workout === true,
    ate: typeof e.nutrition === 'string' && e.nutrition.trim().length > 0,
  };
}
write('../docs/data/manual-log.json', { entries });
console.log(`Published ${Object.keys(health.days || {}).length} health day(s), ${Object.keys(entries).length} log entr(ies).`);
