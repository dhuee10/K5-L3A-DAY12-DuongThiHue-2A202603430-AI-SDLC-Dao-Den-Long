# TICKET-02 context (Phase 2): "Ba hòn đảo" · Contract v1.1

Condensed from the lab board. Two jobs: (1) replace all self-chosen numbers with the standard ones, (2) grow the game to 3 nights with new features. Phase 1 creative extras stay. New characters/enemies are allowed if standard numbers, maps and contract are untouched and headless output does not change.

## Part 1: standard numbers (60 ticks/s, metres, seconds, Y up)

| Group | Value |
|---|---|
| Run | 6.0 m/s; accel/stop ≤ 0.1 s; full air control |
| Jump | 7.0 m/s, gravity −20, only when grounded |
| Dash (new) | 14 m/s, 0.2 s (12 ticks), cooldown 1.5 s from dash start. Direction = move direction, else facing. Air dash keeps altitude. Not invulnerable |
| Motes | capacity 10. Auto pickup if XZ ≤ 1.0 and \|feet Y − mote ground Y\| ≤ 1.5. 20 at start on 20 distinct points; cap 30; at ticks 240, 480, … +1 on an empty point if < 30; no empty point = skip |
| Lantern | cost 10, partial deposits remembered. Interact radius 2.0; each press deposits min(carried, missing) into ONE unlit lantern, nearest, tie → smaller id |
| Safe zone | lit lantern radius 6: shades outside are blocked at the 6 m edge. Shades inside when it lights are pushed to the edge within ≤ 30 ticks and deal no damage meanwhile |
| Pulse | cost 3, radius 5, cooldown 3 s. Centre = feet + 0.8. Targets locked on activation tick (3D distance to shade centre ≤ 5). Stun 120 ticks; first 15 ticks pushed 4 m total horizontally (stop at obstacles; same position → +X). Re-pulse refreshes stun + push. Never kills. < 3 carried = no activation |
| Shade | 4.0 m/s (Night 3: 4.5). Detect 12 m / give up 18 m. Contact XZ ≤ 1.0 and ΔY ≤ 1.5. Max 1 flame lost per tick. Hitting shade recoils 2 m over 60 ticks; a touch during invulnerability does nothing |
| Shade spawn | 2 at tick 300, then 1 every interval (Night 1: 300 + 480k); no valid point = skip. Ids S1, S2… in spawn order |
| Hit | −1 flame; drop floor(carried/2) onto ring 1.5–2.5 m around Mây (TTL 480 ticks, pickable from next tick); invuln 90 ticks |
| Fall (Y < −10) | once, ignores invuln: −1 flame, lose all carried. Wait 60 ticks (no pickup, no hits), respawn at start, vel 0, invuln 90. 0 flames → lose at once, no respawn |
| Flames | 3, refilled each night |
| Time | Night 1/2/3 = 300/330/360 s |
| Win/lose (after each tick) | 0 flames → lost (no_flames); else all lit → won (even on the last tick); else time up → lost (dawn) |
| Score | +10 per mote **deposited** · +100 per lantern · +5 per shade hit by a pulse (each shade, each pulse, even if already stunned) · on win: floor(seconds left) × 2 + 50 × flames. Game total = sum of won nights |

### Mandatory order inside one tick
1. Read input (pause first; if it just paused, stop here).
2. Decrement counters: time, cooldowns, invuln, stun, charm, dropped-mote TTL, charm respawn.
3. Move Mây (jump, dash, pads, wind), then check falling.
4. Pick up motes and charms.
5. Interact with lanterns.
6. Update safe zones.
7. Pulse.
8. Move shades and drifters.
9. Contact: drifters steal first, then shades hit (ascending id).
10. Spawn motes, shades, drifters on schedule (new entities interact from the next tick).
11. Win/lose.
12. Snapshot if due.
While paused: `tick` advances, but `sim_tick`, time, cooldowns, spawns and TTLs freeze; snapshots say `state: "paused"`.

## Part 2: standard maps (angle from +X, so a point is x = r cos θ, z = r sin θ)

**Night 1 · Đảo Bến:** circle r 40 at origin; outside = sea of clouds (fall). Start (0,0,0) facing +Z. Lanterns L1 (0,0,25), L2 (23.8,0,7.7), L3 (14.7,0,−20.2), L4 (−14.7,0,−20.2), L5 (−23.8,0,7.7). Mote points: 8 at r 12 (every 45°) + 16 at r 33 (every 22.5°). Shade points: 12 at r 37 (15°, 45°, …), must be ≥ 15 m from the player; 2 at 5 s, then every 8 s; max 6.

**Night 2 · Đảo Cau:** two circles r 28, centres A (0,0,0) and B (70,0,0); bamboo bridge x ∈ [26,44], z ∈ [−2,2], no railing. Jump pads r 1 at (20,0,18) and (50,0,−18): launch vy 14, horizontal 24 m/s toward the other island's centre, held until landing (move keys don't override; dash still allowed); ~1.4 s flight. Mote points per island: 4 at r 10 (0/90/180/270°) + 8 at r 22 (every 45°). Shade points: 8 per island at r 26 (22.5°, 67.5°, …). Lanterns L1..L6: (0,0,20), (17,0,−10), (−17,0,−10), (70,0,20), (87,0,−10), (53,0,−10). Shades every 7 s, max 8.

