import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, responderContrato, startWar } from '../src/core/game-state.js';
import { OFFER_INTERVAL_MONTHS, PLEDGE_MONTHS, fulfillContract, normalizeContracts, processWarContracts } from '../src/core/war_contracts.js';

const patch = (s, id, p) => ({ ...s, geopolitics: { ...s.geopolitics, contacts: s.geopolitics.contacts.map((c) => (c.id === id ? { ...c, ...p } : c)) } });
const contact = (s, id) => s.geopolitics.contacts.find((c) => c.id === id);
const base = () => ({ ...createGameState('bra', { name: 'P', language: 'pt-BR' }), monthCounter: 10, pendingBriefing: null, pendingEvent: null });

function firstOffer(state) {
  let s = state;
  for (let i = 0; i < 40 && !s.contracts.offer; i += 1) s = processWarContracts({ ...s, monthCounter: s.monthCounter + 1 });
  return s;
}

test('oferta aparece e respeita o intervalo de 8 meses', () => {
  const s = firstOffer(base());
  assert.ok(s.contracts.offer, 'surgiu oferta');
  const offer = s.contracts.offer;
  assert.notEqual(offer.sponsorId, offer.targetId);
  assert.ok(contact(s, offer.sponsorId).relation >= 20);
  assert.ok(offer.reward > 0);
  // recusa e confere que nada novo surge antes de 8 meses
  let t = responderContrato(s, false);
  assert.equal(t.contracts.offer, null);
  const at = t.contracts.lastOfferMonth;
  for (let i = 1; i < OFFER_INTERVAL_MONTHS; i += 1) {
    t = processWarContracts({ ...t, monthCounter: at + i });
    assert.equal(t.contracts.offer, null, `sem oferta ${i} mes(es) depois`);
  }
});

test('alvos nao incluem aliados, parceiros de pacto nem quem ja esta em guerra', () => {
  let s = patch(base(), 'arg', { alliance: true, relation: 80 });
  s = { ...s, worldOrder: { ...s.worldOrder, pacts: { chl: { start: 0, end: 999, years: 4 } } } };
  for (let m = 12; m < 200; m += 1) {
    const out = processWarContracts({ ...s, monthCounter: m, contracts: { ...s.contracts, lastOfferMonth: -99 } });
    const t = out.contracts.offer?.targetId;
    if (t) { assert.notEqual(t, 'arg'); assert.notEqual(t, 'chl'); }
  }
});

test('aceitar e declarar guerra paga a recompensa, sobe relacao do contratante e custa ONU', () => {
  let s = firstOffer(base());
  const { sponsorId, targetId, reward } = s.contracts.offer;
  s = responderContrato(s, true);
  assert.equal(s.contracts.active.targetId, targetId);
  const cash = s.economy.cash;
  const sponsorRelation = contact(s, sponsorId).relation;
  const onu = s.geopolitics.onuScore;
  const out = startWar(s, targetId);
  assert.equal(contact(out, targetId).atWar, true);
  assert.equal(out.contracts.active, null);
  assert.equal(out.contracts.fulfilled, 1);
  assert.ok(out.economy.cash >= cash + reward - 1, 'recompensa paga');
  assert.ok(contact(out, sponsorId).relation > sponsorRelation);
  assert.ok(out.geopolitics.onuScore < onu);
  assert.equal(contact(out, targetId).relation, -100);
});

test('prazo estourado: contratante se ofende e contrato some', () => {
  let s = responderContrato(firstOffer(base()), true);
  const { sponsorId } = s.contracts.active;
  const relation = contact(s, sponsorId).relation;
  s = processWarContracts({ ...s, monthCounter: s.contracts.active.deadline });
  assert.equal(s.contracts.active, null);
  assert.equal(s.contracts.failed, 1);
  assert.ok(contact(s, sponsorId).relation < relation);
  assert.ok(PLEDGE_MONTHS > 0);
});

