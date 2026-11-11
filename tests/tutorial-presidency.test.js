import assert from 'node:assert/strict';
import test from 'node:test';
import { TUTORIAL_STEPS, TUTORIAL_TIPS, completeTutorialStep, createTutorial, getContextTip, getTutorialStep, markTipSeen, syncTutorial } from '../src/core/tutorial.js';
import { createGameState } from '../src/core/game-state.js';
import { tutorialCoachView } from '../src/ui/dashboard.js';

const presidencySteps = TUTORIAL_STEPS.filter((step) => step.phase === 'presidency');
const game = (patch = {}) => ({ ...createGameState('bra'), ...patch });
const finishAll = (tutorial) => presidencySteps.reduce((current, step) => completeTutorialStep(current, step.id), tutorial);

test('o tutorial do Presidente tem oito passos, em ordem, e cada um aponta uma aba', () => {
  assert.equal(presidencySteps.length, 8);
  assert.deepEqual(presidencySteps.map((step) => step.id), ['presidency', 'pres_budget', 'pres_interest', 'pres_advance', 'pres_overview', 'pres_indicators', 'pres_congress', 'pres_map']);
  assert.ok(presidencySteps.slice(1).every((step) => step.tab));
});

test('os passos andam conforme o jogador confirma e avanca o mes', () => {
  let tutorial = createTutorial();
  const state = game();
  const seen = [];
  for (let guard = 0; guard < 12; guard++) {
    const step = getTutorialStep(tutorial, state);
    if (!step) break;
    seen.push(step.id);
    if (step.id === 'pres_advance') { assert.ok(!step.ack, 'este passo espera a acao'); break; }
    tutorial = completeTutorialStep(tutorial, step.id);
  }
  assert.deepEqual(seen, ['presidency', 'pres_budget', 'pres_interest', 'pres_advance']);
  const after = syncTutorial(tutorial, game({ monthCounter: 1 }));
  assert.ok(after.done.includes('pres_advance'));
  assert.equal(getTutorialStep(after, game({ monthCounter: 1 })).id, 'pres_overview');
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
  const step = presidencySteps.find((item) => item.id === 'pres_budget');
  const html = tutorialCoachView({ ...step, number: 2, total: 8 });
  assert.match(html, /data-tutorial-tab="budget"/);
  assert.match(html, /data-tutorial-ack="pres_budget"/);
  const tip = TUTORIAL_TIPS.find((item) => item.id === 'p_debt');
  assert.match(tutorialCoachView(null, tip), /data-tutorial-tab="budget"/);
});

test('as dicas do Vault continuam funcionando e nao vazam para o Presidente', () => {
  const vaultOnly = TUTORIAL_TIPS.filter((item) => !item.id.startsWith('p_'));
  assert.ok(vaultOnly.length >= 8);
  const tutorial = finishAll(createTutorial());
  assert.equal(getContextTip(tutorial, game({ shelter_supplies: { food: 1 } })), null);
});
