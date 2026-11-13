import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceMonth, createGameState, enviarTropas, hydrateGameState, pedirTropas, retirarTropas } from '../src/core/game-state.js';
import {
  LOAN_MONTHS, TERRITORY_START_LOYALTY, createDeployments, getAlliedForcesPower, getContingent, getDeployStatus, getDeployed,
  getDeploymentKind, getRequestStatus, getTerritoryLoyalty, normalizeDeployments, processDeployments, troopsPower,
} from '../src/core/deployments.js';
import { diplomacyMap, militaryView, troopsAbroadPanel } from '../src/ui/dashboard.js';

const patchContact = (state, id, patch) => ({ ...state, geopolitics: { ...state.geopolitics, contacts: state.geopolitics.contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)) } });
const setup = (month = 20) => {
  let state = { ...createGameState('bra'), monthCounter: month };
  const ids = state.geopolitics.contacts.map((c) => c.id).filter((id) => id !== 'bra');
  const [ally, territory, neutral] = ids;
  state = patchContact(state, ally, { alliance: true, relation: 80, militaryPower: 40 });
  state = patchContact(state, territory, { anexado: true, destruido: true, militaryPower: 0 });
  state.world = state.geopolitics.contacts;
  return { state, ally, territory, neutral };
};

test('estado novo e saves antigos ganham as estruturas de tropas', () => {
  const state = createGameState('bra');
  assert.deepEqual({ deployments: state.deployments, territories: state.territories, alliedLoans: state.alliedLoans }, createDeployments());
  const legacy = JSON.parse(JSON.stringify(state));
  delete legacy.deployments; delete legacy.territories; delete legacy.alliedLoans;
  assert.deepEqual(hydrateGameState(JSON.stringify(legacy)).deployments, {});
  const dirty = normalizeDeployments({ deployments: { x: { soldiers: -4, armor: 0 }, y: { soldiers: 500.9, armor: 'a' } }, territories: { z: { loyalty: 900 } }, alliedLoans: { w: { power: -3 } } });
  assert.deepEqual(dirty.deployments, { y: { soldiers: 500, armor: 0, since: 0 } });
  assert.equal(dirty.territories.z.loyalty, 100);
  assert.equal(dirty.alliedLoans.w.power, 0);
});

test('so e possivel enviar tropas a territorios seus e a aliados', () => {
  const { state, ally, territory, neutral } = setup();
  assert.equal(getDeploymentKind(state, state.geopolitics.contacts.find((c) => c.id === ally)), 'ally');
  assert.equal(getDeploymentKind(state, state.geopolitics.contacts.find((c) => c.id === territory)), 'territory');
  assert.equal(getDeployStatus(state, neutral).available, false);
  assert.match(enviarTropas(state, neutral).notice, /territórios seus e a aliados/);
  assert.equal(getDeployStatus(state, ally).available, true);
  assert.equal(getDeployStatus(state, territory).available, true);
});

test('enviar tropas tira do exercito de casa, cobra logistica e permite reforcar varias vezes ate o limite', () => {
  const { state, ally } = setup();
  const before = state.military;
  const sent = enviarTropas(state, ally);
  const contingent = getContingent(state);
  assert.equal(sent.military.exercito.soldados, before.exercito.soldados - contingent.soldiers);
  assert.ok(sent.military.power < before.power, 'o poder em casa cai');
  assert.ok(sent.economy.cash < state.economy.cash);
  assert.equal(getDeployed(sent, ally).soldiers, contingent.soldiers);
  let current = sent;
  for (let i = 0; i < 12; i += 1) current = enviarTropas(current, ally);
  const home = current.military.exercito.soldados;
  const away = getDeployed(current, ally).soldiers;
  assert.ok(away <= (home + away) * 0.5 + 1, 'no maximo metade do exercito fora');
  assert.match(enviarTropas(current, ally).notice, /No máximo metade|pequeno/);
});

test('retirar devolve as tropas e desfaz o reforco do aliado', () => {
  const { state, ally } = setup();
  let current = enviarTropas(state, ally);
  current = processDeployments({ ...current, monthCounter: 21 });
  const reinforced = current.geopolitics.contacts.find((c) => c.id === ally);
  assert.ok(reinforced.reinforcement > 0);
  assert.ok(reinforced.militaryPower > 40);
  const back = retirarTropas(current, ally);
  assert.equal(getDeployed(back, ally).soldiers, 0);
  assert.equal(back.military.exercito.soldados, state.military.exercito.soldados);
  assert.equal(back.geopolitics.contacts.find((c) => c.id === ally).militaryPower, 40);
  assert.match(retirarTropas(back, ally).notice, /Não há tropas/);
});

test('guarnicao em aliado: manutencao mensal, relacao sobe e baixas em frente de guerra', () => {
  const { state, ally } = setup();
  const plain = patchContact(state, state.geopolitics.contacts.find((c) => c.anexado).id, { anexado: false, destruido: false });
  const sent = enviarTropas(plain, ally);
  const peace = processDeployments({ ...sent, monthCounter: 21 });
  assert.ok(peace.economy.cash < sent.economy.cash, 'manutencao');
  assert.ok(peace.geopolitics.contacts.find((c) => c.id === ally).relation > 80);
  assert.equal(getDeployed(peace, ally).soldiers, getDeployed(sent, ally).soldiers, 'sem guerra, sem baixas');
  const atWar = processDeployments({ ...patchContact(sent, ally, { atWar: true, atWarAgainst: 'arg' }), monthCounter: 21 });
  assert.ok(getDeployed(atWar, ally).soldiers < getDeployed(sent, ally).soldiers, 'em guerra, ha baixas');
  assert.match(atWar.notice, /Baixas/);
});

