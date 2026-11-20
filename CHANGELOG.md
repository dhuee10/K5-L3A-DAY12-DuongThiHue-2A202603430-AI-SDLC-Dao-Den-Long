# Changelog

## [phase-3] Contract v1.2: "Đèn cạn dầu"

### Breaking changes
- **Win rule:** no more early win. `game_over.reason: "all_lit"` is retired. Win is now `dawn_survived` (alive at dawn with lit ≥ ceil(0.6 × lanterns)); loss is `dawn` or `no_flames`.
- **Night length:** 300/330/360 s → **240/270/300 s** (`night1_duration_s`, `night2_duration_s`, `night3_duration_s`).
- **Score formula replaced:** +5 per mote put into a lantern (was +10), +100 first light, **+40 relight** (new), pulse +5 or **+15 on a draining shade**, dawn bonus `50 + floor(fuel)` per lit lantern + 50 per flame. **Time bonus removed** (`per_second_left: 0`).
- **Lit lanterns can go out:** fuel burns 1/s; at 0 → `lantern_out`, `deposited` reset to 0. Interacting with a lit, not-full lantern now refuels it instead of doing nothing.
- **Safe zone conditional:** only lanterns with fuel ≥ 30 keep the 6 m safe zone.
- **Carry capacity is no longer fixed at 10:** it is `10 + 2 × successful_lights`, max 20 (`player.capacity` in snapshots).
- **Shade states:** new state `drain`; `wander` shades now walk toward lanterns instead of only roaming.
- **`lantern_lit` data** gains `relight: true|false`.

### Added
- Contract v1.2 tuning keys: `fuel_max, fuel_decay_per_s, fuel_per_mote, relight_cost, win_ratio, drain_per_s, low_fuel_threshold, capacity_max` (+ score keys `per_relight, per_stun_drain, per_lit_at_dawn`).
- Snapshot: lantern `fuel` (1 decimal), `ever_lit`, `relit_count`; `player.capacity`.
- Scenario: lantern `fuel`, `ever_lit`; `player.successful_lights`; `shades[].target_lantern_id`; `drain` accepted as a shade state.
- Events: `refuel`, `lantern_out`, `fuel_drain` (every 60 ticks of draining).
- UI: fuel bar on lit lanterns with a 1 Hz blink below 30; unlit lanterns squashed 20 % with a torn paper strip; HUD shows carried/capacity and the "lanterns needed" threshold; "E — Châm dầu" hint; saved colour-blind palette setting (shade rim/eyes #00B3FF, warnings white + ⚠).
- Docs: [ADR-001](docs/adr/ADR-001-lantern-fuel-and-dawn-win.md).

## [phase-2] Contract v1.1: "Ba hòn đảo"
- Standard numbers replaced all self-chosen values; three standard maps; dash, falling, Bùa Gió, Gió Lạc, Night 3 wind, pause; 12-stage tick order; menus, settings, HUD layout, palette. Details: [docs/notes/phase-2.md](docs/notes/phase-2.md).

## [phase-1] Contract v1.0
- Night 1 playable; headless runner; scenario tests; harness.
