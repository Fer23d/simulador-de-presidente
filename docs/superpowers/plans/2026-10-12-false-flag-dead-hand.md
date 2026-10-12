# False Flag and Dead Hand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-war false-flag amnesty and a 12-month Dead Hand project that turns terminal defeat into mutual nuclear destruction.

**Architecture:** `black_ops.js` owns the operation; `geopolitics.js` owns target-scoped legitimacy. A new `megaprojects.js` owns costs, progress, completion, and the Dead Hand terminal-state transformation. `game-state.js` coordinates persistence, month processing, and game-over interception, while the dashboard renders commands and the overlay.

**Tech Stack:** Vanilla JavaScript ES modules, HTML, CSS, Node.js test runner.

**Spec:** `docs/superpowers/specs/2026-10-12-false-flag-dead-hand-design.md`

## Global Constraints

- Remain client-side, framework-free, and immutable at module boundaries.
- Use the existing CRT/arcade interface and terminal ASCII conventions.
- Falsa Bandeira costs R$ 75 bi, 2% population, and 1% GDP base.
- Mão Morta costs R$ 1 tri, 1,000 PP, and 250 uranium; it completes after 12 monthly advances.
- Dead Hand spends one uranium per foreign target in contact order and always devastates the player.

## Review Focus

- Invalid, destroyed, annexed, wasteland, or active-war false-flag targets must not charge resources; Task 1 covers this.
- ONU amnesty applies only to the marked target; Task 2 covers an unmarked declaration.
- Any peace-treaty choice consumes the false-flag marker; Task 2 covers all choices.
- A project cannot be purchased or restarted after completion; Task 3 covers repeat requests.
- Terminal defeat without an active Dead Hand preserves normal behavior; Task 3 covers this.

---

### Task 1: Falsa Bandeira

**Files:**
- Modify: `src/core/black_ops.js`
- Modify: `src/core/game-state.js`
- Test: `tests/black-ops.test.js`

**Interfaces:**
- Produces: `orquestrarFalsaBandeira(state, alvoId) -> state`
- Produces: `executarFalsaBandeira(state, alvoId) -> state`

- [ ] Write a failing test that asserts target id, R$ 75 bi cost, 2% population loss, 1% GDP base loss, and both factions at 100.
- [ ] Run `node --test tests/black-ops.test.js`; verify it fails because the function is missing.
- [ ] Implement target validation, immutable proportional losses, marker assignment, faction boost, and successful-operation news wrapper.
- [ ] Re-run `node --test tests/black-ops.test.js`; verify it passes.
- [ ] Commit with `feat: add false flag operation`.

### Task 2: Legitimate Defense

**Files:**
- Modify: `src/core/geopolitics.js`
- Modify: `src/core/game-state.js`
- Test: `tests/geopolitics.test.js`
- Test: `tests/game-state.test.js`

**Interfaces:**
- Consumes: `state.just_war_target`
- Produces: `isLegitimateDefenseTarget(state, targetId) -> boolean`

- [ ] Write failing tests proving a marked declaration retains ONU score, an unmarked declaration receives its normal penalty, and each peace choice clears the marker.
- [ ] Run `node --test tests/geopolitics.test.js tests/game-state.test.js`; verify it fails for the missing amnesty.
- [ ] Implement the helper and use it in declaration plus treaty annexation; leave unrelated penalties unchanged and consume the marker on annexation, loot, demilitarization, or reparations.
- [ ] Re-run focused tests; verify they pass.
- [ ] Commit with `feat: legitimize false flag war target`.

### Task 3: Mão Morta Project and Game-Over Interceptor

**Files:**
- Create: `src/core/megaprojects.js`
- Modify: `src/core/game-state.js`
- Test: `tests/megaprojects.test.js`
- Test: `tests/game-state.test.js`

**Interfaces:**
- Produces: `iniciarProjetoMaoMorta(state) -> state`
- Produces: `processarMegaprojetos(state) -> state`
- Produces: `interceptarGameOverComMaoMorta(state) -> state`

- [ ] Write failing tests for one-time costs, activation after twelve ticks, normal defeat without the project, player wasteland, and deterministic uranium-funded foreign wastelands.
- [ ] Run `node --test tests/megaprojects.test.js tests/game-state.test.js`; verify RED because the module is absent.
- [ ] Implement `state.megaprojects.deadHand.remainingMonths`, completion flag, 1-uranium-per-contact destruction, player destruction, `dead_hand_triggered`, and terminal news. Route both monthly regime failures and megacorporation-coup failures through the interceptor. Bump state version and hydrate defaults.
- [ ] Re-run focused tests; verify GREEN.
- [ ] Commit with `feat: add dead hand megaproject`.

### Task 4: Arcade Commands and Terminal

**Files:**
- Modify: `index.html`
- Modify: `assets/styles.css`
- Modify: `src/ui/dashboard.js`
- Test: `tests/dashboard.test.js`

**Interfaces:**
- Consumes: `executarFalsaBandeira`, `iniciarProjetoMaoMorta`, `dead_hand_triggered`
- Produces: `renderDeadHandTerminal(state) -> string`

- [ ] Write failing rendering tests for `Orquestrar Falsa Bandeira`, `Construir Rede Mao Morta`, and `DIRETRIZ OMEGA` in the terminal renderer.
- [ ] Run `node --test tests/dashboard.test.js`; verify RED.
- [ ] Add the diplomacy and project controls, static `#modal-dead-hand`, supplied terminal copy, blocking red CRT CSS, and event listeners for start, operation, and reset.
- [ ] Re-run `node --test tests/dashboard.test.js`; verify GREEN.
- [ ] Run `npm test` and `git diff --check`, then commit with `feat: add dead hand terminal interface` and push `HEAD:main`.
