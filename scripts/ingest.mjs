#!/usr/bin/env node
// Merge an Apple Health export into data/health-data.json.
// Usage: node scripts/ingest.mjs <payload.json>
// Newer values replace older ones day by day, so re-sending the same export is safe.
import { readFileSync, writeFileSync } from 'node:fs';
import { normalize } from './hae.mjs';

const file = process.argv[2];
if (!file) { console.error('Usage: node scripts/ingest.mjs <payload.json>'); process.exit(1); }

const target = new URL('../data/health-data.json', import.meta.url);
const incoming = normalize(JSON.parse(readFileSync(file, 'utf8')));
let current = { updated: null, days: {} };
try { current = JSON.parse(readFileSync(target, 'utf8')); } catch { /* first run */ }

const days = { ...(current.days || {}) };
for (const [d, v] of Object.entries(incoming)) days[d] = { ...(days[d] || {}), ...v };
const sorted = Object.fromEntries(Object.entries(days).sort(([a], [b]) => a.localeCompare(b)));

writeFileSync(target, JSON.stringify({ updated: new Date().toISOString(), days: sorted }, null, 2) + '\n');
console.log(`Merged ${Object.keys(incoming).length} day(s); ${Object.keys(sorted).length} day(s) total.`);
