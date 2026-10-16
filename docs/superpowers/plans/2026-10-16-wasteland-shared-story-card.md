# Wasteland Shared Story Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Present Wasteland dilemmas inside the pre-existing `#modal-historia`, apply choices to bunker state, and resume the bunker after resolution.

**Architecture:** Keep `pendingBunkerEvent` as the serializable pending-decision source and keep event rules in `game_mechanics.js`. Reuse `renderStoryCard()` and the existing story modal and button classes; route option clicks to the Wasteland resolver. Keep `wasteland_turn` canonical while reading/writing the legacy `wastelandMonthCounter` alias.

**Tech Stack:** Vanilla JavaScript ES modules, HTML, existing CSS, Node.js built-in test runner.

**Spec:** `docs/superpowers/specs/2026-10-16-wasteland-shared-story-card-design.md`

## Global Constraints

- Reuse `#modal-historia`, `.story-dialog`, and existing button styles; add no modal, CSS class, or visual system.
- Keep pending events serializable as `{ id }`; store no functions or callbacks in saved state.
- Preserve existing three Wasteland dilemmas and pre-apocalypse story dismissal semantics.
- Use `randomSeed` and `nextRandom()` for reproducible event outcomes.
- Do not stage or revert pre-existing user changes in `src/core/geopolitics.js`, `tests/dashboard.test.js`, or `tests/geopolitics.test.js`.

## Review Focus

- A Wasteland save may contain only the legacy counter; hydration must preserve the turn count and mirror it to both names. Test in Task 2.
- A greenhouse-only event may be selected before the player has built a greenhouse; selection must skip it without breaking the cadence. Test in Task 2.
- Event costs may exceed available food or energy; reject the choice without clearing the pending event or producing negative supplies. Test in Task 1.
- An expedition report and a story event may become pending on the same month; both must remain visible/resolvable in sequence without advancing time. Test in Task 2 and Task 3.
- A resolved modal must not leave the Canvas loop paused, and an unresolved event must not permit movement or turn advancement. Test in Task 3.

---

### Task 1: Wasteland Event Outcomes

**Files:**
- Modify: `src/core/game_mechanics.js`
- Test: `tests/wasteland-balance.test.js`
- Test: `tests/game-mechanics.test.js`

**Interfaces:**
- Consumes: existing `WASTELAND_EVENTS`, `getWastelandEvent(eventId)`, `canResolveWastelandEvent(state, eventId, optionId)`, `resolveWastelandEvent(state, optionId)`, `nextRandom(seed)`.
- Produces: the existing event access/resolution API, expanded with `radio-signal-unknown` and `greenhouse-fungus`; deterministic costs/outcomes; temporary greenhouse quarantine represented by `room.disabledMonthsRemaining`.

- [x] **Step 1: Write failing event behavior tests**

Add tests asserting:
- Radio `send-scouts` costs 50 food and yields exactly 100 scrap on a successful seeded roll; a failing seed yields no scrap; `ignore-signal` has no costs or loot.
- Fungal `quarantine-greenhouse` sets the first greenhouse's `disabledMonthsRemaining` to 3.
- Fungal `attempt-cure` costs exactly 80 energy; success leaves the room active; failure sets three disabled months and reduces every inhabitant's loyalty by 10, clamped at zero.
- An unaffordable option leaves `pendingBunkerEvent` intact, does not make supplies negative, and leaves the random seed unchanged.
- An unknown event ID or option ID leaves state resources and the pending event unchanged.

- [x] **Step 2: Run focused tests and confirm expected failures**

Run: `node --test tests/wasteland-balance.test.js tests/game-mechanics.test.js`
Expected: FAIL because the new event IDs and outcome logic are not present.

- [x] **Step 3: Implement the events and resolver branches**

In `src/core/game_mechanics.js`, add immutable event definitions for the two new events and prerequisite metadata for greenhouse availability. Extend affordability checks to keep food/energy costs in `shelter_supplies`. Add resolver branches using `nextRandom()` only for probabilistic choices, store the updated seed, apply outcomes immutably, and clear `pendingBunkerEvent` only on valid affordable choices. Keep existing event outcomes unchanged.

- [x] **Step 4: Run focused tests**

