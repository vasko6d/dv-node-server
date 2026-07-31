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

Refreshes every user listed in `friends.json` in one batch. Requires the admin token from `.env`:

```
curl -X POST -H "Authorization: Bearer $EIGHTA_ADMIN_API_TOKEN" http://localhost:8091/admin/update-all
```

For each user, writes:
- `raw-8a-json/<userId>.json` - the raw API response (also usable by `scraper.py --use_manual_json`)
- `out-json/<userId>.json` - the fully processed (sorted, de-duplicated) file, ready to copy into
  `personal-site-vue`

Returns a per-user status object, e.g. `{"david-vasko": "ok", "some-slug": "error: ..."}` - one
user failing (bad slug, private profile, etc.) doesn't stop the others.

Not rate-limited - it's admin-only and expected to be run manually/infrequently.

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

A plain JSON array of the 8a.nu user slugs `/admin/update-all` refreshes:

```json
["david-vasko", "some-friend-slug"]
```

Edit this list directly to add/remove people. The slug is whatever appears in their profile URL
(`8a.nu/user/<slug>`).

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

## Manual/legacy workflow

`src/python-scraper/scraper.py` still works standalone and is left untouched as a fallback:

```
python3 ./src/python-scraper/scraper.py "sid" "user-slug1,user-slug2" --out_dir "./out-json" --use_manual_json true
```

This reads pre-saved raw JSON from `raw-8a-json/` (e.g. produced by `/admin/update-all` above, or
saved by hand from a browser) and does the same sort/de-dupe/write the server's endpoints now do
natively. Useful if the server-side login ever breaks and you need to fall back to manually saving
JSON from a logged-in browser tab.
