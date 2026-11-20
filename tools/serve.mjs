#!/usr/bin/env node
// Game server (zero dependencies). This is the contract run_cmd.
//   node tools/serve.mjs                                  -> serves the game on http://localhost:8080 (PORT env to change)
//   node tools/serve.mjs --export-leaderboard out.json    -> writes {"entries":[...]} (top 10, in order) and exits
// The leaderboard lives on local disk: data/leaderboard.json (override with LEADERBOARD_FILE).
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { addEntry, sortEntries, validEntry } from '../src/leaderboard.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const LB_FILE = process.env.LEADERBOARD_FILE ? resolve(process.env.LEADERBOARD_FILE) : join(ROOT, 'data', 'leaderboard.json');
const types = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

export function loadLeaderboard(file = LB_FILE) {
  try {
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    return sortEntries((doc.entries || []).filter(validEntry)).slice(0, 10);
  } catch { return []; }
}
async function saveLeaderboard(entries, file = LB_FILE) {
  await mkdir(dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  await writeFile(tmp, JSON.stringify({ entries }, null, 2) + '\n');
  await rename(tmp, file); // atomic replace: a crash mid-write never corrupts the board
}

const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' }); res.end(body); };

export function startServer(port = Number(process.env.PORT) || 8080) {
  let queue = Promise.resolve(); // serialise writes
  const server = createServer(async (req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    if (url === '/api/leaderboard') {
      if (req.method === 'GET') return send(res, 200, JSON.stringify({ entries: loadLeaderboard() }));
      if (req.method === 'POST') {
        let body = '';
        req.on('data', (c) => { body += c; if (body.length > 10000) req.destroy(); });
        req.on('end', () => {
          queue = queue.then(async () => {
            try {
              const entries = addEntry(loadLeaderboard(), JSON.parse(body));
              await saveLeaderboard(entries);
              send(res, 200, JSON.stringify({ entries }));
            } catch (e) { send(res, 400, JSON.stringify({ error: e.message })); }
          });
        });
        return;
      }
      return send(res, 405, '{}');
    }
    const rel = normalize(url === '/' ? '/index.html' : url).replace(/^([/\\])+/, '');
    const file = join(ROOT, rel);
    if (!file.startsWith(ROOT) || !/^(index\.html|src[/\\]|vendor[/\\]|docs[/\\]proof[/\\].*\.png$)/.test(rel)) return send(res, 404, 'not found', 'text/plain');
    try { send(res, 200, await readFile(file), types[extname(file)] || 'application/octet-stream'); } catch { send(res, 404, 'not found', 'text/plain'); }
  });
  return new Promise((ok, fail) => { server.once('error', fail); server.listen(port, () => ok(server)); });
}

function main() {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--export-leaderboard');
  if (i >= 0) {
    const out = argv[i + 1];
    if (!out) { process.stderr.write('usage: serve.mjs --export-leaderboard <out.json>\n'); process.exit(1); }
    writeFileSync(out, JSON.stringify({ entries: loadLeaderboard() }, null, 2) + '\n');
    console.log(`exported ${loadLeaderboard().length} entries from ${existsSync(LB_FILE) ? LB_FILE : '(empty board)'} to ${out}`);
    return;
  }
  startServer().then((s) => console.log(`Đảo Đèn Lồng: open http://localhost:${s.address().port}  (Ctrl+C to stop)`))
    .catch((e) => { process.stderr.write(`cannot start server: ${e.message}\n`); process.exit(1); });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
