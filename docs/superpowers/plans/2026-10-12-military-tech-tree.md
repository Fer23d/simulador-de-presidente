# Árvore de Tecnologia Militar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduzir pesquisa militar mensal, uma árvore de cinco tecnologias estratégicas e bloqueios reais de ações de fim de jogo.

**Architecture:** A árvore militar será definida em `tech_tree.js`, independente de `technology.js`, e manipulará apenas `military_research_points` e `unlocked_techs` no estado raiz. `game-state.js` orquestrará geração, comandos, hidratação e notícias; módulos de operações e a dashboard consultarão a mesma lista de desbloqueios antes de expor ou executar uma ação.

**Tech Stack:** Vanilla JavaScript ES Modules, Node.js `node:test`, HTML de template em `dashboard.js` e CSS CRT existente.

**Spec:** `docs/superpowers/specs/2026-10-12-military-tech-tree-design.md`

## Global Constraints

- Não usar frameworks, serviços externos ou backend.
- Manter o estado imutável: nenhuma função modifica o objeto de entrada.
- Pesquisa militar e civil são saldos independentes.
- Preservar a compatibilidade de saves anteriores com valores-padrão seguros.
- Usar os custos e dependências da especificação sem arredondamentos alternativos.
- Ocultar ações estratégicas sem a respectiva tecnologia e validar também no domínio.

## Review Focus

- Orçamento de Defesa igual a zero não pode gerar PP militares; teste na Tarefa 2.
- Um PIB pequeno com Defesa positiva deve receber o mínimo de um PP; teste na Tarefa 1.
- Dependência desbloqueada não pode ser descontada novamente; teste na Tarefa 1.
- Um save legado com valores inválidos para os novos campos deve hidratar sem exceção; teste na Tarefa 2.
- Chamadas diretas aos módulos de armas sem tecnologia militar devem falhar sem cobrar recursos; teste na Tarefa 3.

---

### Task 1: Catálogo e Regras Puras da Pesquisa Militar

**Files:**
- Create: `src/core/tech_tree.js`
- Create: `tests/tech-tree.test.js`

**Interfaces:**
- Produces: `MILITARY_TECHNOLOGIES`, `getMilitaryTechnology(techId)`, `calculateMilitaryResearchPoints(economy, budget)`, `pesquisarTecnologia(state, techId)`.
- Consumes: estado raiz com `economy.gdp`, `budget.defenseSpend`, `military_research_points`, `unlocked_techs` e `notice`.
- `pesquisarTecnologia` retorna um novo estado com PP descontados e ID adicionado, ou um novo estado com o saldo preservado e motivo em `notice`.

- [ ] **Step 1: Escrever os testes que falham para catálogo, fórmula e compra**

```js
assert.equal(calculateMilitaryResearchPoints({ gdp: 2_200_000_000_000 }, { defenseSpend: 0.06 }), 132);
assert.equal(calculateMilitaryResearchPoints({ gdp: 1 }, { defenseSpend: 0.01 }), 1);
assert.equal(calculateMilitaryResearchPoints({ gdp: 2_200_000_000_000 }, { defenseSpend: 0 }), 0);
assert.deepEqual(MILITARY_TECHNOLOGIES.map(({ id, cost }) => [id, cost]), [
  ['missiles', 1000], ['cyber', 2500], ['bio', 5000], ['nuke', 10000], ['dead_hand', 25000],
]);
```

Inclua casos para custo insuficiente, compra duplicada, `nuke` sem `missiles` e `dead_hand` sem `nuke`.

- [ ] **Step 2: Executar o teste para confirmar a falha**

Run: `node --test tests/tech-tree.test.js`
Expected: FAIL porque `tech_tree.js` ainda não existe.

- [ ] **Step 3: Implementar `src/core/tech_tree.js`**

Defina as cinco entradas imutáveis da especificação e valide dependências por `requires: []`. `calculateMilitaryResearchPoints` deve aplicar `Math.floor((gdp / 1_000_000_000) * defenseSpend)` e mínimo `1` somente se o gasto for positivo. `pesquisarTecnologia(state, techId)` deve deduzir o custo e manter imutabilidade profunda dos arrays modificados.

