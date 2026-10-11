# Simulador de Presidente MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir e publicar um MVP jogavel de estrategia politica em HTML, CSS e JavaScript puro.

**Architecture:** Regras de dominio puras ficam em modulos ES independentes do navegador. `game-state` coordena economia, Congresso e leis; a camada de UI renderiza o estado e despacha intencoes. O seed local fornece 200 paises e a partida persiste no `localStorage`.

**Tech Stack:** HTML5, CSS3, JavaScript ES modules, Node.js `node:test`, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-10-11-simulador-presidente-design.md`

## Global Constraints

- Usar somente HTML, CSS e JavaScript ES modules; sem frameworks e sem backend.
- Publicar a raiz do repositorio no GitHub Pages a partir de `main`.
- Dados de 200 paises devem possuir IDs unicos e area total valida em km2.
- Regras de simulacao nao podem depender do DOM, `window` ou `localStorage`.
- Interface em portugues, dashboard dark mode e responsiva para desktop e mobile.
- Persistir somente estado serializavel e recuperar uma partida valida quando possivel.

## Review Focus

- Seed de paises duplicado, incompleto ou com area invalida deve falhar ao iniciar os testes.
- Impostos fora do intervalo permitido devem ser limitados, inclusive quando um estado salvo for adulterado.
- Caixa insuficiente nao pode permitir negociacao parlamentar ou ficar negativo por essa acao.
- `localStorage` indisponivel, corrompido ou com schema antigo deve iniciar uma nova partida sem quebrar a UI.
- Viewport mobile deve manter navegacao, indicadores e controles acionaveis sem transbordamento horizontal.

---

## File Structure

- `package.json`: scripts de teste e configuracao ES module.
- `index.html`: shell semantico do dashboard.
- `assets/styles.css`: design tokens, grid, responsividade e componentes.
- `src/data/countries.js`: 200 paises e funcoes de validacao/derivacao inicial.
- `src/core/economy.js`: configuracao de imposto, projecao orcamentaria e resolucao mensal.
- `src/core/congress.js`: composicao, apoio, negociacao e voto.
- `src/core/laws.js`: Lei Trabalhista e seus modificadores.
- `src/core/game-state.js`: criacao, hidratacao, alteracoes e avancos da partida.
- `src/ui/dashboard.js`: DOM, acessibilidade e persistencia protegida.
- `src/main.js`: bootstrap do aplicativo.
- `tests/*.test.js`: testes de regras puras e integracao de estado.

### Task 1: Seed de Paises e Fundacao de Testes

**Files:**
- Create: `package.json`
- Create: `src/data/countries.js`
- Create: `tests/countries.test.js`

**Interfaces:**
- Produces: `COUNTRIES`, `getCountryById(id)`, `createCountryProfile(country)` e `validateCountries(countries)`.
- Consumes: nenhum modulo anterior.

- [ ] **Step 1: Escrever testes que validem 200 IDs unicos, areas positivas e a busca do Brasil**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { COUNTRIES, getCountryById, validateCountries } from '../src/data/countries.js';

test('seed contem 200 paises unicos com area valida', () => {
  assert.equal(COUNTRIES.length, 200);
  assert.doesNotThrow(() => validateCountries(COUNTRIES));
});

test('localiza Brasil com area territorial esperada', () => {
  assert.equal(getCountryById('bra').area_km2, 8515770);
});
```

- [ ] **Step 2: Executar o teste para confirmar falha por modulo ausente**

Run: `npm test -- countries.test.js`
Expected: FAIL indicando que `countries.js` nao existe.

- [ ] **Step 3: Criar `COUNTRIES` com 200 registros explicitos e implementar as funcoes exportadas**

Usar codigos ISO alpha-3 em minusculas. `createCountryProfile(country)` deve derivar populacao, PIB, bioma e governo de forma deterministica a partir de faixas de area e um hash do ID, retornando sempre os campos do spec.

- [ ] **Step 4: Executar testes de dados**

Run: `npm test -- countries.test.js`
Expected: PASS com dois testes.

- [ ] **Step 5: Commit**

```bash
git add package.json src/data/countries.js tests/countries.test.js
git commit -m "feat: add country seed data"
```

### Task 2: Economia e Orcamento Mensal

**Files:**
- Create: `src/core/economy.js`
- Create: `tests/economy.test.js`

**Interfaces:**
- Consumes: perfil criado por `createCountryProfile(country)`.
- Produces: `DEFAULT_BUDGET`, `clampTaxRate(rate)`, `projectBudget(economy, budget)` e `advanceEconomy(economy, budget, lawEffects)`.

- [ ] **Step 1: Escrever testes para aumento de receita, limite de imposto e saldo no caixa**

```js
test('projecao arrecada mais com IR maior', () => {
  const low = projectBudget(economy, { ...DEFAULT_BUDGET, incomeTaxRate: 0.1 });
  const high = projectBudget(economy, { ...DEFAULT_BUDGET, incomeTaxRate: 0.2 });
  assert.ok(high.revenue > low.revenue);
});

test('avanco mensal acumula saldo no caixa', () => {
  const result = advanceEconomy(economy, DEFAULT_BUDGET, {});
  assert.equal(result.cash, economy.cash + result.monthlyBalance);
});
```

- [ ] **Step 2: Executar testes para confirmar falha por modulo ausente**

Run: `npm test -- economy.test.js`
Expected: FAIL indicando que `economy.js` nao existe.

- [ ] **Step 3: Implementar regras puras de economia**

`clampTaxRate(rate)` deve retornar valor entre `0` e `0.6`. `projectBudget` calcula receita de IR/IVA separadamente, gastos fixos e saldo. `advanceEconomy` atualiza PIB, inflacao, desemprego, popularidade e caixa mantendo inflacao entre `0` e `0.8`, desemprego entre `0.02` e `0.45`, e popularidade entre `0` e `100`.

- [ ] **Step 4: Executar suite de economia**

Run: `npm test -- economy.test.js`
Expected: PASS, incluindo limites de imposto e de indicadores.

- [ ] **Step 5: Commit**

```bash
git add src/core/economy.js tests/economy.test.js
git commit -m "feat: add monthly economic simulation"
```

### Task 3: Congresso e Lei Trabalhista

**Files:**
- Create: `src/core/laws.js`
- Create: `src/core/congress.js`
- Create: `tests/congress.test.js`

**Interfaces:**
- Consumes: `economy.cash`, `economy.popularity` e `LAW_LABOR_REFORM`.
- Produces: `LAW_LABOR_REFORM`, `createCongress(seed)`, `getVoteForecast(congress, popularity)`, `negotiateSupport(congress, economy, blocId)` e `voteOnLaw(congress, law, popularity)`.

- [ ] **Step 1: Escrever testes de maioria, derrota e caixa insuficiente**

```js
test('aprova lei quando votos favoraveis atingem maioria simples', () => {
  const result = voteOnLaw(majorityCongress, LAW_LABOR_REFORM, 60);
  assert.equal(result.approved, true);
});

test('nao negocia apoio acima do caixa disponivel', () => {
  const result = negotiateSupport(congress, { cash: 0, popularity: 50 }, 'center');
  assert.equal(result.ok, false);
});
```

- [ ] **Step 2: Executar testes para confirmar falha por modulos ausentes**

Run: `npm test -- congress.test.js`
Expected: FAIL indicando imports ausentes.

- [ ] **Step 3: Implementar lei e logica parlamentar**

`LAW_LABOR_REFORM` deve definir titulo, descricao, afinidade por bloco e efeitos mensais. Congresso possui blocos `left`, `center`, `right`, `nationalist`; assentos totalizam 300. Votacao requer `floor(totalSeats / 2) + 1`; negociacao custa caixa, eleva apoio apenas uma vez por bloco e recusa recursos insuficientes.

- [ ] **Step 4: Executar suite do Congresso**

Run: `npm test -- congress.test.js`
Expected: PASS, incluindo caso limiar de maioria.

- [ ] **Step 5: Commit**

```bash
git add src/core/laws.js src/core/congress.js tests/congress.test.js
git commit -m "feat: add congress and labor law vote"
```

### Task 4: Estado de Jogo e Persistencia Recuperavel

**Files:**
- Create: `src/core/game-state.js`
- Create: `tests/game-state.test.js`

**Interfaces:**
- Consumes: `getCountryById`, `createCountryProfile`, economia, Congresso e leis.
- Produces: `createGameState(countryId)`, `changeTax(state, taxKey, delta)`, `negotiate(state, blocId)`, `voteLaborLaw(state)`, `advanceMonth(state)` e `hydrateGameState(serialized)`.

- [ ] **Step 1: Escrever testes de criacao de partida, mudanca de imposto, voto e hidratacao invalida**

```js
test('cria partida selecionando Brasil', () => {
  assert.equal(createGameState('bra').country.id, 'bra');
});

test('estado serializado invalido retorna uma partida nova', () => {
  assert.equal(hydrateGameState('{invalido').country.id, 'bra');
});
```

- [ ] **Step 2: Executar testes para confirmar falha por modulo ausente**

Run: `npm test -- game-state.test.js`
Expected: FAIL indicando que `game-state.js` nao existe.

- [ ] **Step 3: Implementar maquina de estado imutavel e hidratacao**

Cada operacao retorna novo estado serializavel e uma entrada de historico. `advanceMonth(state)` deve chamar a economia, aplicar efeitos da Lei Trabalhista aprovada, incrementar mes/ano e reter no maximo 12 entradas de historico. `hydrateGameState` deve validar schema basico e retornar `createGameState('bra')` em qualquer erro ou estado fora de faixa.

- [ ] **Step 4: Executar testes de estado e suite completa**

Run: `npm test`
Expected: PASS em todos os testes de dados, economia, Congresso e estado.

- [ ] **Step 5: Commit**

```bash
git add src/core/game-state.js tests/game-state.test.js
git commit -m "feat: add game state orchestration"
```

### Task 5: Dashboard Interativo e Persistencia no Navegador

**Files:**
- Create: `index.html`
- Create: `assets/styles.css`
- Create: `src/ui/dashboard.js`
- Create: `src/main.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: estado e acoes exportados por `src/core/game-state.js`, `COUNTRIES`.
- Produces: `mountDashboard(root)` e aplicacao estatica pronta para navegador.

- [ ] **Step 1: Escrever teste leve de importacao do bootstrap e preparar fixture DOM sem dependencia externa**

```js
test('modulo de UI exporta ponto de montagem', async () => {
  const { mountDashboard } = await import('../src/ui/dashboard.js');
  assert.equal(typeof mountDashboard, 'function');
});
```

- [ ] **Step 2: Executar teste para confirmar falha por modulo ausente**

Run: `npm test -- dashboard.test.js`
Expected: FAIL indicando que `dashboard.js` nao existe.

- [ ] **Step 3: Criar shell HTML e estilos responsivos do dashboard**

Implementar cabecalho, seletor de pais, abas `Visao Geral`, `Orcamento`, `Congresso` e `Paises`, seis indicadores, controles iconicos mais/menos para IR/IVA, botoes de negociacao e votacao, log de eventos, `Avancar mes` e `Reiniciar partida`. Usar `aria-label`, foco visivel e `button` nativo para todas as acoes.

- [ ] **Step 4: Implementar renderizacao, listeners e persistencia protegida**

`mountDashboard(root)` deve iniciar de `localStorage`, renderizar o estado e salvar depois de cada acao. Envolver leitura/escrita em `try/catch`; em erro, continuar com estado em memoria e exibir aviso nao bloqueante.

- [ ] **Step 5: Executar testes e verificar a interface localmente**

Run: `npm test`
Expected: PASS em toda suite.

Run: `npx serve . -l 4173`
Expected: dashboard abre em `http://localhost:4173`, sem erros no console, responsivo em larguras de 375px e 1440px.

- [ ] **Step 6: Commit**

```bash
git add index.html assets/styles.css src/ui/dashboard.js src/main.js package.json tests/dashboard.test.js
git commit -m "feat: add interactive strategy dashboard"
```

### Task 6: README, Publicacao e Verificacao Final

**Files:**
- Create: `README.md`
- Modify: `.github/workflows/deploy-pages.yml` (se usar workflow de Pages)

**Interfaces:**
- Consumes: aplicativo estatico e script `npm test`.
- Produces: instrucoes de execucao e URL publica de GitHub Pages.

- [ ] **Step 1: Escrever README com jogo, comandos, limites do MVP e link de deploy**

- [ ] **Step 2: Executar verificacao completa antes do deploy**

Run: `npm test`
Expected: PASS sem falhas.

Run: validar manualmente selecao de pais, impostos, negociacao, votacao, avanco mensal e recarga.
Expected: estado recuperado apos recarga e indicadores atualizados em cada acao.

- [ ] **Step 3: Criar repositorio publico, configurar Pages e enviar `main`**

Run: `gh repo create simulador-de-presidente --public --source . --remote origin --push`
Expected: remoto `Fer23d/simulador-de-presidente` criado e branch publicada.

Configurar GitHub Pages para deploy da raiz de `main`, ou adicionar workflow oficial `actions/deploy-pages` se a configuracao por CLI for indisponivel.

- [ ] **Step 4: Verificar URL publicada e commit final**

Run: `gh repo view Fer23d/simulador-de-presidente --web`
Expected: repositorio abre publicamente; registrar URL de Pages apos status de deploy concluido.

- [ ] **Step 5: Commit**

```bash
git add README.md .github/workflows/deploy-pages.yml
git commit -m "docs: add deployment instructions"
```

## Plan Self-Review

Spec coverage: Tasks 1-4 implement dados e simulacao; Task 5 cobre experiencia, responsividade e armazenamento; Task 6 cobre documentacao e publicacao. Nenhum requisito do spec permanece sem uma tarefa.

Interface consistency: os nomes exportados por cada tarefa constam no bloco `Interfaces` da tarefa seguinte. A UI consome apenas `game-state`, preservando o isolamento entre DOM e regras de dominio.

Review focus coverage: seed e impostos sao exercitados nas Tasks 1 e 2; caixa insuficiente na Task 3; hidratacao invalida na Task 4; viewport mobile na verificacao manual da Task 5.

Proporcao: seis tarefas entregam incrementos verificaveis e mantem a interface de dominio pequena para um MVP sem dependencias externas.
