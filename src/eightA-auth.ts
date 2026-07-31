import { chromium } from 'playwright';
import * as crypto from 'crypto';

const KEYCLOAK_REALM = 'https://vlatka.vertical-life.info/auth/realms/Vertical-Life';
const KEYCLOAK_AUTH_URL = `${KEYCLOAK_REALM}/protocol/openid-connect/auth`;
const REDIRECT_URI = 'https://www.8a.nu/callback';
const CLIENT_ID = '8a-nu';
// conservative fallback under the observed 7-day Max-Age on the session cookie
const SESSION_LIFETIME_MS = 6 * 24 * 60 * 60 * 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let browser: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let context: any = null;
let sessionExpiresAt = 0;

// The whole www.8a.nu domain (including the JSON API) sits behind Cloudflare
// bot detection that blocks both plain HTTP clients (axios, curl) *and*
// headless Chromium - confirmed empirically. Only a real, non-headless
// Chromium window gets a valid cf_clearance/nu8a_session. This only works
// where a real display is available (e.g. your own machine), not on a
// headless server/CI box without a virtual display.

function base64url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(bytes: number): string {
  return base64url(crypto.randomBytes(bytes));
}

function buildAuthUrl(): string {
  const codeVerifier = randomString(32);
  const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());
  const state = randomString(16);

  const url = new URL(KEYCLOAK_AUTH_URL);
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pollForSessionCookie(ctx: any, timeoutMs: number): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    const cookies = await ctx.cookies('https://www.8a.nu');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const found = cookies.find((c: any) => c.name === 'nu8a_session');
    if (found) {
      return found;
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, 500); });
  }
  return undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function login(username: string, password: string): Promise<any> {
  if (!browser) {
    browser = await chromium.launch({ headless: false });
  }
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  await page.goto(buildAuthUrl());
  await page.fill('#username', username);
  await page.fill('#password', password);
  await page.click('#kc-login');

  // The flow can bounce through Keycloak twice before landing (the first
  // pass appears to prime Cloudflare's clearance on www.8a.nu, the second
  // completes) so poll for the cookie rather than trusting a single
  // navigation/load-state heuristic.
  const sessionCookie = await pollForSessionCookie(ctx, 30000);
  await page.close();

  if (!sessionCookie) {
    await ctx.close();
    throw new Error('Login timed out without a nu8a_session cookie appearing - check credentials or whether the login page shape changed');
  }

  return ctx;
}

async function ensureSession(): Promise<void> {
  if (context && sessionExpiresAt > Date.now()) {
    return;
  }

  const username = process.env.EIGHTA_ADMIN_USER;
  const password = process.env.EIGHTA_ADMIN_PASSWORD;
  if (!username || !password) {
    throw new Error('EIGHTA_ADMIN_USER and EIGHTA_ADMIN_PASSWORD must be set in the environment');
  }

  if (context) {
    await context.close();
  }
  context = await login(username, password);
  sessionExpiresAt = Date.now() + SESSION_LIFETIME_MS;
}

export async function fetchAscents(userId: string, pageSize: number): Promise<any> {
  await ensureSession();
  const page = await context!.newPage();
  try {
    const url = `https://www.8a.nu/api/unification/ascent/v1/web/users/${userId}/ascents?category=bouldering&pageIndex=0&pageSize=${pageSize}`;
    const response = await page.goto(url);
    if (!response) {
      throw new Error(`No response navigating to ${url}`);
    }
    if (response.status() === 401 || response.status() === 403) {
      // Session may have expired server-side even though our local expiry
      // clock hasn't hit yet - force a fresh login on the next call.
      sessionExpiresAt = 0;
    }
    if (!response.ok()) {
      throw new Error(`Ascents fetch for ${userId} failed: HTTP ${response.status()}`);
    }
    return await response.json();
  } finally {
    await page.close();
  }
}

// pageSize=0 (intended to discover a true grand total before re-fetching)
// returns a hard HTTP 500 from 8a.nu's API, and a small pageSize just echoes
// itself back as `totalItems` rather than the real count - so there's no
// working way to discover the total up front. Matching the manual workflow's
// own approach: just request a single page comfortably larger than anyone's
// real ticklist.
const MAX_ASCENTS_PAGE_SIZE = 10000;

export async function fetchAllAscents(userId: string): Promise<any> {
  return fetchAscents(userId, MAX_ASCENTS_PAGE_SIZE);
}

export async function closeEightABrowser(): Promise<void> {
  if (context) {
    await context.close();
    context = null;
  }
  if (browser) {
    await browser.close();
    browser = null;
  }
  sessionExpiresAt = 0;
}
