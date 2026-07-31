interface Ascent {
  date: string;
  zlaggableSlug: string;
  ascentId: unknown;
  [key: string]: unknown;
}

// Mirrors scraper.py's sortByDate: sort by (date, zlaggableSlug).
export function sortAscents(ascents: Ascent[]): Ascent[] {
  return [...ascents].sort((a, b) => {
    if (a.date !== b.date) {
      return a.date < b.date ? -1 : 1;
    }
    if (a.zlaggableSlug !== b.zlaggableSlug) {
      return a.zlaggableSlug < b.zlaggableSlug ? -1 : 1;
    }
    return 0;
  });
}

// Mirrors scraper.py's duplicate-skipping logic: two ascents are duplicates
// if they're identical except for ascentId, and "unknown" zlaggableSlugs are
// exempt from de-duplication (they're allowed to repeat).
export function dedupeAscents(ascents: Ascent[]): Ascent[] {
  const seen = new Set<string>();
  const result: Ascent[] = [];

  ascents.forEach((ascent) => {
    const withoutId = { ...ascent };
    delete withoutId.ascentId;
    const key = JSON.stringify(withoutId);

    if (seen.has(key) && ascent.zlaggableSlug !== 'unknown') {
      return;
    }
    seen.add(key);
    result.push(ascent);
  });

  return result;
}

const ASCII_LIMIT = 127;
const HEX_RADIX = 16;
const HEX_DIGITS = 4;

// JSON.stringify leaves non-ASCII characters literal; Python's json.dump was
// called with ensure_ascii=True, which escapes them to \u-sequences instead.
// Match that so output stays byte-for-byte consistent with the existing
// published files. Built via charCodeAt rather than a regex of escape
// sequences to avoid any ambiguity in how those sequences get transcribed.
function escapeNonAscii(jsonString: string): string {
  let result = '';
  for (let i = 0; i < jsonString.length; i += 1) {
    const code = jsonString.charCodeAt(i);
    if (code > ASCII_LIMIT) {
      const hex = code.toString(HEX_RADIX).padStart(HEX_DIGITS, '0');
      result += `\\u${hex}`;
    } else {
      result += jsonString[i];
    }
  }
  return result;
}

// Mirrors scraper.py's manual file writer: CRLF line endings and compact
// per-ascent JSON, kept diff-friendly (one ascent per line) rather than a
// single JSON.stringify of the whole array.
export function serializeAscentsFile(ascents: Ascent[]): string {
  const lines = ascents.map((ascent) => `        ${escapeNonAscii(JSON.stringify(ascent))}`);
  return `{\r\n    "ascents": [\r\n${lines.join(',\r\n')}\r\n    ]\r\n}`;
}

export function processScorecard(rawData: { ascents: Ascent[] }): string {
  const sorted = sortAscents(rawData.ascents);
  const deduped = dedupeAscents(sorted);
  return serializeAscentsFile(deduped);
}
