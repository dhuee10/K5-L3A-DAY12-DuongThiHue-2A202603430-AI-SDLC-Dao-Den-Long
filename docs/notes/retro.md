# Retro: Đảo Đèn Lồng (4 phases, Day 12 AI SDLC)

## 1. Results by phase

| Phase | Delivered | Tests (end of phase) | Notable risk / gap |
|---|---|---|---|
| 1 · PRD-0 | Night 1 playable, headless v1.0, harness | 22 | Own tuning numbers (replaced in Phase 2) |
| 2 · Ticket-02 | Standard numbers, 3 maps, dash/fall/charms/drifters/wind/pause, menus, HUD, palette | 43 | Shade wander, spawning duration and Night 3 start are my own interpretations |
| 3 · Ticket-03 | Lantern fuel, drain, dawn win, capacity, new score, colour-blind mode, ADR + changelog | 57 | `fuel_drain` timing and shade travel speeds are interpretations |
| 4 · Ticket-04 | Bench, soak, disk leaderboard + export, accessibility, release | 64 + 24 real-browser checks | Demo video recorded by hand; official bench numbers depend on the grading machine |

Regression across phases: every rule change that replaced an older one was reflected by **rewriting** the affected tests with a logged reason (Phase 2 §4, Phase 3 §3); no test was ever skipped. The headless proof JSONL is byte-identical before and after Phase 4, so the bench/soak/UI work could not have changed graded headless behaviour.

## 2. What worked with AI
- **Condensing each ticket into one context file first** (`PRD-0.md`, `TICKET-0x.md`). Later prompts read 1–2 short files instead of the whole lab board, which saved tokens and kept the numbers in one place.
- **One pure, deterministic rules module** (`sim.mjs`) used by the game, headless, bench and soak. Each ticket was a change in one place, and the browser could never disagree with the tests.
- **Tests written as data** (`tests/scenarios.mjs`), reused by `tools/proof.mjs` to produce real CLI evidence. Every requirement has an id (R*/P*/Q*) that appears in the notes, the tests and the proof.
- **Mutation checks**: deliberately breaking a rule to prove its test fails. This caught a "redundant" rule (Phase 2 charm cooldown) and confirmed that the tests had teeth.
- **Real-browser check over DevTools** instead of trusting screenshots: screenshots run on virtual time and showed a frozen timer in Phase 1, which made it look broken when it wasn't.

## 3. What did not work well
- Bulk edits through inline Bash heredocs broke on quoting once (Phase 3) and nothing was applied. Fixed by writing patch scripts to a file whose `rep()` throws when an anchor is missing, so a failed edit is loud instead of silent.
- Background dev servers outlived their session twice and answered on the same port. They served the same files, so nothing was wrong, but it could have been. The verify skill now says to check the port first.
- Some first-try tests were wrong rather than the code (reading snapshots that were never written, expecting the wrong physics, `>` vs `>=` at exactly 99.9). Every time, the failing output was read before changing anything.

## 4. AI mistakes and how they were caught
| Mistake | Caught by | Harness change |
|---|---|---|
| Tests that could never see an event (idle Mây died before the first spawn) | Reading the scenario output, not just pass/fail | Skill: "decide whether the sim or the test is wrong" |
| Snapshot reads at ticks not on the snapshot interval | Failing test with `undefined` | AGENTS.md rule: `every` must divide every tick you read |
| Bench/browser helpers still using replaced rules (win by lighting all, P to resume) | Browser check failing after the rule change | AGENTS.md: a [THAY THẾ] change needs ADR + CHANGELOG + every affected test rewritten |
| Soak limit "passed" by luck at 1.185 | Re-running 3× and measuring heap vs RSS | Documented the root cause; committed the failing default-flag run too |
| Weak test (reduced motion checked only a CSS class) | Review of my own browser checks | Test now reads the real flash/shake timers after a real hit |

## 5. Harness: what helped most
1. **AGENTS.md** (short, rules + commands, updated every phase; visible in git history). The most valuable lines were the ones added after a mistake ("`every` must divide…", "integer fuel units", "[THAY THẾ] needs ADR + CHANGELOG").
2. **Stop hook** (`tools/stop-hook.mjs`): the agent cannot finish while `npm test` is red. It blocks once, then lets the agent stop with a loud warning so it can't loop forever.
3. **verify skill**: one checklist for tests → proof → mutation check → real browser → screenshots → evidence table.
4. **CI** on Ubuntu + macOS re-runs the tests and proof and fails if the committed proof differs from the code.

## 6. Tokens, cost, and what I'd change
- Estimated total ≈ **950k input / 205k output tokens** (Phase 1 ≈ 200k/40k, Phase 2 ≈ 300k/70k, Phase 3 ≈ 150k/35k, Phase 4 ≈ 300k/60k), all in one Claude Code session with no subagents.
- Savings: condensed ticket files; scripted multi-replace patches instead of re-reading big files; tests as data shared with the proof; skipping exploration in the 30-minute Phase 3.
- **If I did it again:**
  - Write the browser-check script in Phase 1 and extend it every phase, instead of adding it after a screenshot misled me.
  - Agree on a canonical "force state" debug API for the page (win, lose, spawn) instead of poking internals from the test.
  - Record the demo video continuously during Phase 4 instead of leaving it to the end. The video must be screen-recorded by the author: gameplay of Night 1, then `npm test`, `npm run proof`, the bench window and `soak.json`, then the git log and harness.
