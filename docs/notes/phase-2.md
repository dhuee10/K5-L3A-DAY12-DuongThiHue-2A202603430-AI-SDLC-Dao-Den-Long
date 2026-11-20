# Phase 2: spec, assumptions, acceptance, evidence, AI log

Requirements context: [TICKET-02.md](TICKET-02.md). Generated evidence: [../proof/phase-2/RESULTS.md](../proof/phase-2/RESULTS.md), [browser-check.json](../proof/phase-2/browser-check.json).

## 1. Design changes and why
- **All self-chosen Phase 1 numbers replaced** by the standard table (TICKET-02 Part 1). `TUNING` in `src/sim.mjs` and `game.contract.json` (now v1.1) are equal; a test enforces it.
- **Maps moved to data** (`src/maps.mjs`): lantern/spawn points, islands, bridge, tiers, ramps, pads, tower, charms per night, plus a single `groundAt(x,z)` used by player, shades, drops and the renderer. Why: one source for physics and visuals.
- **`step()` rewritten to follow the mandatory 12-stage tick order literally** (stage numbers are comments in the code). Why: hidden tests compare per-tick behaviour, so the order is part of the contract.
- **Score model changed**: +10 per mote *deposited* (was per pickup), pulse +5, win bonus ×2.
- **Fall is now real** (`fall_enabled: true`): the invisible wall at 40 m was removed.
- Tick counters: `tick` (always advances) vs `sim_tick` (frozen while paused).

## 2. Assumptions (where TICKET-02 is silent)

| # | Topic | Assumption |
|---|---|---|
| P2-A1 | Acceleration "≤ 0.1 s" | Instant (0 s), which satisfies the bound and keeps distances exact. |
| P2-A2 | Shade `spawning` | Lasts 60 ticks; does not move or hit. Then `wander`. |
| P2-A3 | Night 3 start | **(0, 0, −30)** facing +Z (tier 0, south side). The ticket gives no start, and (0,0,0) is inside the bell tower. Night 2 start (0,0,0) = centre of island A. |
| P2-A4 | Shade `wander` | 1.5 m/s, new random heading (seeded RNG) every 120 ticks. Gió Lạc idle uses the same scheme at 2 m/s. Neither leaves the ground area. |
| P2-A5 | Shade height | Shades float at ground + 1.0 m and follow terrain (they pass over tier cliffs). They cannot enter the void or the bell tower. Pulse push stops at those obstacles. Scenario shades keep their given height offset. |
| P2-A6 | Mote cap 30 | Counts all active motes (random + dropped). "Empty point" = no mote exactly on that spawn point. |
| P2-A7 | Valid shade spawn point | ≥ 15 m (XZ) from Mây **and** not inside a lit lantern's safe zone. |
| P2-A8 | After stun / recoil / spawning | → `wander`; the detection check in the same tick turns it to `chase` if Mây is ≤ 12 m away. |
| P2-A9 | Pulse vs Gió Lạc | Only `chase` (→ flee, no theft) and `flee` with loot (→ drop + vanish in 120 ticks) react, as written. Idle drifters ignore pulses. Drifters are not in `stunned_ids` and give no score. |
| P2-A10 | Gió Lạc theft | Any `idle`/`chase` drifter that touches (XZ ≤ 1.2) a Mây carrying ≥ 1 steals. Hovers at ground + 1.5 m. |
| P2-A11 | Wind | Gusts start at sim ticks 1800, 3600, … for 300 ticks; integer `dir_deg` from the seeded RNG; also pushes during dash/launch. The 2 s warning (leaves + text) is display-only. `wind.dir_deg` is `null` when no gust. |
| P2-A12 | Cliffs | Mây can step up ≤ 0.35 m (enough for 0.05 m per tick on ramps). Anything higher is a wall (slides along X/Z). Walking off an edge = falling. |
| P2-A13 | Jump pad | Triggers when Mây is grounded at pad height with feet within 1 m of the pad centre. |
| P2-A14 | Snapshot `player.invuln` | Seconds remaining (number), like `dash_cd_s`. Charms also carry `pos`. Random motes have `ttl_s: null`. |
| P2-A15 | `night_start` | Written once at tick 0, right after snapshot 0. |
| P2-A16 | Safe-zone eviction | Linear to the 6 m edge over exactly 30 ticks; ignores other movement meanwhile. |
| P2-A17 | Scenario shades without `state` | `wander` (active at once; chase on the first tick if within 12 m). |
| P2-A18 | Game total | Sum of the scores of won nights only; a lost attempt adds 0. |
| P2-A19 | Browser pause | The front-end stops stepping the sim (same effect as the `pause` input). Pressing Esc again or P resumes. Losing window focus also pauses. |

