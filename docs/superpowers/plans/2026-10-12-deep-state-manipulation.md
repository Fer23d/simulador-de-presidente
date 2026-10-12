# Deep State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Caixa 2 escape endings, leader-double puppetry, and blocking black-site interrogation events to the President Simulator.

**Architecture:** New pure core modules own corruption and interrogation rules, while `game-state.js` remains the sole orchestration boundary for commands, monthly effects, terminal precedence, persistence, and news. The dashboard only renders state and dispatches state commands; static modal roots remain in `index.html` and CRT presentation stays in the existing stylesheet.

**Tech Stack:** Vanilla ES modules, HTML, CSS, Node.js built-in test runner.

**Spec:** `docs/superpowers/specs/2026-10-12-deep-state-manipulation-design.md`

## Global Constraints

- Preserve immutable state transitions and deterministic rolls through `nextRandom`.
- Use `state.economy.cash`, never a new root `cash` field.
- Preserve the Arcade/CRT visual system; no external dependencies or backend.
- New terminal states must block simulation and all state-changing commands.
- Use TDD: each production behavior starts with a test that demonstrably fails.
- Bump the serialized `STATE_VERSION` and hydrate every new persistent field safely.

## Review Focus

- A terminal save with a pending dilemma or escape ending must reload without reopening ordinary gameplay; cover in Task 2.
- A player with exactly R$ 50 bi must qualify for the escape/dilemma threshold; cover in Task 1.
- A failed double infiltration must charge resources exactly once while setting DEFCON 1 and starting a war; cover in Task 3.
- A pending interrogation must suppress further monthly events and the advance button; cover in Tasks 4 and 5.
- A double agent must be consumed only by the next Falsa Bandeira or Ciberataque, not by unrelated diplomacy; cover in Task 3.

---

### Task 1: Caixa 2 Core Module and Command

**Files:**
- Create: `src/core/corruption.js`
- Modify: `src/core/game-state.js`
- Create: `tests/corruption.test.js`
- Modify: `tests/game-state.test.js`

**Interfaces:**
- Consumes: `state.economy.cash`, `state.slush_fund`, `state.factions`, `state.regime.gameOver`.
- Produces: `desviarFundos(state)`, `isEscapeEligible(state)`, and `interceptarFinalCaixa2(state)`.

- [ ] **Step 1: Write failing tests for 5% diversion, repeated-transfer faction loss, and exactly-R$-50-bi eligibility**

```js
test('diverts five percent of treasury cash into the slush fund', () => {
  const result = desviarFundos({ ...createGameState('bra'), economy: { ...createGameState('bra').economy, cash: 100_000 } });
  assert.equal(result.economy.cash, 95_000);
  assert.equal(result.slush_fund, 5_000);
});

test('treats fifty billion in slush funds as an eligible escape', () => {
  assert.equal(isEscapeEligible({ ...createGameState('bra'), slush_fund: 50_000_000_000 }), true);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --test tests/corruption.test.js`

Expected: FAIL because `corruption.js` and its exports do not exist.

- [ ] **Step 3: Implement the pure Caixa 2 functions and the game-state command**

Create `desviarFundos(state)` with a 5% `Math.floor` transfer, increasing `slushFundTransfersThisMonth`; after the first transfer, lower every present faction by 2 with a floor of 0. Create `isEscapeEligible(state)` using `>= 50_000_000_000`. Create `interceptarFinalCaixa2(state)` to clear pending final state, set `escape_ending_triggered`, retain `regime.gameOver`, and add a terminal notice. Export a `desviarFundosParaCaixa2(state)` command from `game-state.js` that rejects game-over/pending-final states and adds a news item on success.

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `node --test tests/corruption.test.js tests/game-state.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the Caixa 2 core behavior**

```bash
git add src/core/corruption.js src/core/game-state.js tests/corruption.test.js tests/game-state.test.js
git commit -m "feat: add Caixa 2 diversion"
```

### Task 2: Terminal Final Resolver, Dilemma, and Persistence

**Files:**
- Modify: `src/core/game-state.js`
- Modify: `src/core/megaprojects.js`
- Modify: `tests/game-state.test.js`
- Modify: `tests/megaprojects.test.js`

**Interfaces:**
- Consumes: `isEscapeEligible(state)` and `interceptarFinalCaixa2(state)` from Task 1, plus `interceptarGameOverComMaoMorta(state)`.
- Produces: `resolverFinalDeJogo(state)`, `fugirEmSilencio(state)`, `afundarComONavio(state)`, and `destruirDoHelicoptero(state)` exported by `game-state.js`.

- [ ] **Step 1: Write failing tests for all four terminal precedence paths and hydrated terminal state**

```js
test('opens a final dilemma when both Caixa 2 and Dead Hand are eligible', () => {
  const result = advanceMonth({ ...terminalState, dead_hand_active: true, slush_fund: 50_000_000_000 });
  assert.equal(result.pendingFinalDilemma, true);
  assert.equal(result.dead_hand_triggered, false);
  assert.equal(result.escape_ending_triggered, false);
});

