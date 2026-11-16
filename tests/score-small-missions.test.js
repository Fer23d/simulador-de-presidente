import test from 'node:test';
import assert from 'node:assert/strict';
import { aceitarMissao, createGameState } from '../src/core/game-state.js';
import { getTargets } from '../src/core/historical_missions.js';
import { MISSIONS } from '../src/data/historical_missions.js';
import { RANKING_SIZE, addRankingEntry, computeScore, makeRankingEntry, normalizeRanking } from '../src/core/score.js';

const patch = (s, id, p) => ({ ...s, geopolitics: { ...s.geopolitics, contacts: s.geopolitics.contacts.map((c) => (c.id === id ? { ...c, ...p } : c)) } });
const make = (difficulty = 'normal', country = 'bra') => ({ ...createGameState(country, { name: 'P', language: 'pt-BR', difficulty }), monthCounter: 24, pendingBriefing: null });

test('missoes pequenas: alvos existem, sao poucos e cada uma troca para o pais da historia', () => {
  const ids = new Set(make().geopolitics.contacts.map((c) => c.id).concat('bra'));
  for (const id of ['yugoslavia', 'gran_colombia', 'kalmar', 'central_america']) {
    const mission = MISSIONS[id];
    assert.ok(mission.targets.length <= 6, `${id}: guerra pequena`);
    assert.ok(mission.targets.every((t) => ids.has(t)), `${id}: alvos validos`);
    assert.ok(mission.targets.includes(mission.home), `${id}: pais da missao entre os alvos`);
    const s = aceitarMissao(make(), id);
    assert.equal(s.country.id, mission.home);
    assert.equal(getTargets(s, id).includes(mission.home), false);
    assert.ok(getTargets(s, id).length >= 3);
  }
});

test('pontuacao soma territorio, aliados e objetivos; dificuldade e ruina nuclear mudam o total', () => {
  const base = make();
  const zero = computeScore(base).total;
  let rich = patch(base, 'ury', { anexado: true });
  rich = patch(rich, 'arg', { alliance: true });
  rich = { ...rich, challenges: { active: {}, completed: { peace: { month: 3 } } }, missions: { active: null, completed: { ussr: { months: 1 } }, pendingEpilogue: null } };
  assert.ok(computeScore(rich).total >= zero + 150 + 25 + 300 + 800);
  assert.ok(computeScore({ ...rich, playerProfile: { ...rich.playerProfile, difficulty: 'hard' } }).total > computeScore(rich).total);
  assert.ok(computeScore({ ...rich, playerProfile: { ...rich.playerProfile, difficulty: 'easy' } }).total < computeScore(rich).total);
  const ruined = { ...rich, regime: { ...rich.regime, gameOver: true, outcome: 'aniquilacao-nuclear' } };
  assert.ok(computeScore(ruined).total < computeScore(rich).total);
});

test('ranking: ordena, limita a 10, nao duplica a mesma campanha e ignora lixo', () => {
  let list = [];
  for (let i = 0; i < 14; i += 1) list = addRankingEntry(list, { id: `x:${i}:normal`, name: 'P', country: 'Brasil', total: i * 100, difficulty: 'Normal', months: i, over: false });
  assert.equal(list.length, RANKING_SIZE);
  assert.equal(list[0].total, 1300);
  const again = addRankingEntry(list, { id: 'x:13:normal', name: 'P', country: 'Brasil', total: 50, difficulty: 'Normal', months: 13, over: false });
  assert.equal(again.length, RANKING_SIZE);
  assert.equal(again[0].total, 1300, 'mantem a maior pontuacao da mesma campanha');
  assert.deepEqual(normalizeRanking('x'), []);
  assert.deepEqual(normalizeRanking([{ id: 1 }, null]), []);
  const entry = makeRankingEntry(make('hard'));
  assert.equal(entry.difficulty, 'Difícil');
  assert.equal(entry.over, false);
});
