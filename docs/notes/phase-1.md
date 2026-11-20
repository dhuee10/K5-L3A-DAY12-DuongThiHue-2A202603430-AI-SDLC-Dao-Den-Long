# Phase 1: assumptions, acceptance, evidence, AI log

Requirements context: [PRD-0.md](PRD-0.md). Generated evidence: [../proof/phase-1/RESULTS.md](../proof/phase-1/RESULTS.md).

## 1. Tech decision
- **JavaScript, one rules module (`src/sim.mjs`) shared by the browser game and the headless CLI.** Why: headless and the playable game cannot drift apart, and Node + a browser run the same everywhere (macOS/Linux/Windows), with no Docker needed.
- three.js 0.160 (MIT) from a CDN for rendering. No npm dependencies, so `npm install` is effectively a no-op and builds cannot break.

## 2. Assumptions (ambiguous points in PRD-0)

| # | Topic | Assumption |
|---|---|---|
| A1 | "Health" | 3 **flames** (`flames: 3`). Lose one per shade touch. |
| A2 | Invulnerability | 1.5 s after a hit, so one shade does not drain all flames at once. |
| A3 | Carrying | Max 10 motes. Picked up automatically within 1 m (no button). |
| A4 | Lighting | 5 motes per lantern, so 25 total for the night. Interact (E, edge-triggered) deposits `min(carried, remaining)` into the **nearest unlit** lantern within 2.5 m. Partial deposits accumulate. |
| A5 | "Pulse costs light" | Costs 1 carried mote. Impossible with 0 carried. 1 s cooldown. Stuns every shade within 6 m for 3 s and pushes it 4 m straight away from Mây (instant). A pulse event is emitted even if it stuns nobody. Score per stunned shade. |
| A6 | "Shades fear lanterns" | Only **lit** lanterns repel (unlit ones give no light). Shades can never be closer than `safe_radius` = 4 m (state `blocked` at the edge). Standing at a lit lantern is safe because 4 m > 1 m hit radius. |
| A7 | Hit drop | `floor(carried × 0.5)` motes are **lost** (not scattered back on the ground). |
| A8 | Time limit | Night lasts 300 s. Reaching 0 = lose with reason `dawn`. |
| A9 | Falling | No falling. An invisible wall at radius 40 m, so `fall_enabled: false` and no `by: "fall"` events. |
| A10 | Score | per_mote 10, per_lantern 100, per_stun 25. On **win only**: +1 per whole second left (`floor`) + 50 per flame left. Bonus is included in the final score and in `end.score`. |
| A11 | Jump | 7 m/s, gravity 20 m/s² (~0.7 s airtime). Vertical only. All contract distances are horizontal, so jumping does not dodge shades. |
| A12 | Default world | Lanterns on a 22 m pentagon, L1 at (0,0,22). 40 random motes. Below 15 active motes, one respawns every 2 s. 2 shades at start on a 32 m ring, +1 every 30 s up to 6 (`shade_spawned`). Disabled by `random_motes:false` / `random_shades:false`. |
| A13 | Shade AI | Moves straight toward Mây at 3.5 m/s. States: `chase`, `stunned`, `blocked`. Shade y defaults to 1.0 (hovering centre). |
| A14 | Step order | move → jump → pickup → interact/deposit → pulse → shades → contact → spawns → dawn. The game ends immediately in the step where win/lose happens. |
| A15 | Scenario shades with `random_shades` omitted | They replace the initial list, and timed spawning stays on (default true). New ids skip ids already used. |
| A16 | Snapshots | Only on multiples of `--snapshot-every` (no extra final snapshot). The `end` line carries final state/score. `motes` array included. |
| A17 | CLI errors | Malformed/unreadable inputs or scenario → exit 2. Bad/missing CLI args or `--night` ≠ 1 → exit 1. |

## 3. Acceptance criteria → evidence

Method key: **S** = headless scenario (`tests/scenarios.mjs`, run via the CLI by `npm run proof`), **U** = test in `tests/scenarios.test.mjs`, **V** = screenshot / manual play.