test('destroy from helicopter performs retaliation and records personal escape', () => {
  const result = destruirDoHelicoptero({ ...terminalState, pendingFinalDilemma: true, dead_hand_active: true, slush_fund: 50_000_000_000 });
  assert.equal(result.dead_hand_triggered, true);
  assert.equal(result.escape_ending_triggered, true);
});
```

Include a save/reload case for `pendingFinalDilemma` and `escape_ending_triggered`.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `node --test tests/game-state.test.js tests/megaprojects.test.js`

Expected: FAIL because the terminal resolver and dilemma commands do not exist.

- [ ] **Step 3: Implement terminal precedence and save migration**

Increase `STATE_VERSION` to 10. Add the six persisted fields from the spec to `createGameState` and `hydrateGameState`; accept saves from v1 through v10. Replace the private Dead Hand-only interception with `resolverFinalDeJogo`: first set `pendingFinalDilemma` when both paths qualify, otherwise route to escape or Dead Hand. Make all state-changing public game-state commands return a blocking notice while a final dilemma is pending. Reset `slushFundTransfersThisMonth` only after a completed month. Implement the three dilemma command functions with the exact outcome ordering in the spec; the helicopter option calls Dead Hand before marking the escape ending.

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `node --test tests/game-state.test.js tests/megaprojects.test.js tests/corruption.test.js`

Expected: PASS.

- [ ] **Step 5: Commit terminal resolution**

```bash
git add src/core/game-state.js src/core/megaprojects.js tests/game-state.test.js tests/megaprojects.test.js tests/corruption.test.js
git commit -m "feat: add final escape dilemma"
```

### Task 3: Leader Doubles, Puppet Tribute, and Double-Agent Guarantees

**Files:**
- Modify: `src/core/black_ops.js`
- Modify: `src/core/cyber_warfare.js`
- Modify: `src/core/un_assembly.js`
- Modify: `src/core/game-state.js`
- Modify: `tests/black-ops.test.js`
- Modify: `tests/cyber-warfare.test.js`
- Modify: `tests/un-assembly.test.js`
- Modify: `tests/game-state.test.js`

**Interfaces:**
- Consumes: `nextRandom`, `startWar`/geopolitical contact shape, and `double_agent_active` set by Task 4.
- Produces: `infiltrarSosia(state, alvoId)` and monthly puppet tribute integration.

- [ ] **Step 1: Write failing tests for deterministic double success/failure, tribute, UN vote, and double-agent consumption**

```js
test('turns an eligible authoritarian target into a puppet after paying the operation cost', () => {
  const result = infiltrarSosia(preparedStateWithSuccessSeed, 'arg');
  assert.equal(result.economy.cash, preparedStateWithSuccessSeed.economy.cash - 200_000_000_000);
  assert.equal(result.technology.points, preparedStateWithSuccessSeed.technology.points - 500);
  assert.equal(result.geopolitics.contacts.find((contact) => contact.id === 'arg').is_puppet_of, 'jogador');
});

test('uses and clears a double agent on the next cyber attack', () => {
  const result = lancarCiberataque({ ...preparedState, double_agent_active: true }, 'arg');
  assert.equal(result.double_agent_active, false);
  assert.ok(result.geopolitics.contacts.find((contact) => contact.id === 'arg').cyber_paralyzed_until);
});
```

Also assert failure charges once, declares war, sets DEFCON 1, puppet tribute credits 20% of base GDP monthly, and puppet UN votes match the chosen player vote.

- [ ] **Step 2: Run focused tests to verify they fail**

Run: `node --test tests/black-ops.test.js tests/cyber-warfare.test.js tests/un-assembly.test.js tests/game-state.test.js`

Expected: FAIL because `infiltrarSosia` and double-agent behavior are absent.

- [ ] **Step 3: Implement infiltration and integrations**

In `black_ops.js`, validate an existing non-democratic, viable target, R$ 200 bi, and 500 PP; always debit both resources and consume exactly one seed roll. At `< 0.6`, set `is_puppet_of: 'jogador'`; otherwise set target war/relation and global DEFCON 1. Add a game-state wrapper that news-logs the outcome. In the monthly engine, sum `Math.floor(contact.pib_base * 0.2)` across player puppets into `economy.cash`. Extend UN vote tallying to take the player vote and count all `is_puppet_of === 'jogador'` contacts as that vote. Extend cyber and false-flag operations to force success when `double_agent_active` is true, then consume only that flag.

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `node --test tests/black-ops.test.js tests/cyber-warfare.test.js tests/un-assembly.test.js tests/game-state.test.js`

Expected: PASS.

- [ ] **Step 5: Commit leader-double and double-agent logic**

```bash
git add src/core/black_ops.js src/core/cyber_warfare.js src/core/un_assembly.js src/core/game-state.js tests/black-ops.test.js tests/cyber-warfare.test.js tests/un-assembly.test.js tests/game-state.test.js
git commit -m "feat: add leader doubles and double agents"
```

### Task 4: Black-Site Interrogation Core and Monthly Event Gate

**Files:**
- Create: `src/core/interrogation.js`
- Modify: `src/core/game-state.js`
- Create: `tests/interrogation.test.js`
- Modify: `tests/game-state.test.js`

**Interfaces:**
- Consumes: `nextRandom(state.randomSeed)`, `pendingInterrogation`, and the global blocking-state contract from Task 2.
- Produces: `sortearCapturaAgente(state)`, `resolverInterrogatorio(state, metodo)`, and `reivindicarInterrogatorio(state, premio)`.

- [ ] **Step 1: Write failing tests for capture, block conditions, each method, and both rewards**

```js
test('opens an interrogation from a deterministic five-percent capture roll', () => {
  const result = sortearCapturaAgente({ ...createGameState('bra'), randomSeed: captureSeed });
  assert.equal(result.pendingInterrogation.phase, 'choice');
});

