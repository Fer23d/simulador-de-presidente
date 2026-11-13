import assert from 'node:assert/strict';
import test from 'node:test';
import { TUTORIAL_STEPS, TUTORIAL_TIPS, completeTutorialStep, createTutorial, getContextTip, getTutorialStep, markTipSeen, syncTutorial } from '../src/core/tutorial.js';
import { createGameState } from '../src/core/game-state.js';
import { tutorialCoachView } from '../src/ui/dashboard.js';

const presidencySteps = TUTORIAL_STEPS.filter((step) => step.phase === 'presidency');
const game = (patch = {}) => ({ ...createGameState('bra'), ...patch });
const finishAll = (tutorial) => presidencySteps.reduce((current, step) => completeTutorialStep(current, step.id), tutorial);

// Abas da barra lateral, na ordem em que aparecem.
const SIDEBAR_TABS = ['overview', 'budget', 'indicators', 'diplomacy', 'military', 'cabinet', 'technology', 'projects', 'congress', 'history', 'countries', 'profile'];

test('o guia do Presidente tem 17 passos, em ordem, e cada um aponta uma aba', () => {
  assert.equal(presidencySteps.length, 17);
  assert.equal(presidencySteps[0].id, 'presidency');
  assert.equal(new Set(presidencySteps.map((step) => step.id)).size, presidencySteps.length, 'ids unicos');
  assert.ok(presidencySteps.slice(1).every((step) => step.tab));
  assert.ok(presidencySteps.every((step) => step.title && step.text.length > 60));
});

test('o guia percorre as 12 abas da barra lateral, na ordem em que aparecem', () => {
  const visited = [];
  for (const step of presidencySteps) if (step.tab && visited[visited.length - 1] !== step.tab) visited.push(step.tab);
  assert.deepEqual(visited.slice(0, SIDEBAR_TABS.length), SIDEBAR_TABS);
  for (const tab of SIDEBAR_TABS) assert.ok(presidencySteps.some((step) => step.tab === tab), `falta explicar a aba ${tab}`);
});

test('o guia fala dos sistemas novos: nuclear, cupulas, guerra comercial, territorios e titulos', () => {
  const text = presidencySteps.map((step) => step.text).join(' ');
  for (const word of ['Plano Nuclear', 'cúpulas', 'Guerra comercial', 'anexados', 'Título e organização', 'Tropas no exterior', 'Corrida nuclear', 'AIEA']) assert.ok(text.includes(word), `o guia deveria citar: ${word}`);
});

test('os passos andam conforme o jogador confirma e avanca o mes', () => {
  let tutorial = createTutorial();
  const state = game();
  const seen = [];
  for (let guard = 0; guard < 12; guard++) {
    const step = getTutorialStep(tutorial, state);
    if (!step) break;
    seen.push(step.id);
    if (step.id === 'guide_advance') { assert.ok(!step.ack, 'este passo espera a acao'); break; }
    tutorial = completeTutorialStep(tutorial, step.id);
  }
  assert.deepEqual(seen, ['presidency', 'guide_overview', 'guide_advance']);
  const after = syncTutorial(tutorial, game({ monthCounter: 1 }));
  assert.ok(after.done.includes('guide_advance'));
  assert.equal(getTutorialStep(after, game({ monthCounter: 1 })).id, 'guide_budget');
});

test('dicas do Presidente esperam o tutorial acabar e aparecem uma vez', () => {
  const broke = game({ monthCounter: 10, economy: { ...game().economy, cash: -5_000_000_000 } });
  assert.equal(getContextTip(createTutorial(), broke), null, 'ainda ha passos do tutorial');
  let tutorial = finishAll(createTutorial());
  assert.equal(getContextTip(tutorial, broke).id, 'p_debt');
  tutorial = markTipSeen(tutorial, 'p_debt');
  assert.equal(getContextTip(tutorial, broke), null);
});

test('cada situacao dispara a dica certa', () => {
  const tutorial = finishAll(createTutorial());
  const base = game({ monthCounter: 10 });
  const tip = (patch) => getContextTip(tutorial, { ...base, ...patch })?.id;
  assert.equal(tip({}), undefined, 'sem problema, sem dica');
  assert.equal(tip({ economy: { ...base.economy, inflation: 0.12 } }), 'p_inflation');
  assert.equal(tip({ regime: { ...base.regime, unrest: 45 } }), 'p_unrest');
  assert.equal(tip({ pendingBriefing: { id: 'x', title: 't', options: [] } }), 'p_briefing');
  assert.equal(tip({ congressLife: { demand: { blocId: 'left', cost: 1, deadline: 99 }, bill: null, lastBillMonth: 0 } }), 'p_congress');
  assert.equal(tip({ monthCounter: 46 }), 'p_election');
  assert.equal(tip({ yearReports: [{ year: 2026, grade: 'B', goals: [], figures: {} }] }), 'p_report');
  assert.equal(tip({ pendingHostileAlert: { type: 'war', targetId: 'arg', targetName: 'Argentina', dismissed: false } }), 'p_hostile');
});

test('o quadro do tutorial mostra o botao de ir para a aba', () => {
  const step = presidencySteps.find((item) => item.id === 'guide_budget');
  const html = tutorialCoachView({ ...step, number: 4, total: 17 });
  assert.match(html, /data-tutorial-tab="budget"/);
  assert.match(html, /data-tutorial-ack="guide_budget"/);
  assert.ok(html.includes("TUTORIAL 4/17"));
  const tip = TUTORIAL_TIPS.find((item) => item.id === 'p_debt');
  assert.match(tutorialCoachView(null, tip), /data-tutorial-tab="budget"/);
});

test('as dicas do Vault continuam funcionando e nao vazam para o Presidente', () => {
  const vaultOnly = TUTORIAL_TIPS.filter((item) => !item.id.startsWith('p_'));
  assert.ok(vaultOnly.length >= 8);
  const tutorial = finishAll(createTutorial());
  assert.equal(getContextTip(tutorial, game({ shelter_supplies: { food: 1 } })), null);
});
