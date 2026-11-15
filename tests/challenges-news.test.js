import test from 'node:test';
import assert from 'node:assert/strict';
import { aceitarDesafio, abandonarDesafio, advanceMonth, createGameState, doarTerritorio } from '../src/core/game-state.js';
import { CHALLENGES, MAX_ACTIVE_CHALLENGES, getChallengeValue, normalizeChallenges, processChallenges } from '../src/core/challenges.js';
import { normalizeWorldNews, pushWorldNews, recordWorldNews } from '../src/core/world_news.js';

const patch = (s, id, p) => ({ ...s, geopolitics: { ...s.geopolitics, contacts: s.geopolitics.contacts.map((c) => (c.id === id ? { ...c, ...p } : c)) } });
const base = () => ({ ...createGameState('bra', { name: 'P', language: 'pt-BR' }), monthCounter: 10, pendingBriefing: null, pendingEvent: null });

test('aceitar: ate 3 ao mesmo tempo, desistir libera, nao repete concluido', () => {
  let s = base();
  for (const id of ['peace', 'pacts', 'contracts']) s = aceitarDesafio(s, id);
  assert.equal(Object.keys(s.challenges.active).length, MAX_ACTIVE_CHALLENGES);
  assert.equal(aceitarDesafio(s, 'allies').challenges.active.allies, undefined);
  s = abandonarDesafio(s, 'peace');
  assert.equal(aceitarDesafio(s, 'allies').challenges.active.allies !== undefined, true);
});

test('paz duradoura: guerra zera a contagem e 24 meses concluem com recompensa e noticia', () => {
  let s = aceitarDesafio(base(), 'peace');
  s = { ...s, monthCounter: 20 };
  assert.equal(getChallengeValue(s, 'peace'), 10);
  const warred = { ...s, reputation: { ...s.reputation, stats: { ...s.reputation.stats, warsDeclared: 1 } } };
  assert.equal(getChallengeValue(processChallenges(warred), 'peace'), 0);
  const cash = s.economy.cash;
  const done = processChallenges({ ...s, monthCounter: 10 + CHALLENGES.peace.goal });
  assert.ok(done.challenges.completed.peace);
  assert.equal(done.challenges.active.peace, undefined);
  assert.ok(done.economy.cash > cash);
  assert.ok(done.worldNews[0].text.includes('Paz duradoura'));
});

test('desafios por contagem: aliados e fantoches simultaneos', () => {
  let s = aceitarDesafio(base(), 'allies');
  for (const id of ['arg', 'chl', 'ury', 'per', 'col']) s = patch(s, id, { alliance: true });
  assert.equal(getChallengeValue(s, 'allies'), 5);
  assert.ok(processChallenges(s).challenges.completed.allies);
});

test('noticias do mundo: anexacao de rival e coalizao aparecem; save antigo e dados sujos carregam', () => {
  const prev = { ...base(), monthCounter: 5 };
  const next = { ...prev, monthCounter: 6, worldOrder: { ...prev.worldOrder, annexations: [{ by: 'arg', victim: 'ury', month: 6 }], coalitions: [{ id: 'b1', name: 'Pacto X', leader: 'arg', members: ['arg', 'chl', 'per'], player: false }], awake: true } };
  const out = recordWorldNews(prev, next);
  const texts = out.worldNews.map((item) => item.text).join(' | ');
  assert.ok(texts.includes('anexou'));
  assert.ok(texts.includes('Pacto X'));
  assert.ok(texts.includes('acordaram'));
  assert.equal(recordWorldNews(prev, { ...prev }).worldNews.length, 0, 'mesmo mes: nada novo');
  assert.deepEqual(normalizeWorldNews(undefined), []);
  assert.equal(normalizeWorldNews([{ text: 'ok', kind: 'zzz' }, { nada: 1 }])[0].kind, 'world');
  assert.equal(normalizeChallenges({ active: { fake: {} }, completed: { peace: { month: 3 } } }).active.fake, undefined);
  assert.equal(pushWorldNews(base(), 'x').worldNews.length, 1);
});

test('avancar o mes e doar territorio registram noticias sem quebrar', () => {
  let s = patch(patch(base(), 'ury', { anexado: true, annexed: true, destruido: true, militaryPower: 0 }), 'arg', { alliance: true, relation: 60 });
  s = { ...s, geopolitics: { ...s.geopolitics, annexedCountryIds: ['ury'] } };
  s = doarTerritorio(s, 'ury', 'arg');
  assert.ok(s.worldNews[0].text.includes('doou'));
  const m = advanceMonth(s);
  assert.ok(m.monthCounter > s.monthCounter);
  assert.ok(Array.isArray(m.worldNews));
});
