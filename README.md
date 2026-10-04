# 225 Pounds of Bad Intentions — tracker (BI-001)

Public progress tracker for a 168 → 225 lb weight-gain goal. It's a progressive web app (installable via "Add to Home Screen") that GitHub Pages hosts for free. Weight, sleep and steps flow in daily from Apple Health (Renpho scale + Apple Watch). Mood, medication checks, workouts and food are logged in the app.

**This folder is a complete repo root.** Copy its contents into a new `bad-intentions-tracker` repository (SOP Step 1) and everything lands where the SOP expects. GitHub only runs workflows from the repo root's `.github/`, so the workflow does nothing while this folder sits inside another repo.

Preview with sample data: open `docs/index.html?demo`, or `https://<you>.github.io/bad-intentions-tracker/?demo` once Pages is live.

## Layout

```
docs/                     GitHub Pages site (Settings → Pages → main, /docs)
  index.html              page
  app.js                  charts, tooltips, milestones, score, badges, owner log + sync
  style.css               styling (light + dark)
  facts.json              sourced science-tooltip pool (BI-002)
  manifest.json, sw.js    PWA install + offline
  icons/                  192, 512 PNG + SVG
  data/                   public copy of the data. Written by the workflow, don't edit.
data/
  health-data.json        weight / sleep / steps by day (written by automation)
  manual-log.json         owner log: am1, am2, pm, workout, mood, nutrition
scripts/
  hae.mjs                 Health Auto Export → daily values
  ingest.mjs              merge an export into data/health-data.json
  publish.mjs             data/ → docs/data/ (log reduced to public fields)
endpoint/
  worker.js, wrangler.toml   Health Auto Export receiving endpoint (BI-005)
.github/workflows/sync-health-data.yml
```

## Setup after copying into the new repo

1. **Pages:** Settings → Pages → Deploy from a branch → `main` / `/docs`.
2. **Edit config** at the top of `docs/app.js`. `startDate` and `goalDate` default to the first data day, plus enough weeks to gain 57 lb at 5 lb/week (12 weeks). Set real dates if you have them.
3. **Workflow permissions:** Settings → Actions → General → Workflow permissions → "Read and write".
4. **Receiving endpoint (Cloudflare Workers free tier):**
   ```sh
   cd endpoint
   # set GITHUB_OWNER / GITHUB_REPO in wrangler.toml first
   npx wrangler secret put SHARED_SECRET   # any long random string
   npx wrangler secret put GITHUB_TOKEN    # fine-grained PAT: this repo only, Contents read/write
   npx wrangler deploy
   ```
5. **Health Auto Export app:** create a REST API automation.
   - URL: the worker's URL. Format: JSON. Header: `X-Tracker-Key: <SHARED_SECRET>`.
   - Metrics: Weight, Sleep Analysis, Step Count. Time grouping: Day.
   - Schedule: daily, in the morning after the weigh-in and the overnight sleep sync.
6. **Owner logging on your phone:** open the site once with `?owner` at the end of the URL. A "Log today" button appears, on that device only. Under *Sync settings*, enter the owner, the repo and a fine-grained PAT (this repo only, Contents read/write). Entries save on the phone first and commit to `data/manual-log.json` when online.

Data flow: phone → worker → `repository_dispatch` → workflow merges into `data/health-data.json` → `publish.mjs` → `docs/data/` → site. A log commit triggers the same workflow (push to `data/**`). A daily cron re-publishes as a safety net.

## Privacy (check before going live, per Step 5)

- Medication checks are stored as `am1`, `am2`, `pm`. No drug names exist anywhere in the code or data.
- The public site (`docs/data/manual-log.json`) only gets mood, a **count** of checks, and two booleans: workout done, food logged. Food text and individual checks are never rendered.
- `data/manual-log.json` still holds the food text and per-check values. In a public repo, anyone can read that raw file. To keep food text private, make the repo private (Pages on a private repo needs a paid plan), or keep nutrition text out of the log.
- The site's "owner mode" only hides UI; it is not a lock. The real write protection is the token, which lives only in your phone's browser storage and in the worker's secrets.

## Built vs. still open

| Item | Status |
| --- | --- |
| Hero: weight, days remaining, 168–225 bar colored per milestone, milestone name | Built |
| Milestone ladder (names exactly as confirmed) | Built |
| Trend charts: weight (gaps interpolated, centered 7-day smoothing, no missing-day markers), sleep, steps, mood smileys (red 1 → green 10), one shared hover | Built |
| Science tooltips | Built, with 15 facts drawn from *ADHD 2.0* and *Linking Nutrition to Mental Health*, each cited. The sleep-deprivation/catabolic-state research the SOP mentions is **not** in those books, so it still needs a sourced entry in `docs/facts.json`. **BI-002 partially done.** |
| Badges (grayed until unlocked; unlock on the smoothed trend) | Built |
| Weekly points + streak | Built with **provisional** values in `POINTS` (`app.js`). **BI-003 still open.** |
| Uphill-battle framing | Built |
| Manual log: 3 neutral checks, mood 1–10 smiley, food box, workout | Built (workout checkbox added so the Exercise score has an input) |
| Calorie auto-calc from food text | **BI-004 open** |
| Health Auto Export → GitHub endpoint | Built (`endpoint/`), **not yet deployed or tested against a live export.** **BI-005: verify** |
| Native app stores | **BI-006 open** |
