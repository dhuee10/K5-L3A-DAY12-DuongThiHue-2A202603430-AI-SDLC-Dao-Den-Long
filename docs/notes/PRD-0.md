# PRD-0 context (Phase 1): Đảo Đèn Lồng

This is the working context for Phase 1. It condenses the PRD-0 from the lab board and the lab docs in this repo (README, GUIDE, CHECKPOINTS, RUBRIC, RULES, SUBMISSION). Agents should read this file instead of re-reading all of them.

## 1. Product (from PRD-0)

- 3D game **Đảo Đèn Lồng**. Player is **Mây**, a young lantern keeper on an island in a sea of clouds. Black fog swallowed the light.
- Mây collects **fireflies (đom đóm / motes)** and carries them back to light the **Great Lanterns (Đèn Lồng Lớn)**.
- **Bóng Mực (shades)**: ink creatures in the fog. They chase Mây; their touch costs health (flames). Mây can **pulse (tỏa sáng)** to drive them off, which costs light. Shades **fear lanterns**.
- Light all lanterns = win. Lose all health = lose. There is a score.

### Phase 1 scope
- One level: **Night 1, Đảo Bến**, a round island with **5 Great Lanterns**.
- Walk, jump, 3D camera.
- Motes scattered on the island, can be picked up.
- Deposit light into a lantern to light it.
- Shades spawn and chase the player.
- Pulse to repel shades.
- Win, lose, score, HUD.
- Can replay after win or lose.

### Look and feel
- Night, warm, fairy tale. The island brightens as lanterns light up.
- Warm yellow/orange = good. Purple/black = danger.
- Simple but nice graphics, not realistic. Mây wears a **nón lá** with a small lantern hanging from it.
- No violence, no gore.
- Creative freedom is encouraged, but extras must not change headless output (disable them headless) and must be listed in README "Sáng tạo của tôi" with short proof.

### Deliverables (tag `phase-1`, public repo)
1. Playable Night 1 from start to win/lose.
2. README.md: install + run (max 3 commands), controls, scoring.
3. `game.contract.json` + headless mode per Test Contract v1.0.
4. Proof that the game meets requirements, short notes (assumptions, AI usage log).
5. The AI harness used (AGENTS.md, skills, hooks...).
6. Must run on macOS/Linux (we develop on Windows, so: Node + browser, works everywhere).

## 2. Test Contract v1.0 (mandatory, exact)

### A. `game.contract.json` at repo root
Keys: `contract_version` "1.0", `team`, `build_cmd`, `run_cmd`, `headless_cmd`, `tuning` with:
`player_speed, carry_capacity, lantern_cost, lantern_count_night1 (5), pickup_radius, interact_radius, pulse_cost, pulse_radius, night1_duration_s, flames, invuln_s, hit_drop_ratio, pulse_stun_s, pulse_push_m, pulse_cooldown_s, safe_radius, shade_speed, shade_hit_radius, fall_enabled, score{per_mote, per_lantern, per_stun, per_second_left, per_flame_left}`.
Values must be the numbers the game really uses (hidden tests generate situations from them). Unused concept: `null`/`false` + README explanation.

### B. CLI
```
<headless_cmd> --seed <int> --night 1 [--scenario f.json] [--inputs f.json] --ticks <int> --out f.jsonl [--snapshot-every <int, default 10>]
```
- Fixed 60 ticks/s, no window, no GPU, as fast as possible.
- Stop after `--ticks` steps or at game end. Exit 0.
- Errors: non-zero exit + stderr. Malformed inputs/scenario: **exit 2**.
- Metres, Y up, ground Y=0, player starts at (0,0,0).
- Tick model: snapshot tick 0 = after scenario setup, before input. Step k (k=0..N-1) reads input of tick k and produces state k+1; events in that step have `tick = k+1`. `--ticks N` = exactly N steps.
- `time_left_s = duration - steps/60`.
- Positions: player = feet, shade = centre, lantern = base, mote = ground point. All distances horizontal (XZ). "Within r" means `<= r`.

### C. Inputs file
`{"frames":[{"tick":0,"move":[0,1],"cam_yaw_deg":0}, {"tick":120,"interact":true}, ...]}`
- Defaults: move [0,0], yaw 0, all buttons false. Fields absent in a frame keep their previous value.
- Frame ticks strictly increasing.
- move [x,z] each in [-1,1]; world dir: `x' = x cosθ + z sinθ`, `z' = -x sinθ + z cosθ`. Normalize if length > 1.
- jump / interact / pulse (/ dash): fire on false -> true edge.
- No inputs file = player stands still.

### D. Scenario file
`player{pos,carried,flames}`, `random_motes`, `random_shades`, `motes[[x,y,z]]`, `shades[{id?,pos}]`, `lanterns[{id,pos?,deposited?,lit?}]`, `time_left_s`.
- `random_*: false` = no auto-spawn; only listed entities (shades active immediately).
- `lanterns` updates by id (L1..L5); unlisted unchanged.
- `motes`/`shades` replace the initial lists; `[]` = none.
- Missing field = game default. Setup emits no events and no score.

### E. Output JSONL
- `snapshot` every N ticks from tick 0: `tick, sim_tick, state, time_left_s, score, player{pos,flames,carried}, lanterns[{id,pos,lit,deposited}], shades[{id,pos,state}], motes_active` (+ recommended `motes[{id,pos}]`).
- `event`: `mote_picked{carried}`, `deposit{lantern_id,amount,deposited}`, `lantern_lit{lantern_id}`, `pulse{stunned_ids}`, `player_hit{by,flames,dropped}`, `shade_spawned{id}`, `game_over{result,reason}` (reasons: all_lit, dawn, no_flames).
- Last line mandatory: `{"type":"end","ticks":N,"state":"won","score":S}`.
- Shade state must include `stunned`. Coords rounded to 3 decimals. Same seed + scenario + inputs = byte-identical output (including generated ids).
- Events that never happen in our game are never written.

## 3. Lab rules that matter for Phase 1

- Phase 1 has ~60 minutes, tag `phase-1` before the 1h mark. Tag and move on even if imperfect; record what is unfinished.
- Grading: hidden headless tests 30, own evidence 20, SDLC + harness 15, eval/retro 10, perf 10, product + creativity 10, video 5.
- Evidence must be real and reproducible at the tag. Never hand-edit output, never write always-pass tests.
- Harness files (AGENTS.md, skills, hooks) must stay in git history.
- Assets: own, AI-made or CC0/CC-BY/MIT, listed in CREDITS.md. No API keys in the repo.
- Token budget matters: small, correct, verified beats big.

## 4. Assumptions for ambiguous points

See [phase-1.md](phase-1.md) for the full list with the numbers chosen.
