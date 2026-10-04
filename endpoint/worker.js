// Receiving endpoint for Health Auto Export (BI-005), as a Cloudflare Worker.
//
// Phone → POST this worker (with a shared secret header) → worker rolls the export
// up into daily values → GitHub repository_dispatch → the sync workflow commits
// data/health-data.json. The GitHub token lives only in the worker's secrets.
//
// Secrets (set with `npx wrangler secret put <NAME>`):
//   SHARED_SECRET  random string; the phone sends it as the "X-Tracker-Key" header
//   GITHUB_TOKEN   fine-grained PAT, this repo only, permission "Contents: read and write"
// Vars (wrangler.toml): GITHUB_OWNER, GITHUB_REPO
import { normalize } from '../scripts/hae.mjs';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function sameSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return json(405, { error: 'POST only' });
    if (!env.SHARED_SECRET || !sameSecret(request.headers.get('x-tracker-key') || '', env.SHARED_SECRET)) {
      return json(401, { error: 'unauthorized' });
    }

    let days;
    try {
      days = normalize(await request.json());
    } catch (err) {
      return json(400, { error: `bad payload: ${err.message}` });
    }
    const count = Object.keys(days).length;
    if (!count) return json(200, { ok: true, days: 0, note: 'nothing to sync' });

    const res = await fetch(`https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'bad-intentions-tracker',
      },
      body: JSON.stringify({ event_type: 'health-data', client_payload: { days } }),
    });
    if (!res.ok) return json(502, { error: `GitHub dispatch failed (${res.status})` });
    return json(202, { ok: true, days: count });
  },
};
