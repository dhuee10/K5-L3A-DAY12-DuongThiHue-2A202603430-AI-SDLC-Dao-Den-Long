# TICKET-04 context (Phase 4): "Bình minh: phát hành v1.0.0" · Contract v1.3

Non-functional work + release. Creative extras stay, but must be off (or not affect the numbers) in the benchmark and soak scenes.

1. **Benchmark** `<bench_cmd> --seed 42 --duration 30 --out bench.json`
   - 1280×720 window (not fullscreen), vsync off if possible (else say so in README).
   - Night 1 with full effects and lighting. Exactly **200 shades in `wander`** spread evenly over the island (seed 42), **100 motes** (may exceed the gameplay cap), L1–L3 lit at fuel 100.
   - Disabled in the bench scene: new spawns, damage, mote pickup, fuel burn, end-of-night. Shades still move by normal wander rules.
   - No input. Mây stands at (0,0,0). Camera orbits (0,0,0): radius 30 m, Y = 15, always looking at (0,0,0), starts at 0° = (30,15,0), counter-clockwise seen from above, 15 s per lap.
   - First 3 s warm-up (not measured), then exactly `--duration` s measured, then exit 0.
   - Output: `contract_version "1.3", avg_fps, p1_low_fps, frame_ms_p95, frames, load_ms, peak_mem_mb, vsync_off, renderer, os`.
     `avg_fps = 1000·N/Σdt`; `p1_low_fps = 1000 / mean(k largest dt)`, `k = max(1, ceil(0.01·N))`; `frame_ms_p95` = 95th percentile of dt; `load_ms` = process start → first bench frame; `peak_mem_mb` = peak RSS during measurement (null + explanation if impossible on web).
   - Pass (on the instructor's machine): avg_fps ≥ 60, p1_low_fps ≥ 30, load_ms ≤ 10000.
2. **Soak** `<soak_cmd> --seed 7 --nights 10 --out soak.json`: 10 nights headless in one process (Night 1→2→3 rotating), night i uses seed 7 + i, each runs to its end or the standard duration. Seeded random input: new move direction every 30 ticks; per tick 5 % jump, 3 % dash, 2 % pulse, 10 % interact. `mem_start_mb` = RSS after loading night 1; `mem_end_mb` = RSS after resetting the last night. Output `{nights, crashes, results[], mem_start_mb, mem_end_mb, duration_s}`. Pass: crashes = 0 and mem_end ≤ 1.2 × mem_start.
3. **Local leaderboard:** name entry after Bình Minh (won Night 3) or after any loss. Name 3–12 chars `[A-Za-z0-9_]` (Vietnamese with diacritics = bonus). Entry: `name, score` (sum of won nights), `nights_won` (0–3), `achieved_at` (ISO 8601 with timezone), `seed`. Top 10, score desc, tie → earlier first. Stored on local disk, survives restarts. Leaderboard screen from the main menu. `<run_cmd> --export-leaderboard out.json` → `{"entries": [...]}` in order.
4. **Accessibility:** remap every action (move ×4, jump, dash, interact, pulse, pause), detect duplicate keys and tell the user, "Restore defaults", saved. Captions / visual cues for: shade appears (plus an edge arrow toward it), wind coming, last 10 s, lantern fuel < 30. Reduced motion: no camera shake, no screen flash. UI text ≥ 18 px at 1280×720; large-text option ×1.25.
5. **Packaging + docs:** clean clone → ≤ 3 commands → playable. README: description, screenshot/GIF, system requirements, install, controls, tests, headless, bench, soak. CHANGELOG covering all 4 phases, CREDITS (all assets, sounds, AI tools), LICENSE. GitHub Release v1.0.0 with a runnable build (executable, static web folder or Docker image + instructions).
6. **Contract v1.3:** `contract_version "1.3"`, add `bench_cmd`, `soak_cmd`; everything from v1.0–v1.2 still holds.
7. **Retro (1–2 pages)** + **demo video .mp4 < 5 min** (Release asset or `docs/demo/demo.mp4`): live play + proof (tests, headless, bench).

DoD: evidence · tag phase-4 + Release v1.0.0 · bench.json and soak.json committed · Phase 1–3 hidden tests still pass · public repo with harness + docs.
