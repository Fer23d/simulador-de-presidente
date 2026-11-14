import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceMonth, createGameState, enviarTropas } from '../src/core/game-state.js';
import { COUNTRIES } from '../src/data/countries.js';
import { COUNTRY_SPECIALTIES } from '../src/data/country_specialties.js';
import { getReinforcementStatus } from '../src/core/offensives.js';
import {
  SPECIALTIES, SPECIALTY_ORDER, describeMonthly, getAccess, getLogisticsBonus, getSpecialties, getStrength, getSupply, processSpecialties,
} from '../src/core/specialties.js';
import { diplomacyMap, diplomacyView, strategicPanel } from '../src/ui/dashboard.js';

const mapContacts = (state, fn) => {
  const contacts = state.geopolitics.contacts.map(fn);
  return { ...state, geopolitics: { ...state.geopolitics, contacts }, world: contacts };
};
const patch = (state, id, change) => mapContacts(state, (c) => (c.id === id ? { ...c, ...change } : c));
const contact = (state, id) => state.geopolitics.contacts.find((c) => c.id === id);
const base = (id = 'bra', month = 30) => ({ ...createGameState(id), monthCounter: month });

test('os 200 paises tem especialidades validas e o catalogo tem 8 tipos', () => {
  assert.equal(SPECIALTY_ORDER.length, 8);
  assert.deepEqual(Object.keys(SPECIALTIES).sort(), [...SPECIALTY_ORDER].sort());
  for (const country of COUNTRIES) {
    const list = COUNTRY_SPECIALTIES[country.id];
    assert.ok(Array.isArray(list) && list.length >= 1 && list.length <= 3, `${country.id} precisa de 1 a 3 especialidades`);
    assert.ok(list.every((type) => SPECIALTIES[type]), `${country.id} tem especialidade desconhecida`);
    assert.equal(new Set(list).size, list.length, `${country.id} repete especialidade`);
  }
  const ids = new Set(COUNTRIES.map((c) => c.id));
  assert.ok(Object.keys(COUNTRY_SPECIALTIES).every((id) => ids.has(id)), 'nenhum codigo sobrando');
  for (const type of SPECIALTY_ORDER) {
    const holders = COUNTRIES.filter((c) => getSpecialties(c.id).includes(type));
    assert.ok(holders.length >= 8, `${type} so existe em ${holders.length} paises`);
  }
  assert.deepEqual(getSpecialties('inexistente'), []);
});

test('as especialidades seguem a vocacao real de cada pais', () => {
  assert.equal(getSpecialties('twn')[0], 'tech');
  assert.deepEqual(getSpecialties('bra').slice(0, 2), ['food', 'minerals']);
  assert.equal(getSpecialties('ven')[0], 'energy');
  assert.equal(getSpecialties('sau')[0], 'energy');
  assert.equal(getSpecialties('pan')[0], 'logistics');
  assert.equal(getSpecialties('sgp')[0], 'finance');
  assert.equal(getSpecialties('usa')[0], 'tech');
  assert.ok(getSpecialties('chn').includes('industry'));
  assert.ok(getSpecialties('rus').includes('arms'));
  assert.ok(getSpecialties('chl').includes('minerals'));
});

test('o acesso depende de como voce controla o pais e cai com guerra, sancoes e embargos', () => {
  const state = base();
  const open = (change) => getAccess(patch(state, 'twn', change), contact(patch(state, 'twn', change), 'twn'));
  assert.equal(open({}), 0, 'sem relacao nenhuma, sem acesso');
  assert.equal(open({ tradeTreaty: true }), 0.4);
  assert.equal(open({ alliance: true }), 0.6);
  assert.equal(open({ puppet: true, is_puppet_of: 'jogador' }), 0.8);
  assert.equal(open({ tradeTreaty: true, atWar: true }), 0);
  assert.equal(open({ alliance: true, sancionado_por_jogador: true }), 0);
  assert.equal(open({ destruido: true }), 0);
  const annexed = patch(state, 'twn', { anexado: true, destruido: true });
  assert.equal(getAccess(annexed, contact(annexed, 'twn')), 0.65, 'lealdade 30 de partida: 0,5 + 30/200');
  const loyal = { ...annexed, territories: { twn: { loyalty: 100 } } };
  assert.equal(getAccess(loyal, contact(loyal, 'twn')), 1);
  const sanctioned = { ...patch(state, 'twn', { alliance: true }), geopolitics: { ...state.geopolitics, internationalSanctions: true, contacts: patch(state, 'twn', { alliance: true }).geopolitics.contacts } };
  assert.equal(getAccess(sanctioned, contact(sanctioned, 'twn')), 0.3, 'sancoes internacionais cortam metade');
});

