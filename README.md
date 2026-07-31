# dv-node-server: [D]avid [V]asko Node Server

## Purpose

A proxy server that logs in to 8a.nu itself (via a dedicated admin account) and serves/refreshes
bouldering scorecards for a configured list of users, replacing the old manual "log in, visit each
user's API URL, copy the JSON by hand" workflow.

## Setup

```
npm install
npx playwright install chromium
```

Create a `.env` file (gitignored) in the project root with:

```
EIGHTA_ADMIN_USER=<admin 8a.nu account email>
EIGHTA_ADMIN_PASSWORD=<admin 8a.nu account password>
EIGHTA_ADMIN_API_TOKEN=<a random string you generate, used to authorize /admin/* calls>
```

Use a dedicated admin 8a.nu account, not your personal one, and leave 2FA/OTP disabled on it (the
login automation can't complete an interactive second factor).

**Important:** 8a.nu sits behind Cloudflare bot detection that blocks both plain HTTP clients and
headless browsers - only a real, non-headless Chromium window gets through. That means this server
only works on a machine with a real display (e.g. your own laptop), not a headless server/CI box.
A visible Chromium window will briefly appear whenever the server needs to log in.

## Running

```
npm run start        # run once
npm run start:watch  # restart on changes to src/
```

Starts on `http://localhost:8091`.

## Endpoints

### `GET /:userId`

Fetches and returns one user's live ascent data as JSON. No auth required (this only ever talks to
`www.8a.nu` using the server's own admin session - it doesn't accept a caller-supplied session).

```
curl http://localhost:8091/david-vasko
```

### `POST /admin/update-all`

Kicks off a background refresh of every **enabled** user listed in `friends.json` (see below).
Requires the admin token from `.env`. Runs as a fire-and-forget job rather than blocking the
request - a full sweep of the friend list can take a while (real browser navigations, plus jitter
between calls - see "Jitter" below), so this responds immediately instead of holding the connection
open:

```
curl -X POST -H "Authorization: Bearer $EIGHTA_ADMIN_API_TOKEN" http://localhost:8091/admin/update-all
```

Returns `202` immediately with `{"status": "started", "totalUsers": <n>}`. If a job is already
running, returns `409` with the in-progress job state instead of starting a second one (there's only
one shared admin browser session, so runs don't overlap).

For each enabled user, the background job writes:
- `raw-8a-json/<userId>.json` - the raw API response (also usable by `scraper.py --use_manual_json`)
- `out-json/<userId>.json` - the fully processed (sorted, de-duplicated) file, ready to copy into
  `personal-site-vue`

One user failing (bad slug, private profile, etc.) doesn't stop the others - see status below for
per-user results.

Not rate-limited - it's admin-only and expected to be run manually/infrequently.

### `GET /admin/update-all/status`

Poll the current or most-recently-finished `/admin/update-all` job. Requires the admin token:

```
curl -H "Authorization: Bearer $EIGHTA_ADMIN_API_TOKEN" http://localhost:8091/admin/update-all/status
```

Returns `404` if no job has run yet this server process. Otherwise:

```json
{
  "status": "running",
  "startedAt": 1785524484826,
  "results": {
    "david-vasko": "ok",
    "kody-shutt": "pending",
    "some-stale-friend": "skipped (disabled)"
  }
}
```

`results` values are one of `pending`, `ok`, `error: <message>`, or `skipped (disabled)` (for
`friends.json` entries with `"enabled": false`). Once the sweep finishes, `status` becomes
`"completed"` and a `finishedAt` timestamp is added. Job state is in-memory only - it resets if the
server restarts.

### `POST /update/:userId`

Scaffolded self-serve refresh for a single user - lets someone refresh just their own scorecard
without needing 8a.nu credentials of their own (it still uses the shared admin session under the
hood). **Not exposed publicly yet** - it exists and works, but nobody's been handed a token.

Requires a per-user bearer token (see `user-tokens.json` below) and is subject to rate limiting
(see below):

```
curl -X POST -H "Authorization: Bearer <their-token>" http://localhost:8091/update/david-vasko
```

Writes the same `raw-8a-json/<userId>.json` and `out-json/<userId>.json` files as `/admin/update-all`,
but only for that one user.

## Configuration files

### `friends.json`

An array of objects, one per user `/admin/update-all` can refresh:

```json
[
  { "userSlug": "david-vasko", "enabled": true },
  { "userSlug": "some-stale-friend", "enabled": false }
]
```

- `userSlug` - whatever appears in their profile URL (`8a.nu/user/<slug>`); matches the field name
  8a.nu's own ascent data uses.
- `enabled` - set to `false` to exclude a user from `/admin/update-all` sweeps (e.g. a scorecard
  that hasn't changed in years) without deleting their entry. Disabled users still show up in the
  status response as `"skipped (disabled)"`, they're just never fetched.

This only affects the batch endpoint - `GET /:userId` and `POST /update/:userId` work on whatever
slug is in the URL regardless of what's in `friends.json`.

### `user-tokens.json` (gitignored)

Maps a user slug to the bearer token they use to call `/update/:userId` for themselves:

```json
{
  "david-vasko": "some-random-token-you-generate-and-give-them"
}
```

Starts empty (`{}`). To let someone self-update, add an entry here and give them the token
out-of-band (there's no self-registration - you hand these out manually). This is a shared secret,
not real per-user 8a.nu auth, which is fine for a small trusted group but means anyone with the
token can trigger that one user's refresh.

## Rate limiting

`/update/:userId` is rate-limited to protect the single shared admin session from looking like
abusive/bot traffic to 8a.nu/Cloudflare. State is persisted in `data/update-state.json` (gitignored,
created automatically):

- **Per-user cooldown:** each user can trigger at most one update every 24 hours. A call inside that
  window gets `429` with how long until it's allowed again.
- **Global daily cap:** at most 24 updates total (across all users) in any rolling 24-hour window.
  Once hit, every `/update/:userId` call gets `429` until the window rolls forward, regardless of
  per-user cooldowns.

Both limits reset on a rolling basis (not a fixed midnight cutoff) - "24 hours since that call", not
"24 hours since midnight".

## Jitter

`/admin/update-all`'s background job waits a random 0.5-5s between each user's fetch (see
`sleepJitter` in `src/eightA-auth.ts`), so a full sweep doesn't hit 8a.nu with a metronomic
back-to-back request pattern. This adds a few extra seconds per user to a full run, which is part of
why the endpoint responds immediately and exposes a status endpoint rather than blocking.

## Manual/legacy workflow

`src/python-scraper/scraper.py` still works standalone and is left untouched as a fallback:

```
python3 ./src/python-scraper/scraper.py "sid" "user-slug1,user-slug2" --out_dir "./out-json" --use_manual_json true
```

This reads pre-saved raw JSON from `raw-8a-json/` (e.g. produced by `/admin/update-all` above, or
saved by hand from a browser) and does the same sort/de-dupe/write the server's endpoints now do
natively. Useful if the server-side login ever breaks and you need to fall back to manually saving
JSON from a logged-in browser tab.
