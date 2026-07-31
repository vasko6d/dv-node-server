import * as fs from 'fs';
import * as path from 'path';

const STATE_FILE = path.join(__dirname, '..', 'data', 'update-state.json');
const PER_USER_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const GLOBAL_DAILY_CAP = 24;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface UpdateState {
  lastUpdated: Record<string, number>;
  globalCallLog: number[];
}

function loadState(): UpdateState {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch (e) {
    return { lastUpdated: {}, globalCallLog: [] };
  }
}

function saveState(state: UpdateState): void {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

interface RateLimitResult {
  allowed: boolean;
  reason?: string;
}

// eslint-disable-next-line import/prefer-default-export
export function checkAndRecordUpdate(userId: string): RateLimitResult {
  const state = loadState();
  const now = Date.now();

  state.globalCallLog = state.globalCallLog.filter((t) => now - t < ONE_DAY_MS);
  if (state.globalCallLog.length >= GLOBAL_DAILY_CAP) {
    return { allowed: false, reason: `Global daily update cap (${GLOBAL_DAILY_CAP}) reached, try again later` };
  }

  const last = state.lastUpdated[userId];
  if (last && now - last < PER_USER_COOLDOWN_MS) {
    const hoursLeft = Math.ceil((PER_USER_COOLDOWN_MS - (now - last)) / (60 * 60 * 1000));
    return { allowed: false, reason: `Already updated recently, try again in ~${hoursLeft}h` };
  }

  state.lastUpdated[userId] = now;
  state.globalCallLog.push(now);
  saveState(state);
  return { allowed: true };
}