## 3. Acceptance criteria for Part 3 + evidence

S = headless scenario (`tests/scenarios.mjs`, re-run through the CLI by `npm run proof`), B = real browser via CDP (`tools/browser-check.mjs`), V = screenshot.

| Feature | Acceptance criterion (testable) | Evidence | Result |
|---|---|---|---|
| Dash | Dash moves 2.8 m in 12 ticks; second press within 90 ticks ignored; standing dash uses facing; `dash` event; `dash_cd_s` = 1.5 | S P1 | Đạt |
| Dash (air) | Altitude constant during an air dash, gravity resumes after | S P2 | Đạt |
| Bùa Gió | `charm_picked {C1, 600}`; run 7.2 m/s; dash re-pressable with no cooldown; press during dash ignored; `respawn_s` counts down from 45 | S P3 | Đạt |
| Fall | Y < −10 → `player_hit {by:"fall", lost}`, −1 flame; 60-tick wait; respawn at start with invuln 1.5 s; with the last flame → lost at once | S P4, P5 | Đạt |
| Night 2 pads | Lands on island B after ~1.4 s, no fall, move keys ignored | S P6 | Đạt |
| Night 3 terrain | Ramp climbs to Y = 3; tier-2 cliff blocks; pad lands on tier 2 (Y = 6) | S P7, P8, P9 | Đạt |
| Safe zone | Blocked at 6 m (R15); a shade inside when the lantern lights is out by tick 31 and deals no damage | S R15, P10 | Đạt |
| Gió Lạc | Chase at ≥ 5 carried within 15 m; steal 3; flee 240 ticks → removed; pulse on chase → flee without theft; pulse on loaded flee → `drifter_drop` + 3 dropped motes, vanish after 120; spawn D1 at tick 1200 (Night 2) | S P11, P12, P13, P19 | Đạt |
| Pause | `paused`/`resumed` events; `state:"paused"`; tick advances while sim_tick, time and movement freeze | S P14; B "Esc pauses / P resumes" | Đạt |
| Win/lose order | All lit on the tick time runs out = win; max one flame per tick; nearest lantern tie → smaller id | S P15, P16 | Đạt |
| Spawn schedules | 20 distinct motes, +1 at 240; shades S1, S2 at 300, S3 at 780 (Night 1), `spawning` then active, ≥ 15 m away on r 37 | S R16 | Đạt |
| Wind | Gust active from tick 1800 for 300 ticks; pushes 10 m in the gust direction | S P17 | Đạt |
| Nights 2/3 data | Lantern ids/positions, durations 330/360, Night 3 shade 4.5 m/s, `night_start` | S P18, P19 | Đạt |
| 3-night flow | Menu → intro (island name + Ông Đăng) → play → result → next; Night 3 win → Bình Minh with total; lose → replay same night | B | Đạt |
| Settings | Volume + mouse sensitivity survive a reload (localStorage) | B | Đạt |
| HUD | Flames top-left, mm:ss top-centre (red blink ≤ 30 s), lanterns + score top-right, 10-slot bar bottom-centre, dash/pulse cooldown rings bottom-right, "E — Nạp ánh sáng (x/10)", off-screen arrow | V shot-n1/n2/n3.png (arrow visible in n2, n3) | Đạt (red timer not captured in a screenshot; code `#timer.danger`) |
| Audio | Music + SFX for pickup, light, pulse, hit, jump, dash, win, lose, shade spawn, 10 s countdown | Code `SFX`, `jumpSfx`, countdown in `hud()` | Đạt by inspection; **no automated proof** (headless audio not captured) |
| Palette | Listed elements use the hex values from the table | Code constant `C` in `src/game.js`, CSS vars in `index.html` | Đạt |
| Ambient light | `0.15 + 0.55 × lit/total` | `sync()` in `src/game.js` | Đạt |
| Performance | Full Night 3 (21,600 ticks) headless ≤ 30 s | RESULTS.md: ~0.22 s | Đạt |
| Performance | ≥ 30 FPS at 1280×720 | B: avg 60 FPS (vsync cap), Night 3, Intel Core Ultra 5 125H + Intel Arc iGPU, Chrome headless with GPU | Đạt |

