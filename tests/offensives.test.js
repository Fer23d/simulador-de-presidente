import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceMonth, atacarDaBase, createGameState, enviarTropas, hydrateGameState, pedirReforcos, suspenderOfensiva } from '../src/core/game-state.js';
import { advanceGeopolitics } from '../src/core/geopolitics.js';
import { getDeployed } from '../src/core/deployments.js';
import {
  MAX_CONVOYS, createOffensives, distanceKm, getAttackStatus, getReinforcementStatus, getSupply, normalizeOffensives, processOffensives, travelMonths,
} from '../src/core/offensives.js';
import { diplomacyMap, troopsAbroadPanel } from '../src/ui/dashboard.js';

const patchContact = (state, id, patch) => ({ ...state, geopolitics: { ...state.geopolitics, contacts: state.geopolitics.contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)) } });
const contactOf = (state, id) => state.geopolitics.contacts.find((c) => c.id === id);

// Base: Chile anexado, guarnecido com varios contingentes. Alvo fraco: Uruguai; alvo forte: China.
function setup({ month = 20, contingents = 5, targetPower = 6 } = {}) {
  let state = { ...createGameState('bra'), monthCounter: month };
  state = patchContact(state, 'chl', { anexado: true, destruido: true, militaryPower: 0 });
  state = patchContact(state, 'ury', { militaryPower: targetPower, atWar: false });
  state.world = state.geopolitics.contacts;
  for (let i = 0; i < contingents; i += 1) state = enviarTropas(state, 'chl');
  return state;
}

test('estado novo e saves antigos ganham ofensivas e comboios vazios', () => {
  assert.deepEqual({ offensives: createGameState('bra').offensives, convoys: createGameState('bra').convoys }, createOffensives());
  const legacy = JSON.parse(JSON.stringify(createGameState('bra')));
  delete legacy.offensives; delete legacy.convoys;
  const loaded = hydrateGameState(JSON.stringify(legacy));
  assert.deepEqual(loaded.offensives, {});
  assert.deepEqual(loaded.convoys, []);
  const dirty = normalizeOffensives({ offensives: { a: { baseId: 5 }, b: { baseId: 'chl', rounds: -3, wins: 2.8 } }, convoys: [{ baseId: 'chl', soldiers: -1, armor: 0 }, { baseId: 'chl', soldiers: 500.7, armor: 1, arrives: 9 }] });
  assert.deepEqual(Object.keys(dirty.offensives), ['b']);
  assert.equal(dirty.offensives.b.rounds, 0);
  assert.equal(dirty.offensives.b.wins, 2);
  assert.equal(dirty.convoys.length, 1);
  assert.equal(dirty.convoys[0].soldiers, 500);
});

test('distancia, tempo de viagem e suprimento seguem a geografia', () => {
  const near = distanceKm('bra', 'chl');
  const far = distanceKm('bra', 'rus');
  assert.ok(near < 4000 && far > 9000, `${near} ${far}`);
  assert.equal(distanceKm('bra', 'bra'), 0);
  assert.equal(travelMonths(near), 1);
  assert.ok(travelMonths(far) >= 3);
  assert.equal(travelMonths(1e6), 6);
  assert.ok(getSupply(500) > getSupply(5000));
  assert.ok(getSupply(1e6) >= 0.5 && getSupply(0) <= 1.25);
});

test('validacoes do ataque: base de territorio, tropas minimas, alvo valido', () => {
  const state = setup();
  assert.equal(getAttackStatus(state, 'chl', 'ury').available, true);
  assert.equal(getAttackStatus(state, 'arg', 'ury').available, false, 'so territorio seu e base');
  assert.equal(getAttackStatus(setup({ contingents: 0 }), 'chl', 'ury').available, false, 'base sem tropas');
  assert.equal(getAttackStatus(state, 'chl', 'chl').available, false);
  assert.equal(getAttackStatus(state, 'chl', 'bra').available, false);
  const ally = patchContact(state, 'ury', { alliance: true });
  assert.match(getAttackStatus(ally, 'chl', 'ury').reason, /Aliados/);
  assert.equal(getAttackStatus(patchContact(state, 'ury', { destruido: true }), 'chl', 'ury').available, false);
});

