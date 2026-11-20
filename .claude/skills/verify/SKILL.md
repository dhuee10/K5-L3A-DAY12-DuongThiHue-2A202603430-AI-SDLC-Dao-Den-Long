---
name: verify
description: Run and record evidence for Đảo Đèn Lồng (tests, headless scenarios, determinism, performance, real-browser flow, screenshots). Use after any gameplay or contract change, and before tagging a phase.
---

# Verify the game and save evidence

1. `npm test`: all must pass. If one fails, read the failing output first: decide whether the sim or the test is wrong (Phase 2 had both cases). Never loosen a check just to go green; if a requirement changed, update the scenario and log why in `docs/notes/phase-<N>.md`.
2. `npm run proof`: regenerates `docs/proof/phase-<N>/` from the real CLI (set `OUT` in `tools/proof.mjs` for a new phase). Confirm "ALL PASS" in `RESULTS.md`, including the full-night timing (limit 30 s). Never edit those files by hand.
3. New requirement? Add a scenario to `tests/scenarios.mjs` first (`R*` Phase 1, `P*` Phase 2, `night:` for nights 2/3; `check` returns `[ok, message]` pairs; `every` must divide every tick you read). Watch it fail, then implement.
4. Mutation sanity check: break the rule on purpose (e.g. `sed` it out), run `npm test`, confirm the matching scenario fails, restore from a backup copy.
5. Real browser (things headless cannot prove: menus, pause, settings, FPS):
   - Check port 8099 is free first (`curl -s localhost:8099` should fail); a leftover server from an earlier session will otherwise answer.
   - `PORT=8099 node tools/serve.mjs` (background), then `node tools/browser-check.mjs "<chrome path>" http://localhost:8099 --gpu > docs/proof/phase-<N>/browser-check.json`. It must say `"result": "PASS"`. Record CPU/GPU with the FPS numbers.
6. Screenshots (look at them yourself before claiming anything):
   `chrome --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --window-size=1280,720 --virtual-time-budget=6000 --screenshot=<png> "http://localhost:8099/?showcase&night=N"`.
   Screenshots use virtual time, so they never prove that the game ticks; use step 5 for that.
7. Update the evidence table in `docs/notes/phase-<N>.md`: requirement, method, link, result. Anything without real proof is "chưa đạt" or "by inspection only".
8. Release-level checks (Phase 4+): `node tools/bench.mjs --seed 42 --duration 30 --out docs/proof/phase-<N>/bench.json` (needs a desktop session; record CPU/GPU) and the soak command from `game.contract.json`. Commit both JSON files. If a threshold is borderline, measure why (e.g. heap vs RSS) before changing anything, and commit the failing run too.