## 4. Phase 1 tests changed (not silently disabled)

| Test | Change | Reason |
|---|---|---|
| R4 | Score after pickup 10 → 0 | Ticket: +10 per mote **deposited** |
| R6, R7, R8 | carried/cost 10, interact radius 2.0, bonus ×2 | Standard numbers |
| R9, R11 | cost 3, 3D radius from feet + 0.8, push spread over 15 ticks, stun 120 ticks, re-pulse refresh | Standard pulse rules |
| R12 | Dropped motes now lie on a 1.5–2.5 m ring (were destroyed); recoil checked | Standard hit rules |
| R15 | Safe radius 4 → 6 | Standard numbers |
| R16 | No shades at start, first 2 at tick 300; 20 motes on standard points (was 40 random) | Standard spawn schedule |
| R3 | Tighter apex/landing window | Standard jump |
| Output format test | Expects `night`, `night_start`, new player fields and arrays | Contract v1.1 |

## 5. AI usage log (Phase 2)

| Step | What | Notes |
|---|---|---|
| Context | Condensed TICKET-02 into `TICKET-02.md` | Later prompts read only this file |
| Sim | Rewrote `sim.mjs` around the 12 stages; `maps.mjs` for map data | One pass, then fixes from tests |
| Tests | 19 new scenarios + v1.1 CLI tests (43 tests total) | 4 failed first run, see below |
| Front-end | New HUD layout, menus, 3 maps, audio, settings | Checked with screenshots + CDP flow test |

AI mistakes caught this phase:
- **Tests read snapshots that were never written** (R7, R10 asked for tick 5 with `--snapshot-every 10`). Found from the failing output, fixed by setting `every`.
- **Wrong physics expectation in a test** (P2 expected falling right after an air dash, but the vertical speed is still positive). The sim was right; the test was fixed.
- **Test scenario let the shade reach Mây** (P18), so it measured recoil, not speed. Moved the shade further away.
- **Perf run ended early**: Night 3 wind blew Mây off the lantern's tier and shades caught her. That is real game behaviour; the perf run now uses 999 flames so it covers all 21,600 ticks.
- **Mutation check gap**: removing the "no cooldown while charmed" line did not fail any test, because the dash condition also checks the charm. Not a missing test: the rule is enforced in two places. Eviction and wind mutations failed as expected.
- **Leftover process**: the Phase 1 dev server was still holding port 8099 (an earlier `kill` silently matched nothing). Harmless here (it serves files from disk), noted for the skill.

Token/cost estimate (Phase 2): roughly 300k input / 70k output tokens in one Claude Code session. Savings: condensed ticket file, scripted multi-edit patches instead of re-reading files, tests as data shared with the proof generator, no subagents.

## 6. Phase 2 evaluation
- Met: all Part 1 numbers, all Part 2 maps, all Part 3 features, Contract v1.1, both performance targets. `npm test`: 43/43; proof: ALL PASS; browser check: PASS.
- Phase 1 regression: every Phase 1 requirement is still covered (R1–R16), with values updated to the standard numbers (§4).
- Weak spots: audio and the red/blinking timer have only code-level evidence. Shade wander and drifter idle movement are my own design (P2-A4) and could differ from hidden-test expectations. The Night 3 start point is an assumption (P2-A3).
- Harness: AGENTS.md and the verify skill now cover maps, the tick order, the browser check and checking for a leftover server.