test('lancar a ofensiva declara guerra com custo diplomatico e trava a frente', () => {
  const state = setup();
  const launched = atacarDaBase(state, 'chl', 'ury');
  const target = contactOf(launched, 'ury');
  assert.equal(target.atWar, true);
  assert.equal(target.frontBaseId, 'chl');
  assert.ok(launched.offensives.ury);
  assert.ok(launched.geopolitics.onuScore < state.geopolitics.onuScore, 'declarar guerra custa reputacao');
  assert.match(launched.notice, /Ofensiva lançada a partir de/);
  assert.match(atacarDaBase(launched, 'chl', 'ury').notice, /Já há uma ofensiva/);
});

test('a guerra normal ignora paises em frente de base e a ofensiva os derrota ao longo dos meses', () => {
  const launched = atacarDaBase(setup(), 'chl', 'ury');
  const power = contactOf(launched, 'ury').militaryPower;
  const geo = advanceGeopolitics(launched.geopolitics, launched.military, launched.economy, 7);
  assert.equal(geo.geopolitics.contacts.find((c) => c.id === 'ury').militaryPower, power, 'a resolucao antiga nao mexe na frente de base');
  let current = launched;
  let month = 20;
  while (current.offensives.ury && month < 80) {
    month += 1;
    current = processOffensives({ ...current, monthCounter: month });
  }
  assert.equal(current.offensives.ury, undefined, 'ofensiva termina');
  assert.equal(contactOf(current, 'ury').atWar, false);
  assert.equal(contactOf(current, 'ury').militaryPower, 0);
  assert.equal(contactOf(current, 'ury').frontBaseId, null);
  assert.equal(current.geopolitics.peaceTreaty?.targetId, 'ury');
  assert.equal(current.geopolitics.peaceTreaty?.status, 'pending');
  assert.ok(getDeployed(current, 'chl').soldiers < getDeployed(launched, 'chl').soldiers, 'vitorias tambem custam soldados');
});

test('contra um inimigo forte a ofensiva falha, custa mais soldados e a base sofre contra-ataque', () => {
  const state = patchContact(setup({ contingents: 3 }), 'chn', { militaryPower: 90 });
  const launched = atacarDaBase(state, 'chl', 'chn');
  assert.equal(getAttackStatus(state, 'chl', 'chn').ratio < 0.5, true);
  let current = launched;
  for (let month = 21; month < 27; month += 1) current = processOffensives({ ...current, monthCounter: month });
  assert.equal(contactOf(current, 'chn').militaryPower, 90, 'sem dano ao inimigo');
  assert.ok(current.offensives.chn.losses > 0);
  assert.ok(getDeployed(current, 'chl').soldiers < getDeployed(launched, 'chl').soldiers);
  assert.ok(current.territories.chl.loyalty < 30, 'contra-ataque abala a base');
});

test('suspender a ofensiva libera a guerra normal; base perdida ou sem tropas encerra a ofensiva', () => {
  const launched = atacarDaBase(setup(), 'chl', 'ury');
  const stopped = suspenderOfensiva(launched, 'ury');
  assert.equal(stopped.offensives.ury, undefined);
  assert.equal(contactOf(stopped, 'ury').frontBaseId, null);
  assert.equal(contactOf(stopped, 'ury').atWar, true, 'a guerra continua');
  assert.match(suspenderOfensiva(stopped, 'ury').notice, /Não há ofensiva/);
  const noTroops = processOffensives({ ...launched, deployments: {}, monthCounter: 21 });
  assert.equal(noTroops.offensives.ury, undefined);
  assert.match(noTroops.notice, /não restam tropas/);
  const lostBase = processOffensives({ ...patchContact(launched, 'chl', { anexado: false, destruido: false }), monthCounter: 21 });
  assert.equal(lostBase.offensives.ury, undefined);
  const stale = processOffensives({ ...patchContact(stopped, 'ury', { frontBaseId: 'chl' }), monthCounter: 21 });
  assert.equal(contactOf(stale, 'ury').frontBaseId, null, 'frente antiga e limpa');
});

