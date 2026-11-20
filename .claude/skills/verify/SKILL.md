---
name: verify
description: Run and record evidence for Đảo Đèn Lồng (tests, headless scenarios, determinism, screenshots). Use after any gameplay or contract change, and before tagging a phase.
---

# Verify the game and save evidence

1. `npm test`: all must pass. If one fails, fix the code (or, if a requirement changed, update the scenario and write why in `docs/notes/`). Never loosen a check just to go green.
2. `npm run proof`: regenerates `docs/proof/phase-<N>/` from the real CLI. Open `RESULTS.md` and confirm "ALL PASS". Do not edit those files by hand.
3. New requirement? Add a scenario to `tests/scenarios.mjs` first (id `R<n>-name`, `req` = one-line requirement, `check` returns `[ok, message]` pairs), watch it fail, then implement.
4. Visual check (things headless cannot prove: HUD, look, island brightening):
   ```
   PORT=8099 node tools/serve.mjs &
   chrome --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --window-size=1280,720 \
     --virtual-time-budget=6000 --screenshot=docs/proof/phase-1/shot-play.png "http://localhost:8099/?autostart"
   ```
   `?showcase` pre-lights two lanterns to show the brightening. Look at the PNG yourself before claiming it works.
   Screenshots use virtual time and do NOT prove the game ticks. For behaviour in the real browser run
   `node tools/browser-check.mjs <chrome-path>` (needs the server on 8099): it presses keys over CDP and must print `"result": "PASS"`.
5. Mutation sanity check when adding tests: break the rule on purpose (e.g. disable the safe-zone clamp), run `npm test`, confirm the matching scenario fails, then restore.
6. Update the evidence table in `docs/notes/phase-<N>.md` with requirement, method, link, result. Mark anything not met as "chưa đạt" with the reason.
