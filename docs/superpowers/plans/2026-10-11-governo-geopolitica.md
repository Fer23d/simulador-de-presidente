# Governo, Geopolitica e Regime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add complete fiscal controls, diplomacy, military and nuclear projects, and regime stability to the monthly web-game simulation.

**Architecture:** Keep serializable state in `game-state.js`, while moving fiscal, foreign-policy, and military calculations into focused core modules. `advanceMonth` orchestrates pure domain functions in the specified order; the dashboard renders and dispatches actions without duplicating domain formulas.

**Tech Stack:** HTML, CSS, Vanilla JavaScript ES modules, Node.js `node:test`, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-10-11-governo-geopolitica-design.md`

## Global Constraints

- Remain fully client-side; do not add a backend, framework, or external runtime dependency.
- Store only JSON-serializable data in the save state and preserve safe `localStorage` recovery.
- Use deterministic state-backed randomness for monthly battle and stability rolls.
- Keep nuclear mechanics macro-strategic and abstract; do not implement technical weapon-construction detail.
- Preserve the democratic Congress workflow until the regime explicitly becomes dictatorship.
- Use TDD: every production behavior starts with a failing `node:test` test.
- Keep the dashboard responsive for desktop and mobile viewports.

## Review Focus

- A v1 save with a negative cash balance must migrate without silently changing it to zero; Task 3 adds the migration test.
- A failed diplomatic command must leave every contact flag and the treasury unchanged; Task 2 adds rejection tests.
- A finished game must not advance its date, economy, wars, or seed; Task 3 adds a frozen-state test.
- A nuclear military project must apply diplomatic penalties exactly once after completion; Task 2 adds an idempotency test.
- A range input changed through the keyboard must update the projected budget and persist like pointer interaction; Task 4 adds the event-path test.

---

## File Structure

- Modify: `src/core/economy.js` - fiscal bounds, defense expense, and economic modifiers.
- Create: `src/core/geopolitics.js` - contacts, diplomatic commands, sanctions, deterministic war resolution.
- Create: `src/core/military.js` - military initialization, nuclear projects, and regime stability.
- Modify: `src/core/game-state.js` - v2 creation/migration, public commands, dictatorship laws, and turn orchestration.
- Modify: `src/ui/dashboard.js` - navigation, sliders, and diplomacy/military views.
- Modify: `assets/styles.css` - responsive controls and panels.
- Modify/Create: `tests/economy.test.js`, `tests/geopolitics.test.js`, `tests/military.test.js`, `tests/game-state.test.js`, and `tests/dashboard.test.js`.

### Task 1: Fiscal Controls and Economic Modifiers

**Files:**
- Modify: `tests/economy.test.js`
- Modify: `src/core/economy.js`

**Interfaces:**
- Produces: `BUDGET_LIMITS`, `clampBudgetRate(key, value)`, `setBudgetRate(budget, key, value)`, and `projectBudget(economy, budget, modifiers = {})`.
- Produces: `advanceEconomy(economy, budget, lawEffects = {}, modifiers = {})`, while preserving existing three-argument callers.
- Consumed by Tasks 3 and 4.

- [ ] **Step 1: Write failing fiscal-control tests**

```js
test('sets defense spending inside its configured range', () => {
  assert.equal(setBudgetRate(DEFAULT_BUDGET, 'defenseSpend', 0.2).defenseSpend, 0.15);
});

