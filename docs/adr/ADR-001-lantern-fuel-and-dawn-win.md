# ADR-001: Lantern fuel state model and the dawn win rule

- Status: Accepted (Phase 3, 2026-11-20)
- Trigger: TICKET-03 "Đèn cạn dầu" (Contract v1.2)
- Supersedes: the Phase 2 rules "a lit lantern is final", "shades never enter a safe zone", "win as soon as all lanterns are lit"

## Context
In Phase 2 a lantern was `unlit → lit` and never changed again, so `lit` was a one-way flag. The night ended the moment every lantern was lit. Playtests showed skilled players finished in about 2 minutes. The client now wants tension until dawn: lanterns can go out, and the goal is to keep enough of them lit when time runs out.

## Decision

### 1. Lantern state model
A lantern stores `lit`, `fuel` (integer **1/60 units**, 0–6000), `deposited`, `everLit`, `relits`.

```
            deposit (cost 10, or 5 if everLit)
  UNLIT ───────────────────────────────────────▶ LIT (fuel = 6000, everLit = true)
    ▲                                              │  every tick: fuel −= 1 (burn)
    │  fuel ≤ 0 (stage 2c):                        │  each draining shade: fuel −= 5
    │  lit = false, deposited = 0,                 │  refuel: fuel += 600 × used (≤ 6000)
    └──────── lantern_out, everLit kept ◀──────────┘
```

Derived properties (functions, not stored, so they can never go stale):
- `hasSafeZone = lit && fuel ≥ 1800` (30 fuel; exactly 30 still protects).
- weak lantern = `lit && fuel < 1800`: the target for wandering shades.
- receivable for interact = `!lit` **or** `lit && used > 0`; a full lantern is skipped entirely (no event, no score).

**Why integer 1/60 units:** burn (1/60 per tick) and drain (5/60 per tick) become the integers 1 and 5, so fuel is exact, deterministic across machines, and the "exactly 30" boundary is reliable. It is only divided by 60 (and rounded to 1 decimal) on output.

### 2. Shade `drain` state
New state added beside `spawning, wander, chase, recoil, stunned`. Each shade stores `target` (lantern id) and `drainTicks` (for the `fuel_drain` event every 60 ticks).
- `wander` → move to the nearest weak lantern (at shade speed); if there is none, the nearest unlit lantern (at wander speed); otherwise roam. Within 2 m of a weak lantern → `drain`.
- `drain` → `chase` (Mây ≤ 6 m), `stunned` (pulse; +15 instead of +5), `wander` (lantern out, refuelled to ≥ 30, or > 2 m away).
- Refuelling to ≥ 30 reuses the existing "just lit" eviction path (stage 6): no new mechanism.

### 3. Tick order
Stage 2 gains 2b (burn, then drain, with `fuel_drain` events) and 2c (fuel ≤ 0 → out). Stage 11 becomes: no flames → `no_flames`; else if time is up → `dawn_survived` when lit ≥ ceil(0.6 × n), otherwise `dawn`. There is no other win path.

### 4. Score and capacity
Score constants live in `TUNING.score` and are mirrored in `game.contract.json` (tested). `per_second_left` stays as 0 to show it was removed. Capacity is derived: `min(20, 10 + 2 × player.lights)`, where `lights` counts lights and relights made during play (scenario setup doesn't increment it).

## Alternatives considered
- **Float fuel with epsilon comparisons:** rejected; the "exactly 30" and "≤ 0" boundaries would depend on rounding.
- **A separate `out` state distinct from `unlit`:** rejected. `everLit` alone captures the only difference (relight cost 5, +40), and the contract snapshot only needs `lit` + `ever_lit`.
- **Keeping "all lit = win" as a bonus early win:** rejected; the ticket says explicitly that there is no early win.

## Consequences
- Breaking changes for anyone reading our headless output; listed in [CHANGELOG.md](../../CHANGELOG.md).
- Phase 1/2 tests that encoded replaced rules were updated or rewritten, with reasons in [phase-3.md §3](../notes/phase-3.md). None were skipped.
- `RULES.drain_reach = 2` and the shade travel speeds toward lanterns are our own choices; see phase-3 assumptions.
