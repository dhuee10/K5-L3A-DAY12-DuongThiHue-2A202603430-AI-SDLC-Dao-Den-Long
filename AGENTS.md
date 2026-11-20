# AGENTS.md: Đảo Đèn Lồng

Current phase: **2** (Contract v1.1). Read `docs/notes/TICKET-02.md` (standard numbers, maps, tick order, contract) before changing gameplay. History: `docs/notes/PRD-0.md`. Assumptions: `docs/notes/phase-2.md`.

## Commands
- Test: `npm test` (node:test, no deps). Must be green before you finish; a Stop hook enforces this.
- Evidence: `npm run proof` (every scenario through the real CLI → `docs/proof/phase-2/`).
- Browser check: `PORT=8099 node tools/serve.mjs` then `node tools/browser-check.mjs <chrome> http://localhost:8099 --gpu` (flow, pause, settings, FPS).
- Headless: `node src/headless.mjs --seed 1 --night 1|2|3 --ticks 600 --out out.jsonl [--scenario s.json] [--inputs i.json] [--snapshot-every 10]`
- Game: `npm start`, open http://localhost:8080 (`?autostart&night=3` skips menus).

## Architecture
- `src/sim.mjs`: ALL rules. `step()` follows the 12 numbered stages of the TICKET-02 tick order; keep new logic in the right stage. Pure + deterministic: seeded `makeRng` only, no `Math.random`/`Date`/DOM.
- `src/maps.mjs`: standard map data + `groundAt()`/`insideTower()`. Never invent coordinates; copy them from TICKET-02.
- `src/headless.mjs`: CLI + validation (malformed file = exit 2).
- `src/game.js` + `index.html`: rendering, menus, HUD, audio. Never put rules here; visual extras must not touch sim state.
- `tests/scenarios.mjs`: one scenario per requirement (R* = Phase 1, P* = Phase 2), shared by tests and proof.

## Rules
- Standard numbers are fixed by the client: `TUNING`/`RULES` must match TICKET-02, and `game.contract.json` must equal `TUNING` (tested).
- Shade states are exactly `spawning, wander, chase, recoil, stunned`. Event names/fields exactly as in the contract.
- `tick` always advances; `sim_tick` freezes while paused. Events use `tick`.
- Distances are XZ unless the ticket says 3D (pulse). "Within" means `<=`.
- Never hand-edit `docs/proof/`; regenerate. Never weaken a test to pass; if a requirement changes, edit the test and log why in `docs/notes/phase-N.md`.
- When a test reads `snap(L, t)`, make sure `every` divides `t`.
- Small commits, one concern each.