**Night 3 · Đảo Chuông:** circle r 45. Tier 0 (Y=0) whole island; tier 1 (Y=3) annulus r 12–24 on the z > 0 half; tier 2 (Y=6) disc r 8 at the centre. Tier edges are vertical cliffs (cannot walk up; walking off drops down). Two straight ramps 3 m wide along the radius at 30° and 150°: foot r 30 (Y 0) → top r 24 (Y 3). Jump pad r 1 at (0,3,13): vy 12, horizontal 8 m/s toward −Z, held until landing → lands on tier 2. Bell tower: cylinder r 2, 8 m high at the tier-2 centre, not climbable. Mote points (30): tier 0: 18 at r 34 (every 20° from 0°); tier 1: 8 at r 18 (20°…160°); tier 2: 4 at r 5 (45/135/225/315°). Shade points: 16 at r 43 (every 22.5°). Lanterns L1..L7: (0,6,6), (18,3,10), (−18,3,10), (35,0,−10), (−35,0,−10), (20,0,−35), (−20,0,−35). Wind: every 30 s a 5 s gust in a random direction pushing 2 m/s, announced 2 s ahead with leaves + sound. Shades every 6 s, max 10.

## Part 3: new features
- **Gió Lạc (drifter), Nights 2–3:** grey-blue silk ribbon, 7 m/s, max 2, spawned at ticks 1200, 2400, … on a random fog point, ids D1, D2… States idle (2 m/s glide) → chase → flee → removed. idle → chase when Mây carries ≥ 5 and is ≤ 15 m away (checked every tick; back to idle when that stops). Touch (XZ ≤ 1.2): steal min(3, carried), flee (away from Mây at 7 m/s for 240 ticks, then vanish with the loot). Each steals once. Pulse on a chasing drifter → flee without stealing; pulse on a fleeing drifter that carries loot → drops all of it on the spot (as dropped motes), vanishes after 120 ticks. Costs no flames; safe zones don't block it; invulnerability doesn't prevent theft.
- **Bùa Gió (charm):** red talisman with gold rim, ids C1, C2. Picked up like a mote. Lasts 600 ticks (re-pickup refreshes): run 7.2 m/s, dash has no cooldown (still needs a new press; presses during a dash are ignored; dash still 14 m/s × 12 ticks). Reappears 2700 ticks after pickup. Night 2: (35,0,0). Night 3: (30,0,25), (−30,0,25).
- **3-night flow:** main menu → night intro (island name, words from Ông Đăng) → play → result → next night. Winning Night 3 shows a Dawn (Bình Minh) screen with the total score. Losing lets you replay that night.
- **Pause (Esc/P):** logic fully stops. Continue / Restart night / Settings / Main menu.
- **Settings:** volume + mouse sensitivity, saved between sessions.
- **Audio:** night music + SFX for pickup, light, pulse, hit, jump, dash, win, lose, shade appears, last-10 s countdown.
- **HUD:** flames top-left; mm:ss top-centre (red + blinking at ≤ 30 s); lanterns k/n + score top-right; 10-slot mote bar bottom-centre; dash and pulse cooldown icons bottom-right; "E — Nạp ánh sáng (x/10)" near a lantern; arrow to the nearest unlit lantern when it is off-screen.
- **Palette (±10 % per RGB channel):** sky/fog #0E1430/#1B2350; grass/sand/wood/cloud sea #2F5D50/#C9B48A/#6B4A2F/#12384A; lantern lit/core/off #FFB347/#FFE9B0/#5B5F6E; mote core/halo #FFF6C2/#FFE58A; shade body/rim/stunned #120A1A/#7A3CFF/#3A3450; Mây shirt / scarf + charm #E8E2D0/#C8102E; gold rim + score / drifter #F2C14E/#8FA3B8; UI danger / UI text #FF5A5F/#F5F1E6. Ambient intensity = 0.15 + 0.55 × lit/total.

## Part 4: Test Contract v1.1 (changes from v1.0)
- `contract_version: "1.1"`; tuning = standard numbers, plus `dash_speed, dash_duration_s, dash_cooldown_s, night2_duration_s, night3_duration_s`.
- `--night` accepts 1, 2, 3.
- Snapshot root adds `night`, `wind {active, dir_deg}`. `player` adds `vel, grounded, invuln, dash_cd_s, pulse_cd_s, charm_s`.
- Required snapshot arrays: `motes (id, pos, kind = random|dropped, ttl_s)`, `drifters (id, pos, state, stolen)`, `charms (id, available, respawn_s)`.
- Scenario adds `player.{invuln_ticks, dash_cd_ticks, pulse_cd_ticks, charm_ticks}`, `shades[].{state, state_ticks_left}`, `drifters`, `charms`, flags `random_drifters`, `wind_enabled`. `drifters`/`charms` replace the defaults.
- Input adds `dash`, `pause` (edge-triggered).
- New events: `dash {}`, `charm_picked {charm_id, charm_ticks}`, `drifter_steal {drifter_id, amount, carried}`, `drifter_drop {drifter_id, amount}`, `night_start {night}`, `paused {}`, `resumed {}`. `player_hit` from a fall adds `lost`.
- Shade states must be exactly: `spawning, wander, chase, recoil, stunned`.
- One full night headless (≤ 21,600 ticks) must finish in ≤ 30 s.

## Definition of done
Evidence for the phase requirements · all Phase 1 hidden tests still pass with the standard numbers · a spec with acceptance criteria for every Part 3 item · AGENTS.md + skills updated (visible in git) · ≥ 1 headless scenario per new feature · normal build averages ≥ 30 FPS at 1280×720.
