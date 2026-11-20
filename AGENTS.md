# AGENTS.md: Đảo Đèn Lồng

Current phase: **4 / v1.0.0** (Contract v1.3; Phase 4 context: `docs/notes/TICKET-04.md`). Read `docs/notes/TICKET-02.md` (numbers, maps, tick order) **and** `docs/notes/TICKET-03.md` (lantern fuel, drain, dawn win; it overrides Ticket-02 where marked) before changing gameplay. Design record: `docs/adr/`. Breaking changes: `CHANGELOG.md`. Assumptions: `docs/notes/phase-3.md`.

## Commands
- Test: `npm test` (node:test, no deps). Must be green before you finish; a Stop hook enforces this.
- Evidence: `npm run proof` (every scenario through the real CLI → `docs/proof/phase-4/`).
- Bench: `node tools/bench.mjs --seed 42 --duration 30 --out bench.json` (opens Chrome 1280x720). Soak: `node --expose-gc --jitless --max-semi-space-size=1 tools/soak.mjs --seed 7 --nights 10 --out soak.json`.
- Leaderboard export: `node tools/serve.mjs --export-leaderboard out.json` (board file: `data/leaderboard.json`, override `LEADERBOARD_FILE`).
- Browser check: `PORT=8099 node tools/serve.mjs` then `node tools/browser-check.mjs <chrome> http://localhost:8099 --gpu` (flow, pause, settings, FPS).
- Headless: `node src/headless.mjs --seed 1 --night 1|2|3 --ticks 600 --out out.jsonl [--scenario s.json] [--inputs i.json] [--snapshot-every 10]`
- Game: `npm start`, open http://localhost:8080 (`?autostart&night=3` skips menus).

## Architecture
- `src/sim.mjs`: ALL rules. `step()` follows the 12 numbered stages of the TICKET-02 tick order; keep new logic in the right stage. Pure + deterministic: seeded `makeRng` only, no `Math.random`/`Date`/DOM.
- `src/maps.mjs`: standard map data + `groundAt()`/`insideTower()`. Never invent coordinates; copy them from TICKET-02.
- `src/headless.mjs`: CLI + validation (malformed file = exit 2).
- `src/game.js` + `index.html`: rendering, menus, HUD, audio. Never put rules here; visual extras must not touch sim state.
- `src/leaderboard.mjs` (rules), `src/benchstats.mjs` (bench formulas + camera), `tools/serve.mjs` (= run_cmd: static files + /api/leaderboard on disk).
- `tests/scenarios.mjs`: one scenario per requirement (R* = Phase 1, P* = Phase 2, Q* = Phase 3), shared by tests and proof.

## Rules
- Standard numbers are fixed by the client: `TUNING`/`RULES` must match TICKET-02, and `game.contract.json` must equal `TUNING` (tested).
- Shade states are exactly `spawning, wander, chase, recoil, stunned, drain`. Event names/fields exactly as in the contract.
- Lantern fuel is integer 1/60 units (`l.fuel`, max 6000); never store float fuel; divide only in `snapshot()`. Use `hasSafeZone()` / `fuelOf()` / `capacityOf()` instead of re-deriving.
- A rule change from a ticket marked [THAY THẾ] needs: ADR (`docs/adr/`), CHANGELOG entry, and every affected test rewritten with its reason logged (never skipped).
- `tick` always advances; `sim_tick` freezes while paused. Events use `tick`.
- Distances are XZ unless the ticket says 3D (pulse). "Within" means `<=`.
- Never hand-edit `docs/proof/`; regenerate. Never weaken a test to pass; if a requirement changes, edit the test and log why in `docs/notes/phase-N.md`.
- When a test reads `snap(L, t)`, make sure `every` divides `t`.
- Small commits, one concern each.
- The bench scene (`createBenchGame`, `g.bench`) must never change headless output: after touching sim.mjs, `npm run proof` JSONL must stay byte-identical.
- When running the browser check, use a throwaway `LEADERBOARD_FILE` so test names never land in the real board.