test('extracting secrets grants two thousand research points after a successful interrogation', () => {
  const result = reivindicarInterrogatorio(successfulInterrogationState, 'extract-secrets');
  assert.equal(result.technology.points, successfulInterrogationState.technology.points + 2_000);
  assert.equal(result.pendingInterrogation, null);
});
```

Include a blocked-state case, insufficient-bribe case, failure cleanup, and `turn-double-agent` reward.

- [ ] **Step 2: Run focused tests to verify they fail**

Run: `node --test tests/interrogation.test.js tests/game-state.test.js`

Expected: FAIL because the interrogation module and commands do not exist.

- [ ] **Step 3: Implement the pure event state machine and monthly hook**

Define method data in `interrogation.js`: serum 70%, psychological 45%, bribe 85% and R$ 1 bi. `sortearCapturaAgente` opens `{ phase: 'choice', prisonerId: 847 }` only if no blocking condition exists and the deterministic roll is below 0.05. `resolverInterrogatorio` validates phase and bribe funds, consumes a random roll, then transitions to `{ phase: 'reward' }` on success or clears on failure. `reivindicarInterrogatorio` either adds 2,000 PP or sets `double_agent_active`, then clears the modal state. Integrate capture after other monthly resolution checks so it cannot compete with another modal, and wrap commands with notices/news.

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `node --test tests/interrogation.test.js tests/game-state.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the interrogation engine**

```bash
git add src/core/interrogation.js src/core/game-state.js tests/interrogation.test.js tests/game-state.test.js
git commit -m "feat: add black-site interrogations"
```

### Task 5: CRT UI, Modal Wiring, and End-to-End Verification

**Files:**
- Modify: `index.html`
- Modify: `assets/styles.css`
- Modify: `src/ui/dashboard.js`
- Modify: `tests/dashboard.test.js`
- Modify: `tests/game-state.test.js`

**Interfaces:**
- Consumes: state/commands from Tasks 1-4.
- Produces: static modal roots, `renderEscapeEnding`, `renderFinalDilemma`, `renderInterrogation`, and delegated action wiring.

- [ ] **Step 1: Write failing UI tests for the three modals and controls**

```js
test('renders the final dilemma and its three terminal actions', () => {
  assert.match(renderFinalDilemma({ pendingFinalDilemma: true }), /FUGIR EM SILENCIO/);
  assert.match(renderFinalDilemma({ pendingFinalDilemma: true }), /DESTRUIR O MUNDO DO HELICOPTERO/);
});

test('renders an interrogation terminal while a prisoner awaits a choice', () => {
  assert.match(renderInterrogation({ pendingInterrogation: { phase: 'choice' } }), /PRISIONEIRO #847/);
});
```

- [ ] **Step 2: Run the dashboard test to verify it fails**

Run: `node --test tests/dashboard.test.js`

Expected: FAIL because the render functions and controls do not exist.

- [ ] **Step 3: Add static modal roots, render functions, styles, and delegated actions**

Add `modal-fuga`, `modal-dilema-final`, and `modal-interrogatorio` to `index.html`. Render the exact user-provided dilemma ASCII copy and its three buttons. Render the helicopter escape copy with formatted `slush_fund`. Build the terminal interrogation choice/reward views. Add `.modal-arcade-terminal` with black/green CRT styling, and focused styles for escape and dilemma content. In Economy, show Caixa 2 and `Desviar Fundos para as Ilhas Cayman`; in Diplomacy, show `Infiltrar Sosia do Lider` only for eligible targets. Treat pending final dilemma and interrogation as advance-blocking in the dashboard and route every new `data-action` through the exported game-state commands.

- [ ] **Step 4: Run focused UI tests to verify they pass**

Run: `node --test tests/dashboard.test.js`

Expected: PASS.

- [ ] **Step 5: Run full verification and commit the UI**

Run: `npm test && git diff --check`

Expected: full suite PASS and no diff-check output.

```bash
git add index.html assets/styles.css src/ui/dashboard.js tests/dashboard.test.js tests/game-state.test.js
git commit -m "feat: add Deep State CRT interface"
```