test('reforcos viajam em comboios cujo atraso depende da distancia entre a capital e a base', () => {
  const state = setup({ contingents: 1 });
  const status = getReinforcementStatus(state, 'chl');
  assert.equal(status.available, true);
  assert.equal(status.months, travelMonths(distanceKm('bra', 'chl')));
  const sent = pedirReforcos(state, 'chl');
  assert.equal(sent.convoys.length, 1);
  assert.equal(sent.convoys[0].arrives, 20 + status.months);
  assert.ok(sent.military.exercito.soldados < state.military.exercito.soldados, 'sai do exercito de casa');
  assert.ok(sent.economy.cash < state.economy.cash);
  assert.match(sent.notice, /Reforços a caminho/);
  const before = getDeployed(sent, 'chl').soldiers;
  const early = processOffensives({ ...sent, monthCounter: 20 + status.months - 1 });
  assert.equal(getDeployed(early, 'chl').soldiers, before, 'ainda viajando');
  assert.equal(early.convoys.length, 1);
  const arrived = processOffensives({ ...sent, monthCounter: 20 + status.months });
  assert.equal(getDeployed(arrived, 'chl').soldiers, before + sent.convoys[0].soldiers);
  assert.equal(arrived.convoys.length, 0);
  assert.match(arrived.notice, /reforços chegaram/);
  // Base mais distante: atraso maior.
  let far = createGameState('bra');
  far = { ...patchContact(far, 'rus', { anexado: true, destruido: true }), monthCounter: 20 };
  far = enviarTropas(far, 'rus');
  assert.ok(getReinforcementStatus(far, 'rus').months > status.months);
});

test('limites de reforco: comboios simultaneos e metade do exercito', () => {
  let state = setup({ contingents: 0 });
  state = enviarTropas(state, 'chl');
  let count = 0;
  for (let i = 0; i < 10; i += 1) {
    const next = pedirReforcos(state, 'chl');
    if (next.convoys.length > state.convoys.length) { state = next; count += 1; }
  }
  assert.ok(count <= MAX_CONVOYS);
  assert.equal(getReinforcementStatus(state, 'chl').available, false);
  assert.equal(getReinforcementStatus(state, 'ury').available, false, 'so territorio recebe reforcos');
});

test('mapa e painel mostram base, modo ataque, comboios e ofensivas', () => {
  const state = pedirReforcos(setup({ contingents: 3 }), 'chl');
  assert.equal(state.convoys.length, 1);
  const baseCard = diplomacyMap(state, { selected: 'chl' });
  assert.match(baseCard, /data-action="attack-mode" data-base="chl"/);
  assert.match(baseCard, /data-action="request-reinforcements"/);
  const targeting = diplomacyMap(state, { selected: 'ury', attackFrom: 'chl' });
  assert.match(targeting, /Modo ataque/);
  assert.match(targeting, /data-action="launch-offensive" data-base="chl" data-target="ury"/);
  assert.match(targeting, /km/);
  assert.match(targeting, /condições/);
  const launched = atacarDaBase(state, 'chl', 'ury');
  assert.match(diplomacyMap(launched, { selected: 'ury' }), /data-action="stop-offensive"/);
  const panel = troopsAbroadPanel(launched);
  assert.match(panel, /Ofensiva contra/);
  assert.match(panel, /Reforços a caminho/);
});

test('avancar meses completos com ofensiva e reforcos mantem o estado valido', () => {
  let state = pedirReforcos(atacarDaBase(setup({ month: 8 }), 'chl', 'ury'), 'chl');
  for (let index = 0; index < 24; index += 1) {
    state = advanceMonth({ ...state, pendingEvent: null, pendingBriefing: null, pendingHostileAlert: null, pendingUnVote: null, pendingGlobalBid: null, pendingStory: null });
    if (state.regime.gameOver) break;
    assert.ok(Number.isFinite(state.economy.cash));
    assert.ok(state.military.exercito.soldados >= 0);
    state = { ...state, geopolitics: { ...state.geopolitics, peaceTreaty: null } };
  }
  assert.ok(state.convoys.length === 0 || state.convoys[0].arrives > 8);
});