Run: `node --test tests/wasteland-balance.test.js tests/game-mechanics.test.js`
Expected: PASS, including existing dilemma, expedition, and loyalty tests.

- [x] **Step 5: Commit the event rules**

```bash
git add src/core/game_mechanics.js tests/wasteland-balance.test.js tests/game-mechanics.test.js
git commit -m "feat: add narrative wasteland dilemmas"
```

### Task 2: Wasteland Cadence, Quarantine, and Save Compatibility

**Files:**
- Modify: `src/core/wasteland.js`
- Modify: `src/core/game-state.js`
- Modify: `src/core/shelter_engine.js`
- Test: `tests/wasteland-balance.test.js`
- Test: `tests/game-mechanics.test.js`
- Test: `tests/shelter-engine.test.js`

**Interfaces:**
- Consumes: `getWastelandEvent()` and event prerequisite metadata from Task 1; existing `advanceWastelandMonth(state)`.
- Produces: `advanceWastelandMonth(state)` increments both counter fields, schedules the next eligible event every third turn, suppresses quarantined greenhouse output for exactly the next three production calculations, and preserves both counter fields during hydration.

- [x] **Step 1: Write failing cadence, quarantine, and hydration tests**

Add tests asserting:
- `wasteland_turn` and `wastelandMonthCounter` both become 3 on the third advance, then the next eligible event is queued.
- A pending dilemma blocks calendar/resource advancement; reports and dilemmas remain independently pending if both are produced in one month.
- Legacy data with only `wastelandMonthCounter: 6` hydrates to both fields at 6; when both exist, `wasteland_turn` takes precedence.
- A greenhouse quarantine yields no food from that greenhouse for exactly three monthly production calculations and resumes output on the fourth.
- `normalizeShelterGrid()` preserves a nonnegative `disabledMonthsRemaining` integer on valid greenhouse room records and omits it on unrelated room types.
- Event selection skips the greenhouse event if there is no greenhouse, then selects it in stable round-robin order once eligible.

- [x] **Step 2: Run focused tests and confirm expected failures**

Run: `node --test tests/wasteland-balance.test.js tests/game-mechanics.test.js tests/shelter-engine.test.js`
Expected: FAIL on missing counter alias, event selection eligibility, and quarantine production behavior.

- [x] **Step 3: Implement counter normalization and event scheduling**

In `src/core/wasteland.js`, read the starting turn from `wasteland_turn ?? wastelandMonthCounter`, increment once, and write the same integer to both. On each third turn, scan the catalog from a persisted round-robin cursor (`wastelandEventCursor`) and queue the next eligible event; advance the cursor after selection. Initialize the cursor in `createGameState()` and Wasteland transition, and normalize it in `hydrateGameState()`.

- [x] **Step 4: Implement greenhouse quarantine timing**

In `src/core/shelter_engine.js`, preserve a clamped nonnegative `disabledMonthsRemaining` field when normalizing greenhouse rooms. In `src/core/wasteland.js`, count only active greenhouses when calculating food and population support. Perform monthly production before decrementing positive timers, so a value of 3 suppresses exactly three complete production calculations.

- [x] **Step 5: Run focused tests**

Run: `node --test tests/wasteland-balance.test.js tests/game-mechanics.test.js tests/shelter-engine.test.js`
Expected: PASS for the new and existing Wasteland cases.

- [x] **Step 6: Commit cadence and persistence**

```bash
git add src/core/wasteland.js src/core/game-state.js src/core/shelter_engine.js tests/wasteland-balance.test.js tests/game-mechanics.test.js tests/shelter-engine.test.js
git commit -m "feat: persist Wasteland event cadence"
```

### Task 3: Reuse the Story Modal and Resume the Bunker

**Files:**
- Modify: `src/ui/dashboard.js`
- Modify: `index.html`
- Modify: `tests/wasteland-balance.test.js`
- Create: `tests/wasteland-story-card.test.js`

**Interfaces:**
- Consumes: `renderStoryCard(state)`, `getStoryEvent()`, `getWastelandEvent()`, `resolveWastelandEvent(state, optionId)`, and the pending event state from Tasks 1-2.
- Produces: `renderStoryCard(state)` renders either the original one-button story or a two-choice Wasteland event using the existing story card DOM/classes; `resolveStoryCardAction(state, action, optionId = null)` routes story dismissal and Wasteland choice to their existing domain functions.