test('o suprimento soma producao propria e fornecedores, com retorno decrescente', () => {
  const state = base('bra');
  const solo = getSupply(state);
  assert.ok(solo.food.strength > 0.4 && solo.food.strength < 0.8, 'o Brasil ja produz alimentos');
  assert.ok(solo.food.sources[0].domestic);
  assert.equal(solo.tech.strength, 0, 'sem fonte de tecnologia');
  const withTaiwan = patch(state, 'twn', { alliance: true });
  assert.ok(getSupply(withTaiwan).tech.strength > 0);
  const annexedTaiwan = patch(state, 'twn', { anexado: true, destruido: true });
  assert.ok(getSupply(annexedTaiwan).tech.strength > getSupply(withTaiwan).tech.strength, 'conquistar rende mais que se aliar');
  const second = patch(withTaiwan, 'usa', { alliance: true });
  const gainFirst = getSupply(withTaiwan).tech.strength - solo.tech.strength;
  const gainSecond = getSupply(second).tech.strength - getSupply(withTaiwan).tech.strength;
  assert.ok(gainSecond < gainFirst, 'a segunda fonte vale menos');
  assert.ok(Object.values(getSupply(second)).every((entry) => entry.strength >= 0 && entry.strength < 1));
  assert.deepEqual(getSupply({ ...state, is_wasteland: true }).food.sources.filter((s) => s.domestic), [], 'no Vault nao ha producao nacional');
});

test('guerra e sancoes cortam o recurso de quem estava abastecendo voce', () => {
  const state = patch(base('bra'), 'ven', { tradeTreaty: true });
  const before = getStrength(state, 'energy');
  assert.ok(before > getStrength(base('bra'), 'energy'));
  assert.ok(getStrength(patch(state, 'ven', { atWar: true }), 'energy') < before);
  assert.ok(getStrength(patch(state, 'ven', { sancionado_por_jogador: true }), 'energy') < before);
});

test('cada especialidade rende o seu efeito mensal', () => {
  const state = base('bra');
  const plain = processSpecialties(state);
  assert.ok(plain.economy.gdp > state.economy.gdp, 'energia e producao propria elevam o PIB');
  assert.ok(plain.economy.inflation < state.economy.inflation);
  const taiwan = processSpecialties(patch(state, 'twn', { alliance: true }));
  assert.ok(taiwan.technology.points > plain.technology.points, 'tecnologia rende pontos de pesquisa');
  const russia = processSpecialties(patch(state, 'rus', { puppet: true, is_puppet_of: 'jogador' }));
  assert.ok(russia.military_research_points > (plain.military_research_points ?? 0), 'armamentos rendem pesquisa militar');
  const chile = processSpecialties(patch(state, 'chl', { alliance: true }));
  assert.ok(chile.country.steel > plain.country.steel, 'minerios rendem aco');
  assert.ok(chile.country.rare_earths > plain.country.rare_earths);
  const singapore = processSpecialties(patch(state, 'sgp', { alliance: true }));
  assert.ok(singapore.economy.cash > plain.economy.cash, 'financas rendem caixa');
  const unrestState = { ...state, regime: { ...state.regime, unrest: 50 } };
  assert.ok(processSpecialties(unrestState).regime.unrest < 50, 'alimentos acalmam as ruas');
  const food = processSpecialties(patch(unrestState, 'arg', { alliance: true }));
  assert.ok(food.regime.unrest < processSpecialties(unrestState).regime.unrest);
});

