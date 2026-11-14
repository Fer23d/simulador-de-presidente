import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceMonth, comprarItem, comprarNavio, createGameState, enviarEquipamento, hydrateGameState, retirarEquipamento } from '../src/core/game-state.js';
import { COUNTRIES } from '../src/data/countries.js';
import { EQUIPMENT, EQUIPMENT_BRANCHES, EQUIPMENT_LIST, LANDLOCKED, isLandlocked, normalizeEquipmentAbroad, normalizeEquipmentMap } from '../src/data/military_equipment.js';
import { ALLY_GIFT_CAP, getAbroad, getBuyStatus, getEquipmentPowerAt, getOwned, getSendStatus, listDestinations, processEquipment } from '../src/core/equipment.js';
import { calculateMilitaryMaintenance } from '../src/core/military.js';
import { getBaseForce } from '../src/core/offensives.js';
import { getDefenseScore } from '../src/core/territory_defense.js';
import { militaryView, troopsAbroadPanel } from '../src/ui/dashboard.js';

const mapContacts = (state, fn) => {
  const contacts = state.geopolitics.contacts.map(fn);
  return { ...state, geopolitics: { ...state.geopolitics, contacts }, world: contacts };
};
const patch = (state, id, change) => mapContacts(state, (c) => (c.id === id ? { ...c, ...change } : c));
const contact = (state, id) => state.geopolitics.contacts.find((c) => c.id === id);
const rich = (id = 'bra') => {
  const state = createGameState(id);
  return { ...state, monthCounter: 30, economy: { ...state.economy, cash: 5e12 }, country: { ...state.country, steel: 2_000_000 } };
};
// Aliados: Argentina (litoral) e Paraguai (sem litoral). Territorios: Chile (litoral) e Bolivia (sem litoral).
const world = (state = rich()) => {
  let next = patch(patch(state, 'arg', { alliance: true }), 'pry', { alliance: true });
  next = patch(patch(next, 'chl', { anexado: true, destruido: true }), 'bol', { anexado: true, destruido: true });
  return { ...next, territories: { chl: { loyalty: 70 }, bol: { loyalty: 70 } } };
};

test('o catalogo tem equipamentos reais nos tres setores, com custo e poder de fogo coerentes', () => {
  assert.deepEqual(Object.keys(EQUIPMENT_BRANCHES), ['exercito', 'marinha', 'aeronautica']);
  assert.equal(new Set(EQUIPMENT_LIST.map((item) => item.id)).size, EQUIPMENT_LIST.length);
  for (const branch of Object.keys(EQUIPMENT_BRANCHES)) assert.ok(EQUIPMENT_LIST.filter((item) => item.branch === branch).length >= 8, `${branch} precisa de pelo menos 8 itens`);
  const names = EQUIPMENT_LIST.map((item) => item.name).join(' | ');
  for (const word of ['F-16', 'F-22', 'F-35', 'Submarino', 'Porta-aviões', 'Destróier', 'Abrams', 'Leopard', 'Patriot', 'B-2']) assert.ok(names.includes(word), `faltou ${word}`);
  for (const item of EQUIPMENT_LIST) {
    assert.ok(item.cost > 0 && item.steel > 0 && item.firepower > 0, item.id);
    const efficiency = item.firepower / (item.cost / 1e9);
    assert.ok(efficiency > 0.25 && efficiency < 0.9, `${item.id} fora da faixa de custo-beneficio: ${efficiency.toFixed(2)}`);
    assert.equal(Boolean(item.naval), item.branch === 'marinha', `${item.id}: naval so na marinha`);
  }
  assert.ok(EQUIPMENT_LIST.filter((item) => item.strategic).length >= 3);
  assert.ok(EQUIPMENT.f22.firepower > EQUIPMENT.f16.firepower && EQUIPMENT.f22.cost > EQUIPMENT.f16.cost);
  assert.ok(EQUIPMENT.carrier.firepower > EQUIPMENT.destroyer.firepower);
});

test('paises sem saida para o mar estao marcados e os dados continuam consistentes', () => {
  const ids = new Set(COUNTRIES.map((c) => c.id));
  assert.ok([...LANDLOCKED].every((id) => ids.has(id)), 'nenhum codigo invalido');
  for (const id of ['bol', 'pry', 'che', 'aut', 'mng', 'npl', 'eth', 'uzb', 'afg', 'cze']) assert.equal(isLandlocked(id), true, id);
  for (const id of ['bra', 'arg', 'chl', 'usa', 'jpn', 'kaz', 'aze', 'twn', 'sgp']) assert.equal(isLandlocked(id), false, id);
  assert.deepEqual(normalizeEquipmentMap({ f16: 2.9, xx: 5, f22: -1, b2: 'a' }), { f16: 2 });
  assert.deepEqual(normalizeEquipmentAbroad({ chl: { f16: 1 }, arg: { zz: 1 }, x: 4 }), { chl: { f16: 1 } });
});