test('guerra a outro pais nao paga o contrato; oferta expira sem resposta; save antigo carrega', () => {
  let s = responderContrato(firstOffer(base()), true);
  const other = s.geopolitics.contacts.find((c) => c.id !== s.contracts.active.targetId && c.id !== s.contracts.active.sponsorId && !c.alliance && !c.atWar).id;
  assert.equal(fulfillContract(s, other).contracts.active.targetId, s.contracts.active.targetId);
  const e = firstOffer(base());
  assert.equal(processWarContracts({ ...e, monthCounter: e.contracts.offer.deadline }).contracts.offer, null);
  assert.equal(normalizeContracts(undefined).offer, null);
});

import { getProxyContractors, getProxyStatus, orderProxyAttack } from '../src/core/war_contracts.js';
import { encomendarAtaque } from '../src/core/game-state.js';

const rich = (s) => ({ ...s, economy: { ...s.economy, cash: 5e12 } });

test('encomendar ataque: so amigos aceitam, nao se ataca aliado e paga so se aceitar', () => {
  let s = rich(patch(patch(patch(base(), 'arg', { alliance: true, relation: 90, militaryPower: 60 }), 'ury', { relation: 0, militaryPower: 6 }), 'chl', { alliance: true }));
  assert.equal(getProxyContractors(s).some((c) => c.id === 'arg'), true);
  assert.equal(getProxyStatus(s, 'arg', 'chl').available, false, 'alvo aliado');
  assert.equal(getProxyStatus(s, 'ury', 'per').available, false, 'contratado sem relacao');
  const ok = getProxyStatus(s, 'arg', 'ury');
  assert.equal(ok.available, true);
  assert.ok(ok.chance > 0.5 && ok.cost > 0);
  let accepted = null;
  for (let m = 10; m < 60 && !accepted; m += 1) {
    const out = orderProxyAttack({ ...s, monthCounter: m }, 'arg', 'ury');
    if (out.contracts.proxies.length) accepted = out;
    else assert.equal(out.economy.cash, s.economy.cash, 'recusa nao cobra');
  }
  assert.ok(accepted);
  assert.ok(accepted.economy.cash < s.economy.cash);
});

test('encomenda resolvida: vitoria enfraquece alvo (nunca zera), derrota custa ao contratado', () => {
  let s = rich(patch(patch(base(), 'arg', { alliance: true, relation: 90, militaryPower: 80 }), 'ury', { relation: 0, militaryPower: 10 }));
  let out = null;
  for (let m = 10; m < 60 && !out; m += 1) {
    const r = orderProxyAttack({ ...s, monthCounter: m }, 'arg', 'ury');
    if (r.contracts.proxies.length) out = r;
  }
  const due = out.contracts.proxies[0].resolveMonth;
  const done = processWarContracts({ ...out, monthCounter: due });
  assert.equal(done.contracts.proxies.length, 0);
  assert.equal(done.contracts.proxyWon, 1);
  assert.ok(contact(done, 'ury').militaryPower >= 1 && contact(done, 'ury').militaryPower < 10);
  // derrota: contratado fraco contra alvo forte
  const weak = rich(patch(patch(base(), 'arg', { alliance: true, relation: 90, militaryPower: 9 }), 'ury', { relation: 0, militaryPower: 90 }));
  let o2 = null;
  for (let m = 10; m < 80 && !o2; m += 1) {
    const r = orderProxyAttack({ ...weak, monthCounter: m }, 'arg', 'ury');
    if (r.contracts.proxies.length) o2 = r;
  }
  if (o2) {
    const d2 = processWarContracts({ ...o2, monthCounter: o2.contracts.proxies[0].resolveMonth });
    assert.equal(d2.contracts.proxyLost, 1);
    assert.ok(contact(d2, 'arg').militaryPower < 9);
  }
  assert.equal(encomendarAtaque(patch(s, 'chl', { alliance: true }), 'arg', 'chl').contracts.proxies.length, 0);
});