- [x] **Step 1: Write failing shared-modal UI and click-flow tests**

Create `tests/wasteland-story-card.test.js` and add tests asserting:
- `renderStoryCard()` renders the Wasteland title, description, and two option IDs inside `.story-dialog`, and never emits `bunker-event-dialog` or `resolve-bunker-event` markup.
- A normal story still emits its existing `dismiss-story` button.
- `resolveStoryCardAction()` applies the selected Wasteland option through `resolveWastelandEvent()` and preserves the existing `dismiss-story` path for normal stories.
- The shared card action rejects unrelated actions without changing the pending event.

Update the existing Wasteland cadence test in `tests/wasteland-balance.test.js` to assert against `renderStoryCard()` instead of the removed `bunkerEventView()` helper.

- [x] **Step 2: Run focused tests and confirm expected failures**

Run: `node --test tests/wasteland-story-card.test.js tests/wasteland-balance.test.js`
Expected: FAIL because Wasteland events currently use `bunkerEventView()` and `#modal-bunker-event`.

- [x] **Step 3: Extend `renderStoryCard(state)` without new visual components**

In `src/ui/dashboard.js`, retain the normal story branch. Add a Wasteland branch sourced from `pendingBunkerEvent`, rendering the same `.story-dialog` and existing title/body structure; render option buttons with existing `.arcade-vote-yes` and `.arcade-vote-abandon` classes and `data-option` IDs.

- [x] **Step 4: Route clicks and remove the duplicate modal path**

Add the pure `resolveStoryCardAction(state, action, optionId = null)` dispatcher and use it from the existing `#modal-historia` click handler. Route Wasteland options to `resolveWastelandEvent()` only when a Wasteland event is pending; preserve `dispensarHistoria()` for normal dismissal. Remove active `bunkerEventView()` use, the separate modal reference/listener, and the obsolete `#modal-bunker-event` element from `index.html`. Ensure a resolved choice runs the normal save/render path and the reconstructed or existing bunker controller is resumed.

- [x] **Step 5: Run focused tests**

Run: `node --test tests/wasteland-story-card.test.js tests/wasteland-balance.test.js`
Expected: PASS; original story rendering and Wasteland choice flow both use the shared modal.

- [ ] **Step 6: Smoke-test the Canvas pause and resume in the local browser**

Advance to a turn that queues a dilemma. Confirm the existing story card is the only decision modal, movement and month advancement are blocked, and an option click closes the card, saves the result, and restores character movement. Also confirm a simultaneous expedition report appears after the dilemma is resolved.

- [ ] **Step 7: Commit the shared presentation**

```bash
git add src/ui/dashboard.js index.html tests/wasteland-story-card.test.js tests/wasteland-balance.test.js
git commit -m "feat: show Wasteland dilemmas in story modal"
```

### Task 4: Full Verification and Publication

**Files:**
- Verify: entire repository test suite and configured deployment workflow.

**Interfaces:**
- Consumes: completed Tasks 1-3.
- Produces: verified implementation pushed through the repository's existing GitHub Pages deployment path.

- [x] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including unrelated tests already present in the workspace. Report any pre-existing user changes or unrelated failures without reverting them.

- [x] **Step 2: Inspect the final diff and staged file list**

Run: `git status --short` and `git diff origin/main...HEAD --check`.
Expected: only implementation files and tests from this work are in the feature commits; the pre-existing modifications in `src/core/geopolitics.js`, `tests/dashboard.test.js`, and `tests/geopolitics.test.js` are not accidentally staged.

- [ ] **Step 3: Publish and verify deployment**

Push the approved implementation branch/commits using the repository's established GitHub Pages path. Confirm the remote commit and deployment result before reporting the site as updated.

## Final Review

- Verify every requirement in the design spec has a task and a test.
- Verify no new modal ID or CSS class was introduced.
- Verify story dismissal semantics and existing bunker event options remain intact.
- Verify `wasteland_turn` and `wastelandMonthCounter` cannot drift after hydration or advancement.
- Verify a queued expedition report remains accessible when a dilemma is resolved first.
- Verify the quarantine timer survives save/load with the room and expires after exactly three production turns.