test('comprar equipamento gasta caixa e aco e soma poder de fogo', () => {
  const state = rich();
  const bought = comprarItem(state, 'f22');
  assert.equal(getOwned(bought, 'f22'), 1);
  assert.equal(bought.economy.cash, state.economy.cash - EQUIPMENT.f22.cost);
  assert.equal(bought.country.steel, state.country.steel - EQUIPMENT.f22.steel);
  assert.ok(bought.military.power > state.military.power, 'o poder total sobe');
  assert.ok(bought.military.power - state.military.power >= EQUIPMENT.f22.firepower * 0.5 * 0.9);
  assert.match(bought.notice, /F-22 Raptor adquirido/);
  assert.ok(calculateMilitaryMaintenance(bought.military) > calculateMilitaryMaintenance(state.military), 'tem manutencao mensal');
  const poor = { ...state, economy: { ...state.economy, cash: 1 } };
  assert.equal(getBuyStatus(poor, 'f16').available, false);
  assert.match(comprarItem(poor, 'f16').notice, /Caixa insuficiente/);
  const noSteel = { ...state, country: { ...state.country, steel: 1 } };
  assert.match(comprarItem(noSteel, 'f16').notice, /Aço insuficiente/);
  assert.match(comprarItem(state, 'inexistente').notice, /desconhecido/);
});

test('itens estrategicos exigem tecnologia militar liberada', () => {
  const state = rich();
  assert.match(getBuyStatus(state, 'b2').reason, /Mísseis balísticos/);
  assert.match(getBuyStatus(state, 'tactical_missile').reason, /Mísseis balísticos/);
  assert.match(getBuyStatus(state, 'nuclear_sub').reason, /urânio|nuclear/);
  const missiles = { ...state, unlocked_techs: ['missiles'] };
  assert.equal(getBuyStatus(missiles, 'b2').available, true);
  assert.equal(getBuyStatus(missiles, 'nuclear_sub').available, false);
  const civil = { ...missiles, military: { ...state.military, nuclear: { ...state.military.nuclear, civilOnline: true } } };
  assert.equal(getBuyStatus(civil, 'nuclear_sub').available, true, 'energia nuclear civil basta para a propulsao');
  assert.equal(getBuyStatus({ ...state, unlocked_techs: ['nuke'] }, 'nuclear_sub').available, true);
});

test('pais sem saida para o mar nao compra equipamento naval nem navios', () => {
  const state = rich('bol');
  assert.equal(getBuyStatus(state, 'destroyer').available, false);
  assert.match(getBuyStatus(state, 'destroyer').reason, /saída para o mar/);
  assert.equal(getBuyStatus(state, 'f16').available, true, 'avioes e blindados continuam disponiveis');
  assert.match(comprarNavio(state).notice, /não tem saída para o mar/);
  assert.equal(comprarNavio(state).military.marinha.navios, state.military.marinha.navios);
  assert.ok(comprarNavio(rich('bra')).military.marinha.navios > rich('bra').military.marinha.navios);
});

test('doar a um aliado: sai do estoque, reforca o aliado e melhora a relacao', () => {
  const state = comprarItem(world(), 'f16');
  const before = contact(state, 'arg');
  const sent = enviarEquipamento(state, 'f16', 'arg');
  assert.equal(getOwned(sent, 'f16'), 0);
  assert.ok(sent.economy.cash < state.economy.cash, 'frete');
  const after = contact(sent, 'arg');
  assert.equal(after.militaryPower, Math.min(100, before.militaryPower + EQUIPMENT.f16.firepower * 0.5));
  assert.ok(after.relation > before.relation);
  assert.ok(sent.military.power < state.military.power, 'a doacao tira poder de casa');
  assert.match(sent.notice, /doado a/);
  assert.match(enviarEquipamento(sent, 'f16', 'arg').notice, /não tem esse equipamento/);
});

