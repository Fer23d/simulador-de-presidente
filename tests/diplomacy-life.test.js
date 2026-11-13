import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceMonth, answerInspection, answerSummit, createGameState, hydrateGameState, iniciarPlanoNuclear } from '../src/core/game-state.js';
import { SUMMITS, createDiplomacyLife, normalizeDiplomacyLife, processDiplomacyLife, respondToInspection, respondToSummit } from '../src/core/diplomacy_life.js';
import { diplomacyView, nuclearPlanPanel } from '../src/ui/dashboard.js';

const base = () => createGameState('bra');
const withNuclear = (state, nuclear) => ({ ...state, military: { ...state.military, nuclear: { ...state.military.nuclear, planStarted: true, ...nuclear } } });
const withLife = (state, life, month = 20) => ({ ...state, monthCounter: month, diplomacyLife: { ...createDiplomacyLife(), ...life } });
const avgRelation = (state) => state.geopolitics.contacts.reduce((sum, contact) => sum + contact.relation, 0) / state.geopolitics.contacts.length;

test('estado novo e saves antigos ganham diplomacyLife com padroes seguros', () => {
  assert.deepEqual(base().diplomacyLife, createDiplomacyLife());
  const legacy = JSON.parse(JSON.stringify(base()));
  delete legacy.diplomacyLife;
  assert.deepEqual(hydrateGameState(JSON.stringify(legacy)).diplomacyLife, createDiplomacyLife());
  const dirty = normalizeDiplomacyLife({ inspection: { deadline: 'x' }, summit: { id: 'inexistente', deadline: 3 }, summitBonus: { kind: 'ouro', until: 2 }, summitsHeld: -4 });
  assert.equal(dirty.inspection, null);
  assert.equal(dirty.summit, null);
  assert.equal(dirty.summitBonus, null);
  assert.equal(dirty.summitsHeld, 0);
});

test('a AIEA so aparece com o plano andando e a bomba ainda nao construida', () => {
  const idle = withLife(base(), {}, 30);
  for (let month = 30; month < 80; month += 1) assert.equal(processDiplomacyLife({ ...idle, monthCounter: month }).diplomacyLife.inspection, null);
  const bomb = withNuclear(withLife(base(), {}, 30), { civilProgress: 50, militaryProgress: 80, bombBuilt: true });
  for (let month = 30; month < 80; month += 1) assert.equal(processDiplomacyLife({ ...bomb, monthCounter: month }).diplomacyLife.inspection, null);
  const running = withNuclear(withLife(base(), {}, 30), { civilProgress: 40, militaryProgress: 30 });
  const seen = Array.from({ length: 60 }, (_, index) => processDiplomacyLife({ ...running, monthCounter: 30 + index }).diplomacyLife.inspection).filter(Boolean);
  assert.ok(seen.length > 0, 'em 60 meses algum pedido aparece');
  assert.ok(seen.every((item) => item.military === true));
});

test('aceitar a inspecao melhora a imagem e segura a frente militar', () => {
  const state = withNuclear(withLife(base(), { inspection: { deadline: 23, military: true } }), { civilProgress: 40, militaryProgress: 50 });
  const done = respondToInspection(state, true);
  assert.equal(done.diplomacyLife.inspection, null);
  assert.equal(done.diplomacyLife.inspectionsAccepted, 1);
  assert.equal(done.military.nuclear.militaryProgress, 30);
  assert.equal(done.military.nuclear.civilProgress, 44);
  assert.ok(avgRelation(done) > avgRelation(state));
  assert.ok(done.geopolitics.onuScore >= state.geopolitics.onuScore);
});

test('recusar custa imagem e a segunda recusa seguida traz sancoes; expirar vale como recusa', () => {
  const state = withNuclear(withLife(base(), { inspection: { deadline: 23, military: false } }), { civilProgress: 40 });
  const first = respondToInspection(state, false);
  assert.equal(first.diplomacyLife.inspectionRefusals, 1);
  assert.ok(first.geopolitics.onuScore <= state.geopolitics.onuScore);
  assert.ok(avgRelation(first) < avgRelation(state));
  assert.equal(first.geopolitics.sanctionSeverity, state.geopolitics.sanctionSeverity);
  const second = respondToInspection({ ...first, diplomacyLife: { ...first.diplomacyLife, inspection: { deadline: 30, military: false } } }, false);
  assert.ok(second.geopolitics.sanctionSeverity > state.geopolitics.sanctionSeverity);
  const expired = processDiplomacyLife({ ...state, monthCounter: 23 });
  assert.equal(expired.diplomacyLife.inspection, null);
  assert.equal(expired.diplomacyLife.inspectionRefusals, 1);
});

