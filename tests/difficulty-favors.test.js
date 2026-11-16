import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceMonth, createGameState, doarTerritorio, updatePlayerProfile } from '../src/core/game-state.js';
import { DIFFICULTIES, getDifficulty, normalizeDifficulty } from '../src/core/difficulty.js';
import { getPactChance } from '../src/core/world_order.js';
import { getAttackChance } from '../src/core/territory_defense.js';
import { getReward } from '../src/core/war_contracts.js';
import { FIRST_FAVOR_DELAY, MAX_FAVORS_PER_DEBT, normalizeFavors, processFavors } from '../src/core/favors.js';
import { ACHIEVEMENTS, findNewAchievements } from '../src/core/achievements.js';

const patch = (s, id, p) => ({ ...s, geopolitics: { ...s.geopolitics, contacts: s.geopolitics.contacts.map((c) => (c.id === id ? { ...c, ...p } : c)) } });
const base = (difficulty) => ({ ...createGameState('bra', { name: 'P', language: 'pt-BR', difficulty }), monthCounter: 10, pendingBriefing: null, pendingEvent: null });

test('dificuldade: padrao normal, valores invalidos caem em normal e o perfil guarda a escolha', () => {
  assert.equal(normalizeDifficulty('xyz'), 'normal');
  assert.equal(getDifficulty(createGameState('bra', {})).id, 'normal');
  assert.equal(updatePlayerProfile(base(), { difficulty: 'hard' }).playerProfile.difficulty, 'hard');
  assert.equal(createGameState('arg', base('hard').playerProfile).playerProfile.difficulty, 'hard');
});

test('dificuldade muda pacto, ataque a territorio e recompensa de contrato', () => {
  const rich = (d) => patch(base(d), 'arg', { relation: 40, militaryPower: 80 });
  assert.ok(getPactChance(rich('easy'), 'arg') > getPactChance(rich('normal'), 'arg'));
  assert.ok(getPactChance(rich('hard'), 'arg') < getPactChance(rich('normal'), 'arg'));
  const target = { militaryPower: 50 };
  assert.ok(getReward(base('easy'), target) > getReward(base('normal'), target));
  assert.ok(getReward(base('hard'), target) < getReward(base('normal'), target));
  const hostile = (d) => patch(patch(patch(base(d), 'ury', { anexado: true, destruido: true }), 'chl', { relation: -80, militaryPower: 60 }), 'per', { relation: -80, militaryPower: 60 });
  assert.ok(getAttackChance(hostile('hard'), 'ury') >= getAttackChance(hostile('easy'), 'ury'));
  assert.equal(Object.keys(DIFFICULTIES).length, 3);
});

test('doar territorio gera divida e o aliado retribui ate 3 vezes', () => {
  let s = patch(patch(base(), 'ury', { anexado: true, annexed: true, destruido: true, militaryPower: 0 }), 'arg', { alliance: true, relation: 60, militaryPower: 50 });
  s = { ...s, geopolitics: { ...s.geopolitics, annexedCountryIds: ['ury'] } };
  s = doarTerritorio(s, 'ury', 'arg');
  assert.ok(s.favors.debts.arg);
  let granted = 0;
  for (let m = 0; m < 60 && s.favors.debts.arg; m += 1) {
    s = processFavors({ ...s, monthCounter: s.monthCounter + 1 });
    granted = s.favors.granted;
  }
  assert.equal(granted, MAX_FAVORS_PER_DEBT);
  assert.equal(s.favors.debts.arg, undefined);
  assert.ok(FIRST_FAVOR_DELAY > 0);
  assert.ok(s.worldNews.some((item) => item.text.includes('Argentina') || item.text.length > 10));
});

test('divida caduca se o aliado deixa de ser aliado; save antigo sem favors carrega', () => {
  let s = base();
  s = { ...s, favors: { debts: { arg: { next: 0, count: 0 } }, granted: 0 } };
  s = patch(s, 'arg', { alliance: false });
  assert.equal(processFavors(s).favors.debts.arg, undefined);
  assert.deepEqual(normalizeFavors(undefined), { debts: {}, granted: 0 });
  assert.ok(advanceMonth(base()).favors);
});

test('conquistas novas de desafios, missoes, favor e modo dificil', () => {
  const ids = ACHIEVEMENTS.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, 'ids unicos');
  for (const id of ['challenge_peace', 'challenges_all', 'mission_ussr', 'missions_all', 'favor_returned', 'hard_mode']) assert.ok(ids.includes(id), id);
  const s = { ...base(), challenges: { active: {}, completed: { peace: { month: 5 } } }, missions: { active: null, completed: { ussr: { months: 1 } }, pendingEpilogue: null }, favors: { debts: {}, granted: 1 } };
  const got = findNewAchievements(s, { unlocked: {} }).map((item) => item.id);
  assert.ok(got.includes('challenge_peace') && got.includes('mission_ussr') && got.includes('favor_returned'));
  assert.equal(got.includes('challenges_all'), false);
});
