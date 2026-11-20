# AGENTS.md: Đảo Đèn Lồng

Read `docs/notes/PRD-0.md` (condensed requirements + Test Contract) before changing gameplay. Assumptions and numbers: `docs/notes/phase-1.md`.

## Commands
- Test: `npm test` (node:test, no deps). Must be green before you finish; a Stop hook enforces this.
- Evidence: `npm run proof` (runs every scenario through the real CLI, writes `docs/proof/phase-1/`).
- Headless: `node src/headless.mjs --seed 1 --night 1 --ticks 600 --out out.jsonl [--scenario s.json] [--inputs i.json] [--snapshot-every 10]`
- Game: `npm start`, open http://localhost:8080

## Architecture
- `src/sim.mjs`: ALL gameplay rules. Pure + deterministic: no `Math.random`, no `Date`, no DOM. Seeded RNG `makeRng` only.
- `src/headless.mjs`: CLI, input/scenario validation (malformed = exit 2), JSONL writer.
- `src/game.js` + `index.html`: three.js renderer, sound, keyboard. Never put rules here; visual extras must not touch sim state.
- `tests/scenarios.mjs`: one acceptance scenario per requirement, shared by tests and proof.

## Rules
- `TUNING` in sim.mjs and `game.contract.json` must stay identical (a test checks it). Change both or neither.
- Tick model: step k reads input of tick k, events get `tick = k+1`. Do not change event names/fields from the contract.
- Distances are horizontal XZ, `<=` means "within".
- Never hand-edit files in `docs/proof/`; regenerate with `npm run proof`.
- Do not weaken a test to make it pass. If a requirement changes, edit the test and note why in `docs/notes/`.
- Keep commits small, one concern each.
