# Guerra, Ligas e Traits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar tratados de paz funcionais, defesa coletiva por liga, traits globais e um catalogo de ao menos 15 leis que afetam o turno mensal.

**Architecture:** `geopolitics.js` resolve combates e descreve resultados pendentes; `game-state.js` aplica as decisoes de tratado e expoe comandos imutaveis para a UI. Traits ficam no perfil de pais e produzem modificadores puros para economia, tecnologia e militar. O dashboard chama `commit` para toda acao mutante, persistindo e renderizando o resultado.

**Tech Stack:** HTML, CSS, Vanilla JavaScript ES Modules, Node built-in test runner, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-10-11-war-leagues-traits-design.md`

## Global Constraints

- Sem dependencias externas ou backend.
- Estado e comandos permanecem imutaveis e centralizados em `src/core/game-state.js`.
- O seed contem 200 paises e todos recebem exatamente um `trait` deterministico.
- Toda acao de UI que muda o jogo usa `commit(...)` para salvar e renderizar imediatamente.
- Saves das versoes 1 a 6 continuam hidrataveis.

## Review Focus

- Alvo ja destruido ou sem tratado pendente nao pode ser anexado, saqueado ou renderizado como contato ativo.
- Um ataque que zera o poder inimigo deve criar apenas um tratado, sem duplicar recompensas ao avancar outro mes.
- Contatos de saves antigos recebem `cash`, trait e demais defaults sem apagar relacoes ou guerras existentes.
- Um membro de liga atacado inclui os demais defensores uma unica vez no calculo de poder.
- Traits e leis com campos novos nao podem produzir `NaN` em caixa, PIB, pesquisa, inflacao ou efetivo militar.

---

### Task 1: Perfis mundiais e modificadores de trait

**Files:**
- Modify: `src/data/countries.js`
- Create: `src/core/traits.js`
- Modify: `src/core/economy.js`
- Modify: `src/core/technology.js`
- Modify: `src/core/military.js`
- Test: `tests/countries.test.js`, `tests/traits.test.js`

**Interfaces:**
- Produces: `getTraitModifiers(country, economy)` and `getRecruitmentCostMultiplier(trait)`.
- Produces: todo `COUNTRIES` com `trait` e `createCountryProfile(country).trait`.

- [ ] **Step 1: Write failing trait tests**

```js
assert.equal(COUNTRIES.every((country) => typeof country.trait === 'string'), true);
assert.equal(getRecruitmentCostMultiplier('military_tradition'), 0.5);
assert.ok(getTraitModifiers({ trait: 'financial_hub' }, { cash: 100 }).cashInterest > 0);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/countries.test.js tests/traits.test.js`
Expected: FAIL because traits helpers and country traits do not exist.

- [ ] **Step 3: Implement deterministic trait assignment and pure modifiers**

Add `trait` to every seed item through one deterministic assignment function, with explicit overrides from the spec. Apply oil, agriculture, financial, technology and recruitment modifiers in their owning monthly modules.

- [ ] **Step 4: Run trait tests to verify they pass**

Run: `node --test tests/countries.test.js tests/traits.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/countries.js src/core/traits.js src/core/economy.js src/core/technology.js src/core/military.js tests/countries.test.js tests/traits.test.js
git commit -m "feat: add global country traits"
```

### Task 2: Guerra, tratado de paz, anexacao e saque

**Files:**
- Modify: `src/core/geopolitics.js`
- Modify: `src/core/game-state.js`
- Test: `tests/geopolitics.test.js`, `tests/game-state.test.js`

**Interfaces:**
- Consumes: contato com `cash`, `gdp`, `population`, `area_km2` e `destruido`.
- Produces: `resolvePeaceTreaty(state, targetId, choice)` where choice is `'annex' | 'loot'`.
- Produces: `state.geopolitics.peaceTreaty` as `null | { targetId, status: 'pending' }`.

- [ ] **Step 1: Write failing peace resolution tests**

```js
assert.equal(result.geopolitics.contacts.find((item) => item.id === 'arg').atWar, false);
assert.deepEqual(result.geopolitics.peaceTreaty, { targetId: 'arg', status: 'pending' });
assert.equal(annexed.geopolitics.contacts.find((item) => item.id === 'arg').destruido, true);
assert.equal(looted.economy.cash, state.economy.cash + (target.cash * 0.8));
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/geopolitics.test.js tests/game-state.test.js`
Expected: FAIL because a defeated target still remains at war and no treaty choice exists.

- [ ] **Step 3: Implement treaty state and outcome commands**

Make `advanceGeopolitics` create one pending treaty when enemy power reaches zero. Make annexation transfer current target population, area and GDP, set `destruido: true`, clear the treaty and prohibit repeat rewards. Make loot transfer exactly 80% of target cash, set relation -100 and clear the treaty.

- [ ] **Step 4: Add migration coverage for legacy contacts**

Hydration must enrich old contacts with fiscal and treaty defaults while retaining saved relation and war fields.

- [ ] **Step 5: Run focused tests to verify they pass**

Run: `node --test tests/geopolitics.test.js tests/game-state.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/geopolitics.js src/core/game-state.js tests/geopolitics.test.js tests/game-state.test.js
git commit -m "feat: resolve wars through peace treaties"
```

### Task 3: Liga militar e defesa coletiva

**Files:**
- Modify: `src/core/geopolitics.js`
- Modify: `src/core/game-state.js`
- Test: `tests/geopolitics.test.js`, `tests/game-state.test.js`

**Interfaces:**
- Produces: `createLeague(state, name)` and `inviteToLeague(state, contactId)`.
- Produces: `state.geopolitics.league` as `null | { name, leaderId, memberIds }`.

- [ ] **Step 1: Write failing league tests**

```js
assert.equal(createLeague(state, 'Liga Atlantica').geopolitics.league.leaderId, state.country.id);
assert.equal(inviteToLeague(eligible, 'arg').geopolitics.league.memberIds.includes('arg'), true);
assert.ok(defended.events.some((event) => event.includes('defesa coletiva')));
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/geopolitics.test.js tests/game-state.test.js`
Expected: FAIL because league commands do not exist.

- [ ] **Step 3: Implement creation, invitation and collective defense**

Creation costs R$ 25 bi and requires ONU >= 40. Invitations require relation > 80 and a compatible ideology proxy. When a member is attacked, add each active member's military power once to the defender score and mark defensive participants at war.

- [ ] **Step 4: Run league tests to verify they pass**

Run: `node --test tests/geopolitics.test.js tests/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/geopolitics.js src/core/game-state.js tests/geopolitics.test.js tests/game-state.test.js
git commit -m "feat: add collective defense league"
```

### Task 4: Catalogo de leis e efeitos mensais

**Files:**
- Modify: `src/core/laws.js`
- Modify: `src/core/game-state.js`
- Test: `tests/congress.test.js`, `tests/game-state.test.js`

**Interfaces:**
- Produces: pelo menos 15 entradas de `LAWS`, cada uma com `category`, `stateKey`, `affinity` e `monthlyEffects`.
- Consumes: agregacao existente de `monthlyEffects` em `advanceMonth`.

- [ ] **Step 1: Write failing law catalogue tests**

```js
assert.ok(LAWS.length >= 15);
assert.deepEqual(new Set(LAWS.map((law) => law.category)), new Set(['Economia', 'Sociedade', 'Seguranca', 'Ambiente']));
assert.ok(LAWS.some((law) => law.id === 'oil-nationalization'));
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/congress.test.js tests/game-state.test.js`
Expected: FAIL because the catalog has fewer than 15 laws and no categories.

- [ ] **Step 3: Implement categorized laws and their effects**

Add economy, society, security and environment laws, including nationalizacao do petroleo, censura da imprensa, servico militar obrigatorio and imposto sobre grandes fortunas. Extend `advanceMonth` only for documented new effect keys, preserving bounded values.

- [ ] **Step 4: Run law tests to verify they pass**

Run: `node --test tests/congress.test.js tests/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/laws.js src/core/game-state.js tests/congress.test.js tests/game-state.test.js
git commit -m "feat: expand public policy catalogue"
```

### Task 5: Tratado, liga e traits na interface

**Files:**
- Modify: `src/ui/dashboard.js`
- Modify: `assets/styles.css`
- Test: `tests/dashboard.test.js`

**Interfaces:**
- Consumes: `peaceTreaty`, `league`, `trait`, `resolvePeaceTreaty`, `createLeague`, `inviteToLeague`.
- Produces: diplomacia que nao renderiza contatos `destruido` e usa `commit` para toda decisao mutante.

- [ ] **Step 1: Write failing dashboard rendering tests**

```js
assert.match(diplomacyView(withTreaty), /Tratado de Paz/);
assert.doesNotMatch(diplomacyView(withDestroyedTarget), /Argentina/);
assert.match(diplomacyView(withLeague), /Criar Nova Liga Global|Liga Atlantica/);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/dashboard.test.js`
Expected: FAIL because the view helpers do not render the new states.

- [ ] **Step 3: Implement treaty and league controls**

Render a focused treaty panel with Anexar and Saquear Tesouro. Filter destroyed contacts before mapping rows. Render league creation/invitation actions and country trait in the selected-country surface. Route all buttons through `commit`.

- [ ] **Step 4: Run dashboard and full suite**

Run: `npm test`
Expected: PASS with all existing and new tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/dashboard.js assets/styles.css tests/dashboard.test.js
git commit -m "feat: render peace treaties and military league"
```