| Requirement (PRD-0 / Contract) | Method | Evidence | Result |
|---|---|---|---|
| Walk at player_speed, camera-relative input, normalization | S R1, R2 | scenarios/R1, R2 | Đạt |
| Jump | S R3 | scenarios/R3 | Đạt |
| Pick up motes (radius, capacity, score) | S R4, R5 | scenarios/R4, R5 | Đạt |
| Deposit / light lantern (radius, partial, score) | S R6, R7 | scenarios/R6, R7 | Đạt |
| Win when all lit, with bonus; pre-lit lanterns give no events/score | S R8 | scenarios/R8 | Đạt |
| Pulse: cost, radius, stun, push, cooldown, needs light | S R9, R10, R11 | scenarios/R9-R11 | Đạt |
| Shades chase, hit, drop, invulnerability | S R12 | scenarios/R12 | Đạt |
| Lose: no_flames / dawn | S R13, R14 | scenarios/R13, R14 | Đạt |
| Shades fear lit lanterns (safe_radius) | S R15 | scenarios/R15 | Đạt |
| Random world + shade_spawned | S R16 | scenarios/R16 | Đạt |
| JSONL format, snapshot schedule, end line, rounding | U | `npm test` | Đạt |
| Determinism | U + proof | RESULTS.md hash table | Đạt |
| Malformed inputs → exit 2 | U + proof | RESULTS.md | Đạt |
| contract tuning == code | U | `npm test` | Đạt |
| 3D view, Mây with nón lá + lantern, HUD, warm vs purple palette | V | shot-play.png, shot-showcase.png | Đạt |
| Island brightens as lanterns light | V | shot-showcase.png (2 lit) vs shot-play.png (0 lit) | Đạt |
| Game runs in a real browser, W moves at 6 m/s, losing shows the end card, R replays | Browser (CDP) | [browser-check.json](../proof/phase-1/browser-check.json) via `tools/browser-check.mjs` | Đạt |
| Full play-through to win by hand | V | Not recorded in Phase 1 | **Chưa có bằng chứng** (will be in the Phase 4 video) |

Test quality check: deliberately broke the safe-zone clamp + invulnerability (R12, R15, R16 went red) and pickup count (R4, R5 went red), then restored. So the scenarios do detect real rule breaks.

Performance: full 300 s night (18000 ticks, spawning on) runs headless in ~100 ms (see RESULTS.md).

## 4. AI usage log

| Step | Tool / model | What | Notes |
|---|---|---|---|
| Read docs + PRD-0 | Claude Code (Opus) | Condensed PRD-0 + Test Contract + lab rules into `PRD-0.md` | One pass, so later prompts only need this file |
| Environment | Claude Code | No Node on the Windows machine: installed Node LTS via winget | Python 3.14 existed, but one JS codebase for game + headless was chosen to avoid duplicate rules |
| Sim + CLI | Claude Code | `sim.mjs`, `headless.mjs` written from the contract text | First smoke run with the PRD example scenario matched hand calculation (mote at z=5 picked at tick 40) |
| Tests | Claude Code | 16 requirement scenarios + CLI tests | All passed first try. **That is suspicious, so ran mutation checks** (see above) to prove the tests can fail |
| Renderer | Claude Code | three.js front-end | Verified with headless Chrome screenshots, inspected visually |
| Harness | Claude Code | AGENTS.md, Stop hook (blocks finish on red tests), verify skill, CI | Hook tested: green → 0, red → 2, red + `stop_hook_active` → 0 (no infinite loop) |

| Browser check | Claude Code | Headless-Chrome screenshots showed the timer frozen at 5:00, so it was not yet proven that the browser game ticks. Wrote `tools/browser-check.mjs` (CDP: real keypresses, reads sim state) | Confirmed: the frozen timer was only headless virtual time; in real time the sim ticks, W moves, loss + replay work |

AI mistakes caught:
- A first draft of the R16 scenario left the player idle in a default night. Shades killed Mây at ~12 s, before the 30 s spawn, so it could never see `shade_spawned`. Fixed by parking Mây at a lit lantern. The same issue appeared in the first determinism/perf run (ended at tick 712), fixed the same way.
- A first draft of the Stop hook used `require` inside an ES module, which silently read no stdin. Caught on review, fixed to `readFileSync(0)`.
- Screen-space mapping: three.js camera looking along +Z has screen-right = −X, so D must send `move x = -1`. Handled in `readInput()`, documented in code.

Token/cost estimate (Phase 1): ~1 long Claude Code session, roughly 150–200k tokens in / 40k out. Savings: condensed context file, a single shared rules module (no duplicate implementation), no subagents, tests written as data so proof reuses them.

## 5. Phase 1 evaluation
- Done: every PRD-0 Phase 1 scope item plus the full Test Contract v1.0. All 22 tests green, proof ALL PASS.
- Not proven yet: a recorded human play-through to victory (planned for the video).
- Risks for later phases: tuning values are guesses. If the instructor's hidden tests assume pulse costs something other than carried motes, or that unlit lanterns also repel, A5/A6 will need revisiting.
- Harness to watch: if the agent edits `TUNING` without the contract, the test catches it. Nothing else needed yet.
