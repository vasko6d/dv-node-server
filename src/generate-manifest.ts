import * as fs from 'fs';
import * as path from 'path';

const outJsonDir = path.join(__dirname, '..', 'out-json');
const manifestPath = path.join(outJsonDir, 'manifest.json');
const MANIFEST_FILE_NAME = 'manifest.json';

interface Ascent {
  userName: string;
  userSlug: string;
  userAvatar: string;
  date: string;
  difficulty: string;
  zlaggableName: string;
  zlagGradeIndex: number;
  [key: string]: unknown;
}

interface HardestAscent {
  difficulty: string;
  zlaggableName: string;
  date: string;
}

interface ManifestEntry {
  userSlug: string;
  userName: string;
  userAvatar: string;
  file: string;
  totalAscents: number;
  mostRecentAscentDate: string;
  oldestAscentDate: string;
  hardestAscent: HardestAscent | null;
  fileLastModified: string;
}

function buildManifestEntry(fileName: string): ManifestEntry | null {
  const filePath = path.join(outJsonDir, fileName);

  let ascents: Ascent[];
  try {
    ascents = JSON.parse(fs.readFileSync(filePath, 'utf-8')).ascents;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`Skipping ${fileName}: could not parse as a scorecard file (${(e as Error).message})`);
    return null;
  }

  if (!ascents || ascents.length === 0) {
    // eslint-disable-next-line no-console
    console.error(`Skipping ${fileName}: no ascents found`);
    return null;
  }

  const first = ascents[0];
  let mostRecentAscentDate = first.date;
  let oldestAscentDate = first.date;
  let hardest = first;

  ascents.forEach((ascent) => {
    if (ascent.date > mostRecentAscentDate) {
      mostRecentAscentDate = ascent.date;
    }
    if (ascent.date < oldestAscentDate) {
      oldestAscentDate = ascent.date;
    }
    if ((ascent.zlagGradeIndex ?? -1) > (hardest.zlagGradeIndex ?? -1)) {
      hardest = ascent;
    }
  });

  return {
    userSlug: first.userSlug,
    userName: first.userName,
    userAvatar: first.userAvatar,
    file: fileName,
    totalAscents: ascents.length,
    mostRecentAscentDate,
    oldestAscentDate,
    hardestAscent: {
      difficulty: hardest.difficulty,
      zlaggableName: hardest.zlaggableName,
      date: hardest.date,
    },
    // Per-file mtime (not a single manifest-wide timestamp) so a UI can show
    // real per-user freshness - a disabled/stale friend's entry keeps
    // reflecting their actual last refresh, not today's manifest run.
    fileLastModified: fs.statSync(filePath).mtime.toISOString(),
  };
}

function generateManifest(): void {
  const files = fs.readdirSync(outJsonDir)
    .filter((f) => f.endsWith('.json') && f !== MANIFEST_FILE_NAME);

  const scorecards = files
    .map(buildManifestEntry)
    .filter((entry): entry is ManifestEntry => entry !== null)
    .sort((a, b) => a.userSlug.localeCompare(b.userSlug));

  const manifest = { generatedAt: new Date().toISOString(), scorecards };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  // eslint-disable-next-line no-console
  console.log(`Wrote manifest.json with ${scorecards.length} scorecard(s) to ${outJsonDir}`);
}

generateManifest();