test('o efeito e so bonus: sem acesso nada e punido, e o Vault e a partida encerrada nao processam', () => {
  const noAccess = base('ven');
  const result = processSpecialties(noAccess);
  assert.ok(result.economy.cash >= noAccess.economy.cash);
  assert.ok(result.economy.inflation <= noAccess.economy.inflation);
  assert.equal(processSpecialties({ ...noAccess, regime: { ...noAccess.regime, gameOver: true } }).economy.gdp, noAccess.economy.gdp);
  const wasteland = { ...noAccess, is_wasteland: true };
  assert.equal(processSpecialties(wasteland), wasteland);
  assert.match(describeMonthly('tech', 0.5), /4 Pontos de Pesquisa/);
  assert.equal(describeMonthly('energy', 0), 'sem efeito');
});

test('controlar portos e canais encurta em 1 mes a viagem dos reforcos', () => {
  let state = { ...base('bra'), territories: { rus: { loyalty: 80 } } };
  state = mapContacts(state, (c) => (c.id === 'rus' ? { ...c, anexado: true, destruido: true } : c));
  state = enviarTropas(enviarTropas(state, 'rus'), 'rus');
  const slow = getReinforcementStatus(state, 'rus');
  assert.ok(slow.available && slow.months >= 2);
  assert.equal(getLogisticsBonus(state), 0);
  const ports = patch(patch(patch(state, 'pan', { anexado: true, destruido: true }), 'egy', { anexado: true, destruido: true }), 'sgp', { anexado: true, destruido: true });
  assert.equal(getLogisticsBonus(ports), 1);
  assert.equal(getReinforcementStatus(ports, 'rus').months, slow.months - 1);
});

test('painel, cartao do pais, lista e filtro no mapa mostram as especialidades', () => {
  const state = patch(base('bra'), 'twn', { tradeTreaty: true });
  const panel = strategicPanel(state);
  assert.match(panel, /Recursos estratégicos/);
  for (const type of SPECIALTY_ORDER) assert.match(panel, new RegExp(`data-resource="${type}"`));
  assert.match(panel, /Brasil \(própria\)/);
  assert.match(panel, /data-action="toggle-strategic"/);
  const collapsed = strategicPanel(state, true);
  assert.match(collapsed, /is-collapsed/);
  assert.doesNotMatch(collapsed, /data-resource=/);
  assert.match(strategicPanel(state, false, 'tech'), /Limpar do mapa/);
  const card = diplomacyMap(state, { selected: 'twn' });
  assert.match(card, /Especialidades:<\/strong> 💾 Tecnologia · 🏭 Indústria/);
  assert.match(card, /Você aproveita 40% \(acordo comercial\)/);
  assert.match(diplomacyMap(base('bra'), { selected: 'twn' }), /Sem acesso hoje/);
  assert.match(diplomacyView(state), /specialty-badges/);
  const highlighted = diplomacyMap(state, { resource: 'tech' });
  assert.match(highlighted, /Mostrando no mapa os países com 💾/);
  const twn = highlighted.match(/<path[^>]*data-country="twn"[^>]*>|<circle[^>]*data-country="twn"[^>]*>/)?.[0] ?? '';
  const arg = highlighted.match(/<path[^>]*data-country="arg"[^>]*>/)?.[0] ?? '';
  assert.ok(twn && !twn.includes('is-dim'), 'quem tem a especialidade fica aceso');
  assert.ok(arg.includes('is-dim'), 'quem nao tem fica apagado');
});

test('avancar meses completos com especialidades mantem os numeros validos', () => {
  let state = patch(patch(base('bra', 8), 'twn', { alliance: true }), 'ven', { tradeTreaty: true });
  for (let index = 0; index < 30; index += 1) {
    state = advanceMonth({ ...state, pendingEvent: null, pendingBriefing: null, pendingHostileAlert: null, pendingUnVote: null, pendingGlobalBid: null, pendingStory: null, pendingAllianceInvocation: null });
    if (state.regime.gameOver) break;
    assert.ok(Number.isFinite(state.economy.gdp) && state.economy.gdp > 0);
    assert.ok(Number.isFinite(state.technology.points));
    assert.ok(state.country.steel >= 0);
    state = { ...state, geopolitics: { ...state.geopolitics, peaceTreaty: null } };
  }
});
