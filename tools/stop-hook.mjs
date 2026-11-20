// Claude Code Stop hook: refuse to let the agent finish while tests are red.
// Exit 2 + stderr = block and feed the failure back to the agent.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

let payload = {};
try { payload = JSON.parse(require_stdin() || '{}'); } catch { /* no payload */ }

const r = spawnSync(process.execPath, ['--test', 'tests/'], { encoding: 'utf8' });
if (r.status === 0) process.exit(0);

const failing = (r.stdout + r.stderr).split('\n').filter((l) => /^\s*(✖|not ok)/.test(l)).slice(0, 15).join('\n');
if (payload.stop_hook_active) {
  // already blocked once in this stop cycle: let it stop, but say so loudly (avoid infinite loop)
  process.stderr.write(`WARNING: tests still failing:\n${failing}\n`);
  process.exit(0);
}
process.stderr.write(`Tests are failing. Fix them (do not weaken tests) before finishing:\n${failing}\n`);
process.exit(2);

function require_stdin() {
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
}