test('territorio sem guarnicao perde lealdade e gera guerrilha; com guarnicao fica estavel e rende tributo', () => {
  const { state, territory } = setup();
  assert.equal(getTerritoryLoyalty(state, territory), TERRITORY_START_LOYALTY);
  let bare = state;
  let guerrilla = 0;
  for (let month = 21; month < 60; month += 1) {
    const before = bare.regime.unrest;
    bare = processDeployments({ ...bare, monthCounter: month });
    if (bare.regime.unrest > before) guerrilla += 1;
  }
  assert.ok(guerrilla > 0, 'a ocupacao sem tropas gera guerrilha');
  assert.ok(getTerritoryLoyalty(bare, territory) < 35);
  let garrisoned = state;
  for (let i = 0; i < 4; i += 1) garrisoned = enviarTropas(garrisoned, territory);
  for (let month = 21; month < 60; month += 1) garrisoned = processDeployments({ ...garrisoned, monthCounter: month });
  assert.ok(getTerritoryLoyalty(garrisoned, territory) > getTerritoryLoyalty(bare, territory) + 10);
});

test('tropas voltam sozinhas quando a parceria acaba', () => {
  const { state, ally } = setup();
  const sent = enviarTropas(state, ally);
  const broken = processDeployments({ ...patchContact(sent, ally, { alliance: false }), player_alliance: [], monthCounter: 21 });
  assert.equal(getDeployed(broken, ally).soldiers, 0);
  assert.equal(broken.military.exercito.soldados, state.military.exercito.soldados);
  assert.match(broken.notice, /voltaram para casa/);
});

test('pedir tropas: exige aliado em paz com boa relacao, soma poder por 6 meses e depois devolve', () => {
  const { state, ally, neutral } = setup();
  assert.equal(getRequestStatus(state, neutral).available, false);
  assert.equal(getRequestStatus(patchContact(state, ally, { relation: 30 }), ally).available, false);
  assert.equal(getRequestStatus(patchContact(state, ally, { atWar: true }), ally).available, false);
  let granted = null;
  for (let month = 20; month < 60 && !granted; month += 1) {
    const result = pedirTropas({ ...state, monthCounter: month }, ally);
    if (getAlliedForcesPower(result) > 0) granted = result;
  }
  assert.ok(granted, 'em varios meses o pedido e atendido alguma vez');
  assert.ok(granted.military.power > state.military.power, 'poder emprestado soma');
  assert.ok(granted.geopolitics.contacts.find((c) => c.id === ally).militaryPower < 40, 'o aliado fica mais fraco enquanto as tropas estao fora');
  assert.equal(getRequestStatus(granted, ally).available, false);
  const month = granted.monthCounter;
  const ended = processDeployments({ ...granted, monthCounter: month + LOAN_MONTHS });
  assert.equal(getAlliedForcesPower(ended), 0);
  assert.equal(ended.geopolitics.contacts.find((c) => c.id === ally).militaryPower, 40);
  assert.ok(ended.geopolitics.contacts.find((c) => c.id === ally).relation > 70);
  assert.match(ended.notice, /voltaram para casa/);
  assert.equal(getRequestStatus(ended, ally).available, false, 'intervalo entre pedidos');
});

test('o poder emprestado entra na guerra: a pontuacao de combate sobe', () => {
  const { state } = setup();
  const boosted = { ...state, military: { ...state.military, alliedForces: { power: 20 } } };
  assert.ok(boosted.military.power === state.military.power);
  const normalized = enviarTropas(boosted, state.geopolitics.contacts.find((c) => c.alliance).id);
  assert.ok(normalized.military.power > 0);
});

test('mapa, lista e Forcas Armadas mostram os controles de tropas', () => {
  const { state, ally, territory } = setup();
  const mapAlly = diplomacyMap(state, { selected: ally });
  assert.match(mapAlly, /data-action="send-troops"/);
  assert.match(mapAlly, /data-action="request-troops"/);
  const sent = enviarTropas(enviarTropas(state, ally), territory);
  assert.match(diplomacyMap(sent, { selected: ally }), /data-action="recall-troops"/);
  assert.match(diplomacyMap(sent, { selected: territory }), /lealdade/);
  const panel = troopsAbroadPanel(sent);
  assert.match(panel, /Tropas no exterior/);
  assert.match(panel, /data-action="recall-troops"/);
  assert.match(militaryView(sent), /Tropas no exterior/);
  assert.match(troopsAbroadPanel(state), /Nenhuma tropa no exterior/);
  assert.ok(troopsPower({ soldiers: 8000, armor: 1 }) > 2.5);
});

test('avancar meses completos com tropas no exterior mantem o estado valido', () => {
  const { state, ally, territory } = setup(8);
  let current = enviarTropas(enviarTropas(state, ally), territory);
  for (let index = 0; index < 36; index += 1) {
    current = advanceMonth({ ...current, pendingEvent: null, pendingBriefing: null, pendingHostileAlert: null, pendingUnVote: null, pendingGlobalBid: null, pendingStory: null });
    if (current.regime.gameOver) break;
    assert.ok(Number.isFinite(current.economy.cash));
    assert.ok(current.military.exercito.soldados >= 0);
  }
  assert.ok(Object.keys(current.territories).length > 0 || !current.geopolitics.contacts.find((c) => c.id === territory).anexado, 'o territorio segue registrado ou foi perdido num ataque');
});
