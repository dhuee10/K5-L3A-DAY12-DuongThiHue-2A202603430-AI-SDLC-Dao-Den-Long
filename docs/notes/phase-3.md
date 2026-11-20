# Phase 3: change request "Đèn cạn dầu"

Context: [TICKET-03.md](TICKET-03.md). Design decision: [ADR-001](../adr/ADR-001-lantern-fuel-and-dawn-win.md). Breaking changes: [CHANGELOG.md](../../CHANGELOG.md). Evidence: [RESULTS.md](../proof/phase-3/RESULTS.md), [browser-check.json](../proof/phase-3/browser-check.json), [shot-fuel.png](../proof/phase-3/shot-fuel.png).

## 1. Assumptions (where TICKET-03 is silent)

| # | Topic | Assumption |
|---|---|---|
| P3-A1 | Wander speed toward lanterns | Toward a weak lantern: full shade speed (4 / 4.5 m/s). Toward an unlit lantern: wander speed 1.5 m/s, stopping about 1.5 m from it. No lantern target at all → the Phase 2 random roam. |
| P3-A2 | Refuel eviction | Any refuel that leaves fuel ≥ 30 runs the same eviction as lighting (stage 6). A shade evicted from `drain` becomes `wander`. |
| P3-A3 | `fuel_drain` timing | Per shade: emitted on every 60th tick that shade spends draining. `fuel` = value after this tick's burn + drains so far. |
| P3-A4 | Burn vs drain order | Stage 2b burns all lit lanterns first, then applies drains in shade list order; 2c switches off lanterns at ≤ 0. |
| P3-A5 | Scenario `drain` without `target_lantern_id` | Targets the nearest lit lantern. |
| P3-A6 | Scenario `lit: false` + `fuel` | Fuel ignored (an unlit lantern reports 0). `lit: true` without fuel → 100. |
| P3-A7 | Pre-lit scenario lanterns | Marked `ever_lit`, do not raise capacity, give no score (ticket: setup gives no events or score). |
| P3-A8 | Score keys | Contract `score` adds `per_relight 40, per_stun_drain 15, per_lit_at_dawn 50`; `per_second_left` stays as 0 = removed. |
| P3-A9 | Unlit lantern look | Squashed 20 % + torn strip in every palette (not only colour-blind mode), so lit/unlit is always readable without colour. |

## 2. Acceptance criteria → evidence

| Requirement | Criterion | Evidence | Result |
|---|---|---|---|
| Fuel burn + out | 1 fuel/s; at 0: `lantern_out`, deposited 0, ever_lit kept; 1-decimal output | Q1 | Đạt |
| Refuel | `used = min(carried, ceil((100−fuel)/10))`, cap 100, +5/mote, `refuel` event | Q2, Q3 | Đạt |
| Relight | 5 motes, `relight:true`, +40, `relit_count` | Q4 | Đạt |
| Capacity | 10 + 2 × lights, relights count, pre-lit not, max 20 | Q5, Q5b | Đạt |
| Drain | wander → weak lantern → `drain` ≤ 2 m; −6/s total (5 drain + 1 burn); `fuel_drain` every 60 ticks; → `wander` when out | Q6 | Đạt |
| Safe zone at 30 | Fuel exactly 30 blocks; below 30 shades get in | Q7 | Đạt |
| Drain transitions | → `chase` within 6 m; pulse → `stunned` with +15 | Q8, Q8b | Đạt |
| Refuel eviction | ≥ 30 pushes shades out within 30 ticks, no damage | Q9 | Đạt |
| Dawn win | ≥ 3/5 lit → `dawn_survived`, score 50 + floor(fuel) per lit lantern + 50 per flame | Q10, P15 | Đạt |
| Dawn loss | Night 2 with 3/6 lit → `dawn` | Q11 | Đạt |
| no_flames first | Last flame lost on the dawn tick → `no_flames` | Q12 | Đạt |
| No early win | All lit → night continues | R8 | Đạt |
| Fuel bar + 1 Hz blink | Bar on lit lanterns, blinks below 30 | shot-fuel.png (bar visible); blink via `Math.floor(time) % 2` | Đạt (blink by inspection) |
| Colour-blind mode | Saved and applied (`body.cb`, rim #00B3FF, warning white + ⚠) | browser-check "Colour-blind palette…" | Đạt |
| HUD capacity | "Đom đóm: x/cap" + bar up to 20 slots | shot-fuel.png (9/14) | Đạt |
| Flow still works | Nights 1→2→3→Bình Minh with the new win rule; replay after loss | browser-check | Đạt |
| Performance | Full Night 3 (18,000 ticks) | RESULTS.md ~0.35 s | Đạt |

Mutation check: (a) safe zone ignoring fuel, (b) relight costing 10, (c) win requiring all lanterns. Each made Q-tests fail (5 failures); restored.

## 3. Old tests changed (none skipped)

| Test | Change | Reason |
|---|---|---|
| R7 | +20 → +10 for 2 motes | per_mote 10 → 5 |
| R8 | "lighting the last lantern wins" → **R8-no-early-win**: the night continues | TICKET-03 §3 [REPLACES] |
| P15 | "all lit on the last tick wins" → **P15-light-on-dawn-tick-counts**: a lantern lit on the dawn tick counts toward 3/5 | win rule replaced |
| P14 | expected time 300 − 0.5 → 240 − 0.5 | Night 1 = 240 s |
| P18, P19 | durations 360/330 → 300/270 | new durations |
| contract test | version 1.1 → 1.2; snapshot fields `capacity`, `fuel`, `ever_lit`, `relit_count` required | Contract v1.2 |
| CLI perf test | full Night 3 = 18,000 ticks (was 21,600) | Night 3 = 300 s |
| R6 | unchanged code, but its expected score now evaluates to 150 (reads `TUNING`) | — |

## 4. AI log + evaluation
- Approach: wrote the ticket summary, then patched `sim.mjs` with a single scripted multi-replace (each replace fails loudly if its anchor is missing), then the tests, then the UI. The 30-minute budget allowed no exploration.
- AI mistakes: (1) one Bash heredoc broke on quoting and nothing was applied (checked with `git status`, then moved the patch into a script file); (2) Q4 used `> 99.9` where 4 ticks of burn give exactly 99.9; the test was wrong, not the sim; (3) the browser check's "force a win" helper still used the Phase 2 rule; updated to fast-forward to dawn.
- Tokens (Phase 3): about 150k input / 35k output. Savings: scripted patches with no file re-reads, tests reused as proof.
- Risks: shade travel speeds toward lanterns (P3-A1) and the `fuel_drain` timing (P3-A3) are interpretations. The fuel-bar blink is only proven by code inspection.
