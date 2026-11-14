import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceMonth, createGameState, proporPacto, romperPacto, responderPacto, startWar } from '../src/core/game-state.js';
import { answerPactOffer, coalitionRespond, getCoalitionOf, getPactStatus, hasPact, listPacts, normalizeWorldOrder, processWorldOrder } from '../src/core/world_order.js';
import { getAttackers } from '../src/core/territory_defense.js';

const patch = (s, id, p) => ({ ...s, geopolitics: { ...s.geopolitics, contacts: s.geopolitics.contacts.map((c) => (c.id === id ? { ...c, ...p } : c)) } });
const contact = (s, id) => s.geopolitics.contacts.find((c) => c.id === id);
const base = () => ({ ...createGameState('bra', { name: 'P', language: 'pt-BR' }), monthCounter: 12, pendingBriefing: null, pendingEvent: null });

test('pacto: so assina com relacao boa e dura de 1 a 4 anos', () => {
  let s = patch(base(), 'arg', { relation: 80, tradeTreaty: true });
  assert.equal(getPactStatus(s, 'arg', 4).available, true);
  // forca aceitacao: tenta ate achar um mes que aceita
  let signed = null;
  for (let m = 12; m < 60 && !signed; m += 1) {
    const out = proporPacto({ ...s, monthCounter: m }, 'arg', 4);
    if (hasPact(out, 'arg')) signed = out;
  }
  assert.ok(signed, 'algum mes aceita');
  const pact = listPacts(signed)[0];
  assert.equal(pact.years, 4);
  assert.equal(pact.end - pact.start, 48);
  assert.equal(getPactStatus(signed, 'arg').available, false);
});

test('pacto: relacao ruim ou guerra impedem; recusa gera espera', () => {
  const s = base();
  assert.equal(getPactStatus(patch(s, 'arg', { relation: -80 }), 'arg').available, false);
  assert.equal(getPactStatus(patch(s, 'arg', { atWar: true }), 'arg').available, false);
  const low = patch(s, 'arg', { relation: -35 });
  let refused = null;
  for (let m = 12; m < 80 && !refused; m += 1) {
    const out = proporPacto({ ...low, monthCounter: m }, 'arg', 4);
    if (!hasPact(out, 'arg')) refused = { out, m };
  }
  assert.ok(refused);
  assert.equal(getPactStatus(refused.out, 'arg').available, false);
});

test('pacto: parceiro nao declara guerra e expira', () => {
  let s = patch(base(), 'arg', { relation: -10, militaryPower: 60 });
  s = { ...s, worldOrder: { ...normalizeWorldOrder(null), pacts: { arg: { start: 12, end: 24, years: 1 } } } };
  for (let i = 0; i < 11; i += 1) s = advanceMonth({ ...s, pendingBriefing: null, pendingEvent: null });
  assert.equal(contact(s, 'arg').atWar, false);
  assert.equal(hasPact(s, 'arg'), true);
  for (let i = 0; i < 2; i += 1) s = advanceMonth({ ...s, pendingBriefing: null, pendingEvent: null });
  assert.equal(hasPact(s, 'arg'), false);
});

test('pacto: declarar guerra a parceiro e traicao e custa ONU', () => {
  let s = patch(base(), 'arg', { relation: 40 });
  s = { ...s, worldOrder: { ...normalizeWorldOrder(null), pacts: { arg: { start: 12, end: 60, years: 4 } } } };
  const before = s.geopolitics.onuScore;
  const out = startWar(s, 'arg');
  assert.equal(contact(out, 'arg').atWar, true);
  assert.equal(hasPact(out, 'arg'), false);
  assert.ok(out.geopolitics.onuScore < before - 10);
  assert.equal(out.worldOrder.broken, 1);
});

test('pacto: romper voluntariamente e responder oferta', () => {
  let s = patch(base(), 'arg', { relation: 40 });
  s = { ...s, worldOrder: { ...normalizeWorldOrder(null), pacts: { arg: { start: 12, end: 60, years: 4 } }, offer: { id: 'chl', years: 2, deadline: 20 } } };
  const accepted = responderPacto(s, true);
  assert.equal(hasPact(accepted, 'chl'), true);
  assert.equal(accepted.worldOrder.offer, null);
  const refused = answerPactOffer(s, false);
  assert.equal(refused.worldOrder.offer, null);
  assert.equal(hasPact(refused, 'chl'), false);
  const broken = romperPacto(s, 'arg');
  assert.equal(hasPact(broken, 'arg'), false);
});

