import express from 'express';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { fetchAllAscents } from './eightA-auth';
import { checkAndRecordUpdate } from './update-rate-limit';
import { processScorecard } from './scorecard-processor';

dotenv.config({ quiet: true });

const app = express();
const port = 8091; // default port to listen

const rawJsonDir = path.join(__dirname, '..', 'raw-8a-json');
const outJsonDir = path.join(__dirname, '..', 'out-json');
const friendSlugs: string[] = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'friends.json'), 'utf-8'));

function loadUserTokens(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'user-tokens.json'), 'utf-8'));
  } catch (e) {
    return {};
  }
}

// Writes both the raw API response (a backup, and an input scraper.py can
// still process manually via --use_manual_json) and the fully processed,
// sorted/deduped file ready to copy into personal-site-vue - no separate
// scraper.py run needed for the normal path anymore.
function writeScorecard(userId: string, data: any): void {
  fs.mkdirSync(rawJsonDir, { recursive: true });
  fs.writeFileSync(path.join(rawJsonDir, `${userId}.json`), JSON.stringify(data));

  fs.mkdirSync(outJsonDir, { recursive: true });
  fs.writeFileSync(path.join(outJsonDir, `${userId}.json`), processScorecard(data));
}

function requireBearerToken(expected: string | undefined, req: any): boolean {
  const auth = req.headers.authorization;
  return !!expected && auth === `Bearer ${expected}`;
}

app.get('/:userId', (req: any, res: any) => {
  // eslint-disable-next-line no-console
  console.log(`Request Path: ${req.url}`);
  fetchAllAscents(req.params.userId)
    .then((data: unknown) => res.send(data))
    .catch((e: Error) => res.send({ statusCode: 500, error: e.message }));
});

// Admin-only: refresh every configured friend's scorecard in one batch,
// replacing the old manual "log in, visit each URL, save the JSON" workflow.
app.post('/admin/update-all', async (req: any, res: any) => {
  if (!requireBearerToken(process.env.EIGHTA_ADMIN_API_TOKEN, req)) {
    res.status(401).send({ error: 'unauthorized' });
    return;
  }

  const results: Record<string, string> = {};
  // eslint-disable-next-line no-restricted-syntax
  for (const userId of friendSlugs) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const data = await fetchAllAscents(userId);
      writeScorecard(userId, data);
      results[userId] = 'ok';
    } catch (e) {
      results[userId] = `error: ${(e as Error).message}`;
    }
  }
  res.send(results);
});

// Scaffolded self-serve refresh for a single user, gated by a per-user token
// (see user-tokens.json) and rate-limited (see src/update-rate-limit.ts).
// Not exposed publicly yet - localhost only until that's a deliberate decision.
app.post('/update/:userId', (req: any, res: any) => {
  const { userId } = req.params;
  const userTokens = loadUserTokens();

  if (!requireBearerToken(userTokens[userId], req)) {
    res.status(401).send({ error: 'unauthorized' });
    return;
  }

  const rateLimitCheck = checkAndRecordUpdate(userId);
  if (!rateLimitCheck.allowed) {
    res.status(429).send({ error: rateLimitCheck.reason });
    return;
  }

  fetchAllAscents(userId)
    .then((data: unknown) => {
      writeScorecard(userId, data);
      res.send({ status: 'ok' });
    })
    .catch((e: Error) => res.status(500).send({ error: e.message }));
});

// start the Express server
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`server started at http://localhost:${port}`);
});