test('a primeira cupula chega depois do mes 9 e o convite vence em 2 meses', () => {
  assert.equal(processDiplomacyLife({ ...base(), monthCounter: 8 }).diplomacyLife.summit, null);
  const invited = processDiplomacyLife({ ...base(), monthCounter: 9 });
  assert.ok(invited.diplomacyLife.summit);
  assert.ok(SUMMITS[invited.diplomacyLife.summit.id]);
  assert.match(invited.notice, /Convite recebido/);
  const missed = processDiplomacyLife({ ...invited, monthCounter: invited.diplomacyLife.summit.deadline });
  assert.equal(missed.diplomacyLife.summit, null);
  assert.equal(missed.geopolitics.onuScore, invited.geopolitics.onuScore - 2);
  assert.equal(processDiplomacyLife({ ...missed, monthCounter: 12 }).diplomacyLife.summit, null, 'intervalo entre cupulas');
});

test('na cupula, postura moderada gera acordo temporario e postura dura cobra imagem na hora', () => {
  const state = withLife(base(), { summit: { id: 'g20', deadline: 22 } });
  const cooperate = respondToSummit(state, 'cooperate');
  assert.equal(cooperate.diplomacyLife.summit, null);
  assert.equal(cooperate.diplomacyLife.summitBonus.kind, 'goodwill');
  assert.equal(cooperate.diplomacyLife.summitsHeld, 1);
  const before = avgRelation(cooperate);
  const later = processDiplomacyLife({ ...cooperate, monthCounter: 21 });
  assert.ok(avgRelation(later) > before, 'o acordo rende relacao todo mes');
  const ended = processDiplomacyLife({ ...later, monthCounter: cooperate.diplomacyLife.summitBonus.until });
  assert.equal(ended.diplomacyLife.summitBonus, null);
  const hard = respondToSummit(state, 'protect');
  assert.equal(hard.diplomacyLife.summitBonus, null);
  assert.ok(hard.geopolitics.onuScore < state.geopolitics.onuScore);
});

test('cupula com custo cobra caixa e quem tem arsenal nao e convidado', () => {
  const cop = withLife(base(), { summit: { id: 'cop', deadline: 22 } });
  const green = respondToSummit(cop, 'green');
  assert.ok(green.economy.cash < cop.economy.cash);
  const bomb = withNuclear(withLife(base(), {}, 40), { bombBuilt: true });
  const skipped = processDiplomacyLife(bomb);
  assert.equal(skipped.diplomacyLife.summit, null);
  assert.match(skipped.notice, /não foi convidado/);
});

test('acoes do jogador funcionam e a partida encerrada bloqueia', () => {
  const state = withLife(base(), { summit: { id: 'regional', deadline: 22 } });
  assert.equal(answerSummit(state, 'join').diplomacyLife.summit, null);
  const over = answerSummit({ ...state, regime: { ...state.regime, gameOver: true } }, 'join');
  assert.match(over.notice, /encerrada/);
  assert.match(answerInspection(base(), true).notice, /Nenhuma inspeção/);
});

test('a aba Diplomacia mostra o convite e o card da AIEA aparece no Plano Nuclear', () => {
  const state = withNuclear(withLife(base(), { summit: { id: 'cop', deadline: 22 }, inspection: { deadline: 23, military: true } }), { civilProgress: 30, militaryProgress: 10 });
  const view = diplomacyView(state);
  assert.match(view, /Conferência do Clima/);
  assert.match(view, /data-action="summit" data-option="green"/);
  assert.match(view, /data-action="inspection" data-accept="yes"/);
  assert.match(nuclearPlanPanel(state), /Inspeção da AIEA/);
  assert.doesNotMatch(diplomacyView(base()), /data-action="summit"/);
});

test('avancar meses sem erro dispara cupula e mantem o estado valido', () => {
  let state = base();
  for (let index = 0; index < 14; index += 1) {
    state = advanceMonth({ ...state, pendingEvent: null, pendingBriefing: null });
    if (state.regime.gameOver) break;
  }
  assert.ok(state.diplomacyLife.summitsHeld >= 0);
  assert.ok(state.diplomacyLife.summit || state.diplomacyLife.lastSummitMonth >= 0);
});

test('iniciar o plano nuclear nao altera a agenda diplomatica', () => {
  const started = iniciarPlanoNuclear({ ...base(), technology: { ...base().technology, points: 900 } });
  assert.deepEqual(started.diplomacyLife, createDiplomacyLife());
});