test('mundo acorda com 3 anexados e rivais passam a anexar vizinhos', () => {
  let s = base();
  for (const id of ['pry', 'ury', 'bol']) s = patch(s, id, { anexado: true, destruido: true, militaryPower: 0 });
  s = { ...s, geopolitics: { ...s.geopolitics, annexedCountryIds: ['pry', 'ury', 'bol'] } };
  let out = processWorldOrder(s);
  assert.equal(out.worldOrder.awake, true);
  let annexedByRival = 0;
  for (let i = 0; i < 80; i += 1) {
    out = processWorldOrder({ ...out, monthCounter: out.monthCounter + 1 });
    annexedByRival = out.geopolitics.contacts.filter((c) => c.annexedBy).length;
  }
  assert.ok(annexedByRival >= 1, 'alguma potencia anexou alguem');
  assert.ok(out.worldOrder.annexations.length >= 1);
  const victim = out.geopolitics.contacts.find((c) => c.annexedBy);
  assert.equal(victim.destruido, true);
});

test('sem 3 anexacoes o mundo nao acorda', () => {
  let s = patch(base(), 'pry', { anexado: true });
  for (let i = 0; i < 30; i += 1) s = processWorldOrder({ ...s, monthCounter: s.monthCounter + 1 });
  assert.equal(s.worldOrder.awake, false);
  assert.equal(s.geopolitics.contacts.filter((c) => c.annexedBy).length, 0);
});

test('coalizoes: ate 5 membros, ninguem em duas, e defesa coletiva', () => {
  let s = base();
  for (const id of ['pry', 'ury', 'bol']) s = patch(s, id, { anexado: true, destruido: true, militaryPower: 0 });
  s = { ...s, geopolitics: { ...s.geopolitics, annexedCountryIds: ['pry', 'ury', 'bol'] } };
  let out = s;
  for (let i = 0; i < 160; i += 1) out = processWorldOrder({ ...out, monthCounter: out.monthCounter + 1 });
  const { coalitions } = out.worldOrder;
  assert.ok(coalitions.length >= 1, 'ao menos uma coalizao');
  const all = coalitions.flatMap((c) => c.members);
  assert.equal(new Set(all).size, all.length, 'ninguem em duas');
  assert.ok(coalitions.every((c) => c.members.length >= 2 && c.members.length <= 5));
  // defesa coletiva: guerra contra um membro traz os demais
  const target = coalitions[0];
  const members = target.members.filter((id) => !out.geopolitics.contacts.find((c) => c.id === id).alliance);
  const hit = patch({ ...out, geopolitics: { ...out.geopolitics, contacts: out.geopolitics.contacts.map((c) => (target.members.includes(c.id) ? { ...c, atWar: false } : c)) } }, members[0], { atWar: true });
  const responded = coalitionRespond(hit);
  for (const id of members) assert.equal(contact(responded, id).atWar, true, `${id} entrou na guerra`);
  assert.ok(getCoalitionOf(responded, members[0]));
});

test('atacantes de territorio: pacto protege e mundo acordado amplia o risco', () => {
  let s = base();
  s = patch(s, 'pry', { anexado: true, destruido: true });
  s = patch(s, 'arg', { relation: 30, militaryPower: 40 });
  assert.equal(getAttackers(s, 'pry').some((a) => a.id === 'arg'), false);
  const awake = { ...s, worldOrder: { ...normalizeWorldOrder(null), awake: true } };
  assert.equal(getAttackers(awake, 'pry').some((a) => a.id === 'arg'), true);
  const pact = { ...awake, worldOrder: { ...awake.worldOrder, pacts: { arg: { start: 12, end: 60, years: 4 } } } };
  assert.equal(getAttackers(pact, 'pry').some((a) => a.id === 'arg'), false);
});

test('hydrate: save antigo sem worldOrder carrega com padroes', () => {
  assert.deepEqual(normalizeWorldOrder(undefined).coalitions, []);
  const dirty = normalizeWorldOrder({ coalitions: [{ id: 'a', name: 'X', members: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }, { id: 'b', name: 'Y', members: ['a', 'z'] }] });
  assert.equal(dirty.coalitions[0].members.length, 5);
  assert.equal(dirty.coalitions.length, 1, 'membro repetido nao entra em segunda coalizao');
});
