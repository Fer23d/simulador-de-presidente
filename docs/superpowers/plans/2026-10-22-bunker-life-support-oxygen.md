# Bunker Life Support and Oxygen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persisted oxygen reserve, depth-scaled bunker demand and construction/upgrades, a buildable five-level life-support room, suffocation consequences, and visible HUD/Canvas feedback.

**Architecture:** Keep pure oxygen, room production, capacity, and depth-cost calculations in `bunker_economy.js`; construction/upgrades in `shelter_engine.js`; immutable monthly balancing and death outcomes in `wasteland.js`; persistence defaults in `game-state.js`; and movement/rendering/UI feedback in their existing owners. Use the existing saved RNG for deterministic asphyxiation outcomes.

**Tech Stack:** Vanilla JavaScript ES modules, Node.js built-in test runner, HTML Canvas.

**Specification:** `docs/superpowers/specs/2026-10-22-bunker-life-support-oxygen-design.md`

## Task 1: Economy formulas and life-support room profile

**Files:** `src/core/bunker_economy.js`, `tests/bunker-oxygen.test.js`

- [x] Add pure helpers for life-support output, oxygen demand, energy maintenance, depth-scaled build cost, and effective upgrade costs.
- [x] Register `life_support` output and oxygen storage capacity at 300 per level.
- [x] Extend room economy profiles with room oxygen data and support-room energy consumption.
- [x] Add tests for five output levels, people/room demand, floor 0 vs floor 3, excluded room types, and rounded depth costs.
- [x] Run `node --test tests/bunker-oxygen.test.js` and ensure the focused tests pass.

## Task 2: Construction, upgrades, and saved state

**Files:** `src/core/shelter_engine.js`, `src/core/game-state.js`, `src/core/wasteland.js`, `tests/bunker-oxygen.test.js`

- [x] Register `life_support` as a buildable room and route construction through the depth-aware cost helper.
- [x] Apply depth-adjusted scrap prices to room upgrades while retaining science costs.
- [x] Add `shelter_supplies.oxygen`, `oxygen_shortage_turns`, and `oxygen_deprived` to initial state, Wasteland transition, and hydration with safe defaults.
- [x] Initialize the Wasteland with the documented 300 O2 emergency reserve.
- [x] Test construction, upgrade charges, stock clamping, and legacy save hydration.
- [x] Run the focused test file and related `tests/bunker-economy.test.js` and `tests/game-state.test.js`.

## Task 3: Monthly oxygen accounting and asphyxiation

**Files:** `src/core/wasteland.js`, `src/core/game_mechanics.js`, `tests/bunker-oxygen.test.js`

- [x] Calculate production, total demand, energy maintenance, deficit, and reserve exactly once during `advanceWastelandMonth()`.
- [x] Apply monthly balance and persist the shortage streak; reset it on recovery.
- [x] Apply oxygen loyalty loss to eligible inhabitants while preserving existing food/energy, prisoner, expedition, and rebel rules.
- [x] Starting at the third consecutive deficit month, use seeded 30% death chance and remove at most one eligible NPC per month.
- [x] Add tests for sufficient/insufficient production, reserve vs deficit, energy cost, shortage/recovery streak, loyalty, and deterministic death outcomes.
- [x] Run focused oxygen tests plus `tests/wasteland-balance.test.js` and `tests/game-mechanics.test.js`.

## Task 4: HUD, room panel, movement, and visuals

**Files:** `src/ui/dashboard.js`, `src/core/rpg_bunker.js`, `src/core/sprite_engine.js`, `tests/bunker-oxygen.test.js`

- [x] Add O2 stock/capacity and shortage indicator to the bunker HUD.
- [x] Display life-support output/energy cost and per-room depth demand in room-management details; show effective construction cost for the selected build slot.
- [x] Apply the oxygen movement multiplier to player and NPC movement without mutating shared speed constants.
- [x] Add a dedicated life-support art key with existing asset fallback, and clip rotating fans/blue-white piping to life-support rooms only.
- [x] Pass oxygen-deprived state into the Canvas renderer and apply a subtle pulsing red-violet overlay to Canvas pixels only.
- [x] Add UI/render tests and rerun related bunker, environment, and dashboard suites.

## Task 5: Full verification and publication

**Files:** all oxygen feature files above

- [x] Run the complete `npm test` suite and `git diff --check`.
- [x] Review the staged diff to ensure the pre-existing changes in `src/core/geopolitics.js`, `tests/dashboard.test.js`, and `tests/geopolitics.test.js` are excluded.
- [ ] Commit only the oxygen feature and its spec/plan.
- [ ] Push the verified commit to the public deployment branch and confirm GitHub Pages deployment succeeds.

## Implementation Notes

- The grid stores floors zero-based; all depth calculations use `room.floor + 1`.
- Count the President once, plus NPCs physically in the bunker; expedition NPCs do not consume oxygen, while prisoners do.
- Structural rooms excluded from room oxygen drain are `vault`, `elevator`, and `life_support`.
- The HUD and dialogs are DOM elements outside the Canvas, so the oxygen overlay must be scoped to the Canvas context only.
