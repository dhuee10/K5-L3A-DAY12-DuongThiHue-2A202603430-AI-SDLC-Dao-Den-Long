// Local leaderboard rules (TICKET-04 §3). Pure functions, shared by the server, the browser and the tests.
export const MAX_ENTRIES = 10;

// 3-12 characters. ASCII [A-Za-z0-9_] is the requirement; Vietnamese letters with diacritics are accepted too (bonus).
// Length is counted in characters after NFC normalisation, so "Huệ" counts 3.
const NAME_RE = /^[\p{L}\p{M}\p{N}_]{3,12}$/u;
export function normalizeName(name) { return typeof name === 'string' ? name.normalize('NFC').trim() : ''; }
export function validName(name) {
  const n = normalizeName(name);
  return NAME_RE.test(n) && [...n].length >= 3 && [...n].length <= 12;
}

// ISO 8601 with the local timezone offset, e.g. 2026-11-20T21:05:33+07:00
export function isoWithOffset(d = new Date()) {
  const pad = (v) => String(v).padStart(2, '0');
  const off = -d.getTimezoneOffset(), sign = off >= 0 ? '+' : '-', a = Math.abs(off);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

export function validEntry(e) {
  return e && validName(e.name) && Number.isInteger(e.score) && e.score >= 0 && Number.isInteger(e.nights_won) && e.nights_won >= 0 && e.nights_won <= 3
    && typeof e.achieved_at === 'string' && !Number.isNaN(Date.parse(e.achieved_at)) && Number.isInteger(e.seed);
}

// score desc; equal score -> whoever achieved it first ranks higher (stable for identical timestamps)
export function sortEntries(entries) {
  return entries.map((e, i) => [e, i]).sort(([a, ia], [b, ib]) => b.score - a.score || Date.parse(a.achieved_at) - Date.parse(b.achieved_at) || ia - ib).map(([e]) => e);
}

export function addEntry(entries, entry) {
  if (!validEntry(entry)) throw new Error('invalid leaderboard entry');
  const clean = { name: normalizeName(entry.name), score: entry.score, nights_won: entry.nights_won, achieved_at: entry.achieved_at, seed: entry.seed };
  return sortEntries([...entries, clean]).slice(0, MAX_ENTRIES);
}