test('regras reais de envio: sem litoral nao recebe navio, ativos estrategicos nao se doam e so aliados ou territorios recebem', () => {
  let state = comprarItem(comprarItem(comprarItem(world({ ...rich(), unlocked_techs: ['missiles', 'nuke'] }), 'destroyer'), 'carrier'), 'f16');
  assert.equal(getSendStatus(state, 'destroyer', 'arg').available, true);
  assert.match(getSendStatus(state, 'destroyer', 'pry').reason, /não tem saída para o mar/);
  assert.match(getSendStatus(state, 'destroyer', 'bol').reason, /não tem saída para o mar/, 'vale tambem para territorio sem litoral');
  assert.equal(getSendStatus(state, 'destroyer', 'chl').available, true);
  assert.match(getSendStatus(state, 'carrier', 'arg').reason, /Ativo estratégico/);
  assert.equal(getSendStatus(state, 'carrier', 'chl').available, true, 'porta-avioes so em territorio seu e com litoral');
  assert.match(getSendStatus(state, 'f16', 'twn').reason, /Só aliados e territórios/);
  assert.equal(getSendStatus(state, 'f16', 'pry').available, true, 'avioes podem ir a um aliado sem litoral');
  const options = listDestinations(state, 'destroyer');
  assert.deepEqual(options.map((o) => o.id).sort(), ['arg', 'bol', 'chl', 'pry']);
  assert.equal(options.find((o) => o.id === 'pry').available, false);
  assert.equal(options.find((o) => o.id === 'arg').available, true);
});

test('o aliado tem um teto de doacoes', () => {
  let state = world();
  state = patch(state, 'arg', { equipmentGiftPower: ALLY_GIFT_CAP });
  state = comprarItem(state, 'f16');
  assert.match(getSendStatus(state, 'f16', 'arg').reason, /já está bem equipado/);
  const fresh = comprarItem(world(), 'f22');
  const gifted = enviarEquipamento(fresh, 'f22', 'arg');
  assert.ok(contact(gifted, 'arg').equipmentGiftPower <= ALLY_GIFT_CAP);
});

test('posicionar em territorio: reforca a defesa e a ofensiva da base, tem manutencao e pode ser retirado', () => {
  let state = world();
  state = comprarItem(comprarItem(state, 'mbt_abrams'), 'sam_patriot');
  const defenseBefore = getDefenseScore(state, 'chl').score;
  const maintenanceHome = calculateMilitaryMaintenance(state.military);
  const sent = enviarEquipamento(enviarEquipamento(state, 'mbt_abrams', 'chl'), 'sam_patriot', 'chl');
  assert.deepEqual(getAbroad(sent, 'chl'), { mbt_abrams: 1, sam_patriot: 1 });
  assert.equal(getOwned(sent, 'mbt_abrams'), 0);
  assert.ok(sent.military.power < state.military.power, 'o poder em casa cai quando o equipamento sai');
  assert.ok(getEquipmentPowerAt(sent, 'chl') >= (EQUIPMENT.mbt_abrams.firepower + EQUIPMENT.sam_patriot.firepower) * 0.5);
  assert.ok(getDefenseScore(sent, 'chl').score > defenseBefore, 'a defesa do territorio sobe');
  assert.ok(getBaseForce(sent, 'chl').power > getBaseForce(state, 'chl').power, 'a forca de ofensiva da base sobe');
  assert.ok(calculateMilitaryMaintenance(sent.military) >= maintenanceHome, 'a manutencao continua sendo sua');
  const back = retirarEquipamento(sent, 'chl', 'mbt_abrams');
  assert.equal(getOwned(back, 'mbt_abrams'), 1);
  assert.deepEqual(getAbroad(back, 'chl'), { sam_patriot: 1 });
  assert.match(retirarEquipamento(back, 'chl', 'mbt_abrams').notice, /Não há esse equipamento/);
  assert.match(enviarEquipamento(comprarItem(world(), 'frigate'), 'frigate', 'bol').notice, /não tem saída para o mar/);
});

test('equipamento em territorio que deixa de ser seu volta pela metade', () => {
  let state = comprarItem(comprarItem(world(), 'f16'), 'f16');
  state = enviarEquipamento(enviarEquipamento(state, 'f16', 'chl'), 'f16', 'chl');
  assert.equal(getAbroad(state, 'chl').f16, 2);
  assert.equal(processEquipment(state), state, 'territorio ainda seu: nada muda');
  const lost = processEquipment(patch(state, 'chl', { anexado: false, destruido: false }));
  assert.equal(getAbroad(lost, 'chl').f16, undefined);
  assert.equal(getOwned(lost, 'f16'), 1);
  assert.match(lost.notice, /só metade voltou/);
});