test('includes defense spending in monthly expenses', () => {
  const base = projectBudget(economy, { ...DEFAULT_BUDGET, defenseSpend: 0 });
  const armed = projectBudget(economy, { ...DEFAULT_BUDGET, defenseSpend: 0.06 });
  assert.ok(armed.expenses > base.expenses);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/economy.test.js`

Expected: FAIL because the fiscal API or defense calculation is absent.

- [ ] **Step 3: Implement fiscal bounds and projections in `src/core/economy.js`**

Use tax bounds of `0..0.6`, controllable spending bounds of `0..0.15`, and a `modifiers` argument for trade, sanctions, and civil energy. Include `defenseSpend` in the existing expense total and retain `clampTaxRate` as a compatible export.

- [ ] **Step 4: Write a failing behavior test for fiscal and civil-energy effects**

```js
test('applies high-tax and civil-energy modifiers during an economic month', () => {
  const lowTax = advanceEconomy(economy, { ...DEFAULT_BUDGET, incomeTaxRate: 0.1 });
  const highTax = advanceEconomy(economy, { ...DEFAULT_BUDGET, incomeTaxRate: 0.55 });
  assert.ok(highTax.gdp < lowTax.gdp);
  assert.ok(
    projectBudget(economy, DEFAULT_BUDGET, { infrastructureCostModifier: -0.1 }).expenses
      < projectBudget(economy, DEFAULT_BUDGET).expenses,
  );
});
```

- [ ] **Step 5: Implement the minimal modifier effects and verify**

Run: `node --test tests/economy.test.js; npm test`

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/core/economy.js tests/economy.test.js
git commit -m "feat: expand fiscal budget controls"
```

### Task 2: Diplomacy, War, Military, and Nuclear Domain Modules

**Files:**
- Create: `tests/geopolitics.test.js`
- Create: `tests/military.test.js`
- Create: `src/core/geopolitics.js`
- Create: `src/core/military.js`

**Interfaces:**
- Produces: `createGeopolitics()`, `proposeTradeTreaty(geopolitics, contactId)`, `proposeAlliance(geopolitics, contactId)`, `declareWar(geopolitics, contactId)`, `advanceGeopolitics(geopolitics, military, economy, seed)`, and `getGeopoliticalModifiers(geopolitics, military)`.
- Produces: `createMilitary(country)`, `advanceMilitary(military, economy, budget, geopoliticalResult)`, `fundNuclearProject(military, economy, kind, amount)`, `applyNuclearCompletion(geopolitics, military)`, `evaluateRegime(regime, economy, military, geopolitics, seed)`, and `canAutogolpe(regime, military, budget)`.
- Consumed by Task 3 as plain serializable objects.

- [ ] **Step 1: Write failing diplomacy tests**

```js
test('only signs a trade treaty above relation 20 and outside war', () => {
  const state = createGeopolitics();
  assert.equal(proposeTradeTreaty(state, 'usa').ok, false);
  const eligible = { ...state, contacts: state.contacts.map((item) => item.id === 'usa' ? { ...item, relation: 21 } : item) };
  assert.equal(proposeTradeTreaty(eligible, 'usa').ok, true);
});

test('resolves the same war outcome for the same seed', () => {
  const war = declareWar(createGeopolitics(), 'arg').geopolitics;
  assert.deepEqual(
    advanceGeopolitics(war, { power: 50 }, economy, 7),
    advanceGeopolitics(war, { power: 50 }, economy, 7),
  );
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/geopolitics.test.js`

Expected: FAIL with module-not-found for `src/core/geopolitics.js`.

- [ ] **Step 3: Implement `src/core/geopolitics.js`**

Seed `usa`, `chn`, and `arg`; clamp relation to `-100..100`; require `>20` for a treaty and `>45` plus treaty for an alliance. Commands return `{ ok, reason, geopolitics }` without mutating input. Add state-seeded PRNG and monthly war costs/results.

- [ ] **Step 4: Write failing military, nuclear, and stability tests**

```js
test('raises military power after a month of defense investment', () => {
  const initial = createMilitary(country);
  assert.ok(advanceMilitary(initial, economy, { defenseSpend: 0.08 }, {}).military.power > initial.power);
});

test('applies military nuclear sanctions only once', () => {
  const completed = { ...createMilitary(country), nuclear: { civilProgress: 0, militaryProgress: 100, civilOnline: false, bombBuilt: true, diplomaticPenaltyApplied: false } };
  const first = applyNuclearCompletion(createGeopolitics(), completed);
  const second = applyNuclearCompletion(first.geopolitics, first.military);
  assert.equal(second.geopolitics.sanctionSeverity, first.geopolitics.sanctionSeverity);
});

test('permits autogolpe only with strong support and defense', () => {
  assert.equal(canAutogolpe({ type: 'democracy' }, { support: 85 }, { defenseSpend: 0.06 }), true);
});
```

- [ ] **Step 5: Implement `src/core/military.js`**

Use 0-to-100 power/support/progress. Civil completion yields growth and infrastructure cost modifiers. Military completion boosts deterrence and applies one global diplomatic penalty. Regime evaluation returns `{ regime, seed, event }` and ends a dictatorship on a forced revolution roll.

- [ ] **Step 6: Run domain tests and suite**

Run: `node --test tests/geopolitics.test.js tests/military.test.js; npm test`

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/core/geopolitics.js src/core/military.js tests/geopolitics.test.js tests/military.test.js
git commit -m "feat: add diplomacy and military simulation"
```

### Task 3: Game State v2, Regime Commands, and Monthly Orchestration

**Files:**
- Modify: `tests/game-state.test.js`
- Modify: `src/core/game-state.js`

**Interfaces:**
- Consumes: Task 1 fiscal API and Task 2 domain modules.
- Produces: `setBudget`, `proposeTreaty`, `proposeAlliance`, `startWar`, `fundNuclear`, `attemptAutogolpe`, and upgraded `advanceMonth`, `voteLaborLaw`, and `hydrateGameState`.
- Consumed by Task 4.

- [ ] **Step 1: Write failing migration and terminal-state tests**

```js
test('migrates a version 1 save with negative cash intact', () => {
  const legacy = { ...createGameState('bra'), version: 1, economy: { ...createGameState('bra').economy, cash: -500 } };
  assert.equal(hydrateGameState(JSON.stringify(legacy)).economy.cash, -500);
});

test('blocks progression after a terminal regime outcome', () => {
  const state = { ...createGameState('bra'), regime: { type: 'democracy', gameOver: true, outcome: 'golpe-militar' } };
  assert.deepEqual(advanceMonth(state).calendar, state.calendar);
});
```

- [ ] **Step 2: Run focused state tests and verify RED**

Run: `node --test tests/game-state.test.js`

Expected: FAIL because v1 is rejected and terminal states advance.

- [ ] **Step 3: Implement v2 creation and safe migration**

Preserve valid negative cash; validate every new object structure; fall back to defaults for malformed slices. Keep v1 country, calendar, budget, Congress, laws, history, and notice intact.

- [ ] **Step 4: Write failing command/integration tests**

```js
test('updates a spending slider through the state command', () => {
  assert.equal(setBudget(createGameState('bra'), 'defenseSpend', 0.07).budget.defenseSpend, 0.07);
});

test('approves labor law by decree in dictatorship', () => {
  const state = { ...createGameState('bra'), regime: { type: 'dictatorship', gameOver: false, outcome: null } };
  assert.equal(voteLaborLaw(state).laws.laborReform.approved, true);
});
```

- [ ] **Step 5: Implement commands and the seven-stage turn**

Use the spec order: fiscal/economy, military, nuclear effects, geopolitics, stability, calendar/history. Invalid commands preserve state and return an explanatory notice. A terminal state freezes the turn.

- [ ] **Step 6: Run state tests and suite**

Run: `node --test tests/game-state.test.js; npm test`

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/core/game-state.js tests/game-state.test.js
git commit -m "feat: integrate regime and geopolitical turns"
```

### Task 4: Dashboard Tabs, Sliders, and Responsive Panels

**Files:**
- Modify: `tests/dashboard.test.js`
- Modify: `src/ui/dashboard.js`
- Modify: `assets/styles.css`

**Interfaces:**
- Consumes: Task 1 projection/bounds and Task 3 state commands.
- Produces: dashboard panels for budget, diplomacy, armed forces, and dictatorship-aware Congress.

- [ ] **Step 1: Write failing dashboard helper tests**

```js
test('exports a slider renderer with configured limits', async () => {
  const { rangeControl } = await import('../src/ui/dashboard.js');
  assert.match(rangeControl('Defesa', 'defenseSpend', 0.06, 0, 0.15), /type="range"/);
});

test('formats a diplomatic relation with a sign', async () => {
  const { formatRelation } = await import('../src/ui/dashboard.js');
  assert.equal(formatRelation(25), '+25');
});
```

- [ ] **Step 2: Run dashboard tests and verify RED**

Run: `node --test tests/dashboard.test.js`

Expected: FAIL with missing named exports.

- [ ] **Step 3: Implement new views and reusable controls**

Replace tax steppers with range controls for all six values. Add `Diplomacia` and `Forcas Armadas` tabs. Buttons derive disabled status from state; the Congress view disables negotiation/votes in dictatorship; game over disables simulation commands.

- [ ] **Step 4: Write and run a failing pure range-dispatch test**

Export a pure event-to-command helper and test that a `change` payload with `data-budget` and numeric value selects `setBudget`. This covers pointer and keyboard range changes without adding a DOM test library.

- [ ] **Step 5: Implement event dispatch and responsive CSS**

Use the existing `change` listener, update the projection immediately, and persist every slider action. Add compact grid rules for slider rows, diplomatic contacts, risk metrics, and nuclear controls.

- [ ] **Step 6: Run UI tests, suite, and manual browser verification**

Run: `node --test tests/dashboard.test.js; npm test`

Expected: all tests PASS.

Then start a local static server and verify at 1440 px and 375 px: tabs render; all sliders update projection without a month advance; eligibility buttons react; dictatorship disables Congress; no overlap occurs.

- [ ] **Step 7: Commit**

```powershell
git add src/ui/dashboard.js assets/styles.css tests/dashboard.test.js
git commit -m "feat: add government strategy dashboard panels"
```

### Task 5: Documentation, Whole-Branch Review, and Publication Preparation

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: all completed domain and UI features.
- Produces: player-facing controls documentation and a reviewed branch prepared for integration.

- [ ] **Step 1: Update `README.md`**

Document fiscal sliders, diplomacy, military/nuclear projects, and institutional risks in player language. Do not create a documentation test framework where none exists.

- [ ] **Step 2: Run all verification commands**

Run: `npm test; git diff --check; git status --short`

Expected: all tests PASS, no whitespace errors, and only intended files changed.

- [ ] **Step 3: Commit documentation**

```powershell
git add README.md
git commit -m "docs: describe government strategy systems"
```

- [ ] **Step 4: Run independent whole-branch review**

Build a review package from the merge base, dispatch a fresh reviewer, fix Critical or Important findings in one TDD-backed pass, and record Minor findings as deferred.

- [ ] **Step 5: Prepare for integration and publication**

Run the final suite after review fixes. Present the branch summary and request confirmation before merging or pushing a shared `main` branch/GitHub Pages deployment.

## Self-Review

1. **Spec coverage:** Task 1 covers fiscal controls; Task 2 covers diplomacy, war, military, nuclear, sanctions, and stability rules; Task 3 covers regime effects, save migration, decree approval, and turn ordering; Task 4 covers requested tabs and controls; Task 5 covers documentation, review, and publishing.
2. **Step scan:** Every code task begins with a specific failing test, records an expected failure, implements named interfaces, runs focused and full tests, then commits.
3. **Type consistency:** Task 1 exposes budget primitives to Tasks 3/4; Task 2 returns serializable objects to Task 3; Task 3 owns UI-facing state commands for Task 4.
4. **Review focus:** v1 negative-cash migration and terminal freeze are Task 3; failed diplomacy and nuclear idempotency are Task 2; keyboard range dispatch is Task 4.
5. **Proportion:** The plan provides exact files, APIs, thresholds, tests, commands, and commits without reproducing production code.

