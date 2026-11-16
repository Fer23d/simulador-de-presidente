import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceMonth, contratarEmbaixador, createGameState, demitirEmbaixador, instalarAgente, operacaoEspionagem } from '../src/core/game-state.js';
import { MAX_EMBASSIES, TRAITS, getHireStatus, getUpkeep, hasEmbassy, normalizeEmbassies, processEmbassies } from '../src/core/embassies.js';
import { MAX_NETWORKS, getInstallStatus, getIntel, getLevel, getOpStatus, normalizeSpies, processSpies } from '../src/core/spy_network.js';
import { getPactChance } from '../src/core/world_order.js';

const patch = (s, id, p) => ({ ...s, geopolitics: { ...s.geopolitics, contacts: s.geopolitics.contacts.map((c) => (c.id === id ? { ...c, ...p } : c)) } });
const contact = (s, id) => s.geopolitics.contacts.find((c) => c.id === id);
const base = () => {
  const s = { ...createGameState('bra', { name: 'P', language: 'pt-BR' }), monthCounter: 10, pendingBriefing: null, pendingEvent: null };
  return { ...s, economy: { ...s.economy, cash: 5e12 } };
};

test('embaixador: nomear custa, limita a 5, nao em guerra e demitir libera', () => {
  let s = base();
  const ids = ['arg', 'chl', 'ury', 'per', 'col', 'ecu'];
  for (const id of ids.slice(0, MAX_EMBASSIES)) s = contratarEmbaixador(s, id);
  assert.equal(Object.keys(s.embassies.posts).length, MAX_EMBASSIES);
  assert.equal(getHireStatus(s, ids[5]).available, false);
  assert.equal(contratarEmbaixador(s, ids[5]).embassies.posts[ids[5]], undefined);
  s = demitirEmbaixador(s, 'arg');
  assert.equal(hasEmbassy(s, 'arg'), false);
  assert.equal(getHireStatus(patch(base(), 'arg', { atWar: true }), 'arg').available, false);
  assert.ok(getUpkeep(s) > 0);
});

test('embaixador sobe a relacao todo mes, facilita pacto e o corrupto/ambicioso podem cair', () => {
  let s = patch(base(), 'arg', { relation: 10 });
  s = { ...s, embassies: { posts: { arg: { trait: 'skilled', since: 0 } }, scandals: 0, defections: 0 } };
  const after = processEmbassies(s);
  assert.ok(contact(after, 'arg').relation > 10);
  const withoutPost = patch(base(), 'arg', { relation: 10 });
  assert.ok(getPactChance(s, 'arg') > getPactChance(withoutPost, 'arg'));
  // com muitos meses, um corrupto acaba em escandalo
  let c = { ...patch(base(), 'chl', { relation: 20 }), embassies: { posts: { chl: { trait: 'corrupt', since: 0 } }, scandals: 0, defections: 0 } };
  for (let m = 11; m < 400 && hasEmbassy(c, 'chl'); m += 1) c = processEmbassies({ ...c, monthCounter: m });
  assert.equal(hasEmbassy(c, 'chl'), false);
  assert.equal(c.embassies.scandals, 1);
  assert.ok(Object.keys(TRAITS).length === 4);
});

test('espionagem: instalar, subir ate o nivel 3, limite de redes e revelacoes por nivel', () => {
  let s = base();
  assert.equal(getIntel(s, 'arg'), null);
  s = instalarAgente(s, 'arg');
  assert.equal(getLevel(s, 'arg'), 1);
  assert.equal(getOpStatus(s, 'arg', 'steal').available, false, 'exige nivel 2');
  const l1 = getIntel(s, 'arg').lines.length;
  s = instalarAgente(instalarAgente(s, 'arg'), 'arg');
  assert.equal(getLevel(s, 'arg'), 3);
  assert.equal(getInstallStatus(s, 'arg').available, false, 'nivel maximo');
  assert.ok(getIntel(s, 'arg').lines.length > l1);
  let many = base();
  for (const id of ['arg', 'chl', 'ury', 'per', 'col', 'ecu', 'bol']) many = instalarAgente(many, id);
  assert.equal(Object.keys(many.spies.nets).length, MAX_NETWORKS);
});

test('operacoes: roubar tecnologia, comprar influencia e sabotar; recarga e fracasso queimam a rede', () => {
  let s = base();
  for (let i = 0; i < 3; i += 1) s = instalarAgente(s, 'arg');
  const points = s.military_research_points ?? 0;
  const relation = contact(s, 'arg').relation;
  const power = contact(s, 'arg').militaryPower;
  let steal = null;
  let m = 10;
  // procura um mes em que a operacao de certo (resultado deterministico por mes)
  for (; m < 200 && !steal; m += 1) {
    const out = operacaoEspionagem({ ...s, monthCounter: m }, 'arg', 'steal');
    if (out.military_research_points > points) steal = out;
  }
  assert.ok(steal, 'alguma tentativa deu certo');
  assert.equal(getOpStatus(steal, 'arg', 'steal').available, false, 'em recarga');
  let burned = null;
  for (let k = 10; k < 400 && !burned; k += 1) {
    const out = operacaoEspionagem({ ...s, monthCounter: k }, 'arg', 'sabotage');
    if (getLevel(out, 'arg') === 0) burned = out;
    else assert.ok(contact(out, 'arg').militaryPower < power);
  }
  if (burned) { assert.ok(contact(burned, 'arg').relation < relation); assert.equal(burned.spies.exposed, 1); assert.equal(getInstallStatus(burned, 'arg').available, false, 'pais de sobreaviso'); }
  let inf = null;
  for (let k = 10; k < 200 && !inf; k += 1) { const out = operacaoEspionagem({ ...s, monthCounter: k }, 'arg', 'influence'); if (contact(out, 'arg').relation > relation) inf = out; }
  assert.ok(inf);
});

test('processo mensal descobre redes ao longo do tempo; saves antigos e dados sujos carregam', () => {
  let s = patch(base(), 'chl', { relation: -60 });
  s = { ...s, spies: { nets: { chl: { level: 3, since: 0 } }, cooldowns: {}, exposed: 0, ops: 0 } };
  for (let m = 11; m < 600 && getLevel(s, 'chl'); m += 1) s = processSpies({ ...s, monthCounter: m });
  assert.equal(getLevel(s, 'chl'), 0);
  assert.equal(s.spies.exposed, 1);
  assert.deepEqual(normalizeSpies(undefined), { nets: {}, cooldowns: {}, exposed: 0, ops: 0 });
  assert.deepEqual(normalizeEmbassies({ posts: { arg: { trait: 'xx' } } }).posts, {});
  const m = advanceMonth(instalarAgente(contratarEmbaixador(base(), 'arg'), 'chl'));
  assert.ok(m.embassies && m.spies);
});
