import assert from 'node:assert/strict';
import test from 'node:test';
import { ACHIEVEMENTS, createAchievementStore, findNewAchievements, recordAchievements } from '../src/core/achievements.js';
import { createGameState } from '../src/core/game-state.js';
import { profileView } from '../src/ui/dashboard.js';

const base = (patch = {}) => ({ ...createGameState('bra'), ...patch });
const ids = (state, store = createAchievementStore(), trophies = null) => findNewAchievements(state, store, trophies).map((item) => item.id);

test('jogo novo nao libera nenhuma conquista de imediato', () => {
  assert.deepEqual(ids(base()), []);
  assert.ok(ACHIEVEMENTS.length >= 18);
  assert.equal(new Set(ACHIEVEMENTS.map((item) => item.id)).size, ACHIEVEMENTS.length, 'ids unicos');
});

test('economia: inflacao baixa, pleno emprego, cofre cheio e mao firme', () => {
  const state = base({ monthCounter: 30 });
  const good = { ...state, economy: { ...state.economy, inflation: 0.015, unemployment: 0.03, cash: state.economy.gdp * 0.2, inflationHistory: Array(24).fill(0.03) } };
  const found = ids(good);
  for (const id of ['price_stability', 'full_employment', 'rainy_day_fund', 'steady_hand']) assert.ok(found.includes(id), id);
  const shaky = { ...good, economy: { ...good.economy, inflationHistory: [...Array(23).fill(0.03), 0.09] } };
  assert.equal(ids(shaky).includes('steady_hand'), false);
});

test('politica: reeleicao, nota A+, base fiel e aliados', () => {
  const state = base({ monthCounter: 30 });
  const won = { ...state, election: { ...state.election, results: [{ won: true, share: 55, month: 48 }, { won: true, share: 53, month: 96 }] } };
  assert.ok(ids(won).includes('reelected') && ids(won).includes('twice_reelected'));
  const report = { year: 2026, grade: 'A+', met: 4, total: 4, goals: [], figures: {} };
  assert.ok(ids({ ...state, yearReports: [report] }).includes('perfect_year'));
  const loyal = { ...state, congress: { ...state.congress, blocs: state.congress.blocs.map((bloc) => ({ ...bloc, loyalty: 80 })) } };
  assert.ok(ids(loyal).includes('loyal_base'));
  const contacts = state.geopolitics.contacts.map((contact, index) => (index < 10 ? { ...contact, alliance: true } : contact));
  assert.ok(ids({ ...state, geopolitics: { ...state.geopolitics, contacts } }).includes('allies_ten'));
});

test('finais da Porta: um final e os sete finais usam os trofeus da conta', () => {
  const state = base();
  assert.ok(ids(state, createAchievementStore(), { endings: ['republic'] }).includes('door_opened'));
  assert.equal(ids(state, createAchievementStore(), { endings: ['republic'] }).includes('all_endings'), false);
  assert.ok(ids(state, createAchievementStore(), { endings: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }).includes('all_endings'));
});

test('conquista ja registrada nao e liberada de novo e a conta guarda o ano', () => {
  const state = base({ slush_fund: 1_000 });
  const first = findNewAchievements(state, createAchievementStore());
  assert.ok(first.some((item) => item.id === 'cayman'));
  const store = recordAchievements(createAchievementStore(), first, state);
  assert.equal(store.unlocked.cayman.year, 2026);
  assert.equal(findNewAchievements(state, store).some((item) => item.id === 'cayman'), false);
  assert.deepEqual(createAchievementStore({ unlocked: { inexistente: {} } }).unlocked, {});
});

test('o perfil lista as conquistas e quantas ja foram feitas', () => {
  const state = base({ slush_fund: 1_000 });
  const store = recordAchievements(createAchievementStore(), findNewAchievements(state, createAchievementStore()), state);
  const html = profileView(state, { achievements: store });
  assert.match(html, /Conquistas/);
  assert.match(html, /Passagem para as Cayman/);
  assert.match(html, /achievement-card is-unlocked/);
  assert.match(html, new RegExp(`1/${ACHIEVEMENTS.length}`));
});