test('o equipamento sobrevive a salvar e carregar e dados sujos sao limpos', () => {
  const state = enviarEquipamento(comprarItem(comprarItem(world(), 'f35'), 'f16'), 'f16', 'chl');
  const loaded = hydrateGameState(JSON.stringify(state));
  assert.equal(getOwned(loaded, 'f35'), 1);
  assert.deepEqual(getAbroad(loaded, 'chl'), { f16: 1 });
  assert.equal(loaded.military.power, state.military.power);
  const dirty = JSON.parse(JSON.stringify(state));
  dirty.military.equipment = { f35: -3, zz: 9, f22: 2 };
  dirty.military.equipmentAbroad = { chl: { f16: 'x', abc: 1 }, foo: { f22: 2 } };
  const cleaned = hydrateGameState(JSON.stringify(dirty));
  assert.deepEqual(cleaned.military.equipment, { f22: 2 });
  assert.deepEqual(cleaned.military.equipmentAbroad, { foo: { f22: 2 } });
  const legacy = JSON.parse(JSON.stringify(createGameState('bra')));
  delete legacy.military.equipment; delete legacy.military.equipmentAbroad;
  assert.deepEqual(hydrateGameState(JSON.stringify(legacy)).military.equipment, {});
});

test('a aba Forcas Armadas mostra um setor por vez com equipamentos, custos e envio', () => {
  const state = comprarItem(comprarItem(world(), 'f22'), 'destroyer');
  const closed = militaryView(state, {});
  assert.match(closed, /data-action="toggle-fold" data-branch="aeronautica" aria-expanded="false"/);
  assert.doesNotMatch(closed, /data-action="buy-equipment"/);
  assert.match(closed, /2 equipamento\(s\) em estoque|1 equipamento\(s\) em estoque/);
  const open = militaryView(state, { folds: { aeronautica: true } });
  assert.match(open, /aria-expanded="true"/);
  assert.match(open, /Caça de superioridade F-22 Raptor/);
  assert.match(open, /Poder de fogo 8\.2/);
  assert.match(open, /data-action="buy-equipment" data-item="f22"/);
  assert.match(open, /data-equip-dest="f22"/);
  assert.match(open, /data-action="send-equipment" data-item="f22"/);
  assert.doesNotMatch(open, /data-item="destroyer"/, 'cada setor tem a sua aba');
  const navy = militaryView(state, { folds: { marinha: true } });
  assert.match(navy, /data-item="destroyer"/);
  assert.ok(navy.includes('Destróier Arleigh Burke</strong>'));
  assert.match(navy, /<option value="pry" disabled>[^<]*não tem saída para o mar/);
  assert.match(navy, /<option value="chl" >/);
  const landlocked = militaryView(rich('bol'), {});
  assert.match(landlocked, /Sem saída para o mar/);
  assert.match(landlocked, /data-action="buy-ship" disabled/);
});

test('o painel de tropas no exterior lista os equipamentos posicionados', () => {
  const state = enviarEquipamento(comprarItem(world(), 'f16'), 'f16', 'chl');
  const panel = troopsAbroadPanel(state);
  assert.match(panel, /Equipamentos no exterior/);
  assert.match(panel, /1× Caça F-16 Fighting Falcon posicionado/);
  assert.match(panel, /data-action="recall-equipment" data-contact="chl" data-item="f16"/);
  assert.doesNotMatch(troopsAbroadPanel(world()), /Equipamentos no exterior/);
});

test('avancar meses completos com equipamentos em casa e no exterior mantem os numeros validos', () => {
  let state = comprarItem(comprarItem(world({ ...rich(), monthCounter: 8 }), 'f35'), 'mbt_leopard');
  state = enviarEquipamento(enviarEquipamento(state, 'f35', 'arg'), 'mbt_leopard', 'chl');
  for (let index = 0; index < 30; index += 1) {
    state = advanceMonth({ ...state, pendingEvent: null, pendingBriefing: null, pendingHostileAlert: null, pendingUnVote: null, pendingGlobalBid: null, pendingStory: null, pendingAllianceInvocation: null });
    if (state.regime.gameOver) break;
    assert.ok(Number.isFinite(state.economy.cash));
    assert.ok(Number.isFinite(state.military.power));
    state = { ...state, geopolitics: { ...state.geopolitics, peaceTreaty: null } };
  }
});