- [ ] **Step 4: Executar os testes unitários do módulo**

Run: `node --test tests/tech-tree.test.js`
Expected: PASS.

- [ ] **Step 5: Commitar o núcleo da árvore**

```powershell
git add src/core/tech_tree.js tests/tech-tree.test.js
git commit -m "feat: add military research technology tree"
```

### Task 2: Estado, Motor Mensal e Persistência

**Files:**
- Modify: `src/core/game-state.js: imports, STATE_VERSION, createGameState, advanceMonth, hydrateGameState`
- Modify: `tests/game-state.test.js`

**Interfaces:**
- Consumes: `calculateMilitaryResearchPoints(economy, budget)` e `pesquisarTecnologia(state, techId)` da Tarefa 1.
- Produces: `pesquisarTecnologiaMilitar(state, techId)` como comando público do estado.
- O estado inicial e hidratado terá `military_research_points: number` e `unlocked_techs: string[]`.

- [ ] **Step 1: Escrever testes que falham para estado e avanço mensal**

```js
const state = createGameState('bra');
assert.deepEqual(state.unlocked_techs, []);
assert.equal(state.military_research_points, 0);

const advanced = advanceMonth({
  ...state,
  economy: { ...state.economy, gdp: 2_200_000_000_000 },
  budget: { ...state.budget, defenseSpend: 0.06 },
});
assert.equal(advanced.military_research_points, 132);
assert.equal(advanced.technology.points, advanced.technology.generated);
```

Inclua hidratação de save versão 10 sem campos militares, valores negativos/IDs não textuais e o comando público de compra.

- [ ] **Step 2: Executar os testes para confirmar a falha**

Run: `node --test tests/game-state.test.js`
Expected: FAIL porque os campos e o comando ainda não existem.

- [ ] **Step 3: Integrar a pesquisa militar em `game-state.js`**

Suba `STATE_VERSION` para `11`, inicialize os dois campos, some os PP após o cálculo econômico de um mês válido e exponha `pesquisarTecnologiaMilitar`. Durante a hidratação, aceite versões 1 a 11, faça clamp de PP em zero e mantenha somente IDs textuais conhecidos no catálogo. Acrescente uma notícia no sucesso do comando sem duplicar avisos em falhas.

- [ ] **Step 4: Executar os testes de estado**

Run: `node --test tests/game-state.test.js tests/tech-tree.test.js`
Expected: PASS.

- [ ] **Step 5: Commitar integração e migração**

```powershell
git add src/core/game-state.js tests/game-state.test.js tests/tech-tree.test.js
git commit -m "feat: generate and persist military research"
```

### Task 3: Bloqueios de Domínio para Operações Estratégicas

**Files:**
- Modify: `src/core/cyber_warfare.js: lancarCiberataque`
- Modify: `src/core/black_ops.js: injetarVirusSintetico`
- Modify: `src/core/megaprojects.js: iniciarProjetoMaoMorta`
- Modify: `src/core/game-state.js: canAutorizarAniquilacaoNuclear e mensagens`
- Modify: `tests/cyber-warfare.test.js`
- Modify: `tests/black-ops.test.js`
- Modify: `tests/megaprojects.test.js`
- Modify: `tests/game-state.test.js`

**Interfaces:**
- Consumes: `state.unlocked_techs` criado na Tarefa 2.
- Produces: operações que recusam estados sem `cyber`, `bio`, `nuke` ou `dead_hand` sem modificar caixa, recursos ou alvo.

- [ ] **Step 1: Escrever testes que falham para cada bloqueio**

```js
assert.match(lancarCiberataque(createGameState('bra'), 'arg').notice, /Ciber-Guerra/i);
assert.match(injetarVirusSintetico(preparedWithoutBio, 'arg').notice, /Patog.nica/i);
assert.match(iniciarProjetoMaoMorta(preparedWithoutDeadHand).notice, /Mao Morta/i);
assert.equal(canAutorizarAniquilacaoNuclear(preparedWithoutNuke), false);
```

