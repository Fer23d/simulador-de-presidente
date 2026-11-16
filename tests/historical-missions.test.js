import test from 'node:test';
import assert from 'node:assert/strict';
import { abandonarMissao, aceitarMissao, anexarPais, createGameState, fecharEpilogoMissao } from '../src/core/game-state.js';
import { checkMissions, getProgress, getTargets, normalizeMissions } from '../src/core/historical_missions.js';
import { MISSIONS, MISSION_LIST } from '../src/data/historical_missions.js';

const patch = (s, id, p) => ({ ...s, geopolitics: { ...s.geopolitics, contacts: s.geopolitics.contacts.map((c) => (c.id === id ? { ...c, ...p } : c)) } });
const make = (country = 'bra') => ({ ...createGameState(country, { name: 'P', language: 'pt-BR' }), monthCounter: 10, pendingBriefing: null });

test('3 missoes iniciais com historia completa e alvos que existem no jogo', () => {
  assert.deepEqual(MISSION_LIST.map((m) => m.id), ['ussr', 'portugal', 'spain', 'yugoslavia', 'gran_colombia', 'kalmar', 'central_america']);
  const ids = new Set(make().geopolitics.contacts.map((c) => c.id).concat('bra'));
  for (const m of MISSION_LIST) {
    assert.ok(m.story.origin.length > 80 && m.story.peak.length > 80 && m.story.end.length > 80);
    assert.ok(m.story.numbers.length >= 3);
    assert.ok(m.targets.every((id) => ids.has(id)), `${m.id}: alvos validos`);
    assert.equal(new Set(m.targets).size, m.targets.length);
  }
  assert.equal(MISSIONS.ussr.targets.length, 15);
});

test('o pais do jogador sai da lista de alvos', () => {
  assert.equal(getTargets(make('rus'), 'ussr').includes('rus'), false);
  assert.equal(getTargets(make('bra'), 'ussr').includes('rus'), true);
  assert.equal(getTargets(make('bra'), 'portugal').includes('bra'), false);
});

test('aceitar: so uma missao ativa por vez; abandonar libera', () => {
  let s = aceitarMissao(make(), 'portugal');
  assert.equal(s.missions.active.id, 'portugal');
  const blocked = aceitarMissao(s, 'ussr');
  assert.equal(blocked.missions.active.id, 'portugal');
  s = abandonarMissao(s);
  assert.equal(s.missions.active, null);
  assert.equal(aceitarMissao(s, 'ussr').missions.active.id, 'ussr');
});

test('progresso conta anexados e a missao conclui com epilogo e recompensa', () => {
  let s = aceitarMissao(make('bra'), 'portugal');
  const targets = getTargets(s, 'portugal');
  const cashBefore = s.economy.cash;
  for (const id of targets.slice(0, -1)) s = patch(s, id, { anexado: true, destruido: true, militaryPower: 0 });
  assert.equal(getProgress(s, 'portugal').done, targets.length - 1);
  assert.equal(checkMissions(s).missions.active.id, 'portugal');
  const last = targets[targets.length - 1];
  s = patch(s, last, { anexado: true, destruido: true, militaryPower: 0 });
  s = checkMissions(s);
  assert.equal(s.missions.active, null);
  assert.equal(s.missions.pendingEpilogue, 'portugal');
  const done = s.missions.completed.portugal;
  assert.equal(done.targets, targets.length);
  assert.ok(done.population > 0 && done.area > 0);
  assert.ok(s.economy.cash > cashBefore);
  assert.equal(aceitarMissao(s, 'portugal').missions.completed.portugal.targets, targets.length, 'nao repete missao cumprida');
  assert.equal(fecharEpilogoMissao(s).missions.pendingEpilogue, null);
});

test('anexar o ultimo pais pelo jogo conclui a missao na hora', () => {
  let s = aceitarMissao(make('bra'), 'portugal');
  const targets = getTargets(s, 'portugal');
  for (const id of targets.slice(0, -1)) s = patch(s, id, { anexado: true, destruido: true, militaryPower: 0 });
  const last = targets[targets.length - 1];
  s = patch(s, last, { militaryPower: 0 });
  s = anexarPais(s, last);
  assert.equal(s.missions.pendingEpilogue, 'portugal');
});

test('save antigo sem missions carrega com padroes e dados sujos sao limpos', () => {
  assert.equal(normalizeMissions(undefined).active, null);
  const dirty = normalizeMissions({ active: { id: 'nada' }, completed: { ussr: { months: 5 }, fake: {} }, pendingEpilogue: 'spain' });
  assert.equal(dirty.active, null);
  assert.deepEqual(Object.keys(dirty.completed), ['ussr']);
  assert.equal(dirty.pendingEpilogue, null);
});

test('pegar a missao faz o jogador assumir o pais da historia e guarda missoes cumpridas', () => {
  const base = { ...make('bra'), missions: { active: null, completed: { spain: { startMonth: 0, endMonth: 5, months: 5, wars: 1, population: 1, area: 1, targets: 20 } }, pendingEpilogue: null } };
  const s = aceitarMissao(base, 'ussr');
  assert.equal(s.country.id, 'rus');
  assert.equal(s.missions.active.id, 'ussr');
  assert.ok(s.missions.completed.spain, 'missao cumprida preservada');
  assert.equal(getTargets(s, 'ussr').includes('rus'), false);
  assert.equal(aceitarMissao(make('prt'), 'portugal').country.id, 'prt');
  // missao em andamento bloqueia: nao troca de pais
  const blocked = aceitarMissao(s, 'spain');
  assert.equal(blocked.country.id, 'rus');
});
