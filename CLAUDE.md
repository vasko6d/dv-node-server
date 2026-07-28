# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A small proxy server that sits in front of the 8a.nu (climbing ascent tracking site) private API, plus a
Python scraper that uses the proxy to pull down and de-duplicate a user's bouldering ascent history
("ticklist") as JSON. The output JSON is later copied into a separate personal website project
(`personal-site-vue`) to display scorecards — that publishing step is out of scope for this repo.

8a.nu's API sits behind Keycloak auth. Rather than implementing the OAuth flow, this proxy expects the
caller to supply an already-authenticated `connect.sid` session cookie value (copied from a logged-in
browser session) on each request, and forwards it to 8a.nu.

## Commands

- `npm install` — install dependencies
- `npm run start` — run the proxy server once via `ts-node` (no build step; TS runs directly)
- `npm run start:watch` — run via `nodemon`, restarting on changes to `src/**/*.ts`
- There is no test suite (`npm test` is a stub) and no lint script wired up in `package.json` — run
  `npx eslint src --ext .ts` directly if linting is needed.

### Running the scraper

The scraper talks to the Node proxy over HTTP, so the proxy must already be running on `localhost:8091`.

```
python3 ./src/python-scraper/scraper.py <sid> <user-slug1,user-slug2,...> --out_dir "./out-json"
```

- `<sid>` is the `connect.sid` cookie value from a logged-in 8a.nu browser session.
- `--use_manual_json true` skips the network call and instead reads pre-fetched JSON from
  `./raw-8a-json/<user-slug>.json` (useful when the live API/auth is broken — see below).
- `--verbose true` logs more detail about skipped duplicate entries.

Python deps: `pip install -r src/python-scraper/requirements.txt` (just `requests`).

## Architecture

- `src/index.ts` — the entire Express proxy. Two routes, both keyed by `:sid/:userId` path params:
  - `GET /:sid/:userId` — fetches a user's bouldering ascents. Makes two requests to 8a.nu: first with
    `pageSize=0` to learn `totalItems`, then a second request with `pageSize=<totalItems>` to fetch
    everything in one page. This two-step pattern is the way to fetch "all" ascents.
  - `GET /recommend/:sid/:userId` — same two-step pattern against the `recommended` endpoint.
  - Both proxy the `connect.sid` cookie and a fixed set of browser-like headers (`getAscentHeaders`) to
    8a.nu; there is no cookie/session validation on the proxy side.
- `src/python-scraper/scraper.py` — CLI that pulls ticklists (via the proxy, or from local JSON) for one
  or more user slugs, sorts each user's ascents by `(date, zlaggableSlug)`, de-duplicates near-identical
  ascent entries (same fields except `ascentId`), and writes one pretty-printed JSON file per user to
  `--out_dir`. Ascents with `zlaggableSlug == "unknown"` are exempt from de-duplication (they're allowed
  to repeat). Output uses CRLF line endings and manual JSON formatting (not `json.dump` for the whole
  structure) to keep per-user output files diff-friendly.
- `raw-8a-json/` and `out-json/` are gitignored working directories: `raw-8a-json/` holds manually-saved
  raw API responses (used with `--use_manual_json`), `out-json/` holds the scraper's processed output.

## Known constraints

- Proper Keycloak login from the proxy itself is not implemented (see `Next Steps.md` for exploration
  notes on the auth flow) — the `sid` cookie must currently be obtained manually via browser and passed
  in on every request/scrape.