Para cada caso, compare os saldos e o contato alvo com o estado de entrada; acrescente o ID correto e confirme que a operação já existente volta a funcionar sem a tecnologia civil antiga.

- [ ] **Step 2: Executar os testes para confirmar a falha**

Run: `node --test tests/cyber-warfare.test.js tests/black-ops.test.js tests/megaprojects.test.js tests/game-state.test.js`
Expected: FAIL porque as ações ainda verificam tecnologias civis ou não verificam a árvore militar.

- [ ] **Step 3: Trocar os guardas de domínio pela árvore militar**

`lancarCiberataque` deve exigir `cyber`; `injetarVirusSintetico`, `bio`; `canAutorizarAniquilacaoNuclear`, `nuke` além do arsenal, urânio e guerra; e `iniciarProjetoMaoMorta`, `dead_hand` além de seu custo e recursos. Remova somente essas dependências civis como bloqueadores, sem alterar seus efeitos civis.

- [ ] **Step 4: Executar os testes dos bloqueios**

Run: `node --test tests/cyber-warfare.test.js tests/black-ops.test.js tests/megaprojects.test.js tests/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commitar os guardas estratégicos**

```powershell
git add src/core/cyber_warfare.js src/core/black_ops.js src/core/megaprojects.js src/core/game-state.js tests
git commit -m "feat: gate strategic weapons behind military research"
```

### Task 4: Painel CRT de Projetos Especiais e Controles da UI

**Files:**
- Modify: `src/ui/dashboard.js: imports, militaryView, diplomacyView, projectsView e delegação de clique`
- Modify: `assets/styles.css: seção de projetos especiais e estados de botão`
- Modify: `tests/dashboard.test.js`

**Interfaces:**
- Consumes: `MILITARY_TECHNOLOGIES` e `pesquisarTecnologiaMilitar(state, techId)`.
- Produces: seção `/// PROJETOS ESPECIAIS ///`, botão `data-action="military-research"` e ações estratégicas renderizadas somente para IDs desbloqueados.

- [ ] **Step 1: Escrever testes de renderização que falham**

```js
assert.match(militaryView(createGameState('bra')), /PROJETOS ESPECIAIS/);
assert.match(militaryView(createGameState('bra')), /PONTOS DE PESQUISA MILITAR DISPONIVEIS: 0/);
assert.doesNotMatch(diplomacyView(createGameState('bra'), 'argentina'), /Lancar Ciberataque|Lancar Virus Sintetico|CODIGOS NUCLEARES/);
```

Inclua estado com PP suficiente e `cyber`/`bio`/`nuke` desbloqueados para provar o botão verde, a troca de status e a presença seletiva das operações.

- [ ] **Step 2: Executar os testes para confirmar a falha**

Run: `node --test tests/dashboard.test.js`
Expected: FAIL porque a seção e os novos filtros ainda não existem.

- [ ] **Step 3: Renderizar e conectar a árvore militar**

Crie um helper local de renderização que use os dados do catálogo, liste custo e dependências e marque cada botão como concluído, indisponível ou financiável. No listener principal, encaminhe `military-research` para `pesquisarTecnologiaMilitar`. Oculte Ciberataque, Vírus e Códigos Nucleares até os respectivos IDs existirem em `unlocked_techs`; aplique o mesmo filtro ao projeto Mão Morta. Use classes CRT existentes ou regras pontuais sem introduzir arredondamento moderno.

- [ ] **Step 4: Executar testes de UI e regressão completa**

Run: `npm test`
Expected: PASS com todos os testes existentes e os novos.

- [ ] **Step 5: Revisar o diff e commit final da interface**

Run: `git diff --check`
Expected: saída vazia.

```powershell
git add src/ui/dashboard.js assets/styles.css tests/dashboard.test.js
git commit -m "feat: render military special projects"
```

## Verificação Final

- [ ] Executar `npm test` e registrar a contagem final.
- [ ] Executar `git diff --check` e `git status --short`.
- [ ] Revisar manualmente a seção Forças Armadas, a ocultação inicial das armas e sua liberação após a compra.
- [ ] Solicitar revisão de código do branch antes da publicação.
