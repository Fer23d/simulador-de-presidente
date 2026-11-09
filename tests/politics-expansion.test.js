import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceMonth, answerCongressDemand, answerOppositionBill, applyElectionAction, createGameState, hydrateGameState } from '../src/core/game-state.js';
import { advanceEconomy, DEFAULT_BUDGET } from '../src/core/economy.js';
import { SECTOR_IDS, advanceSectors, createSectors, getEmploymentShares, normalizeSectors } from '../src/core/sectors.js';
import { INDICATOR_HISTORY_LIMIT, recordIndicators } from '../src/core/indicators.js';
import { CAMPAIGN_MONTHS, ELECTION_TERM_MONTHS, getPollingShare, isCampaign, monthsToElection, processElection } from '../src/core/elections.js';
import { OPPOSITION_BILLS, normalizeCongressLife, processCongressLife } from '../src/core/congress_life.js';
import { getVoteForecast } from '../src/core/congress.js';
import { COUNTRY_COORDS } from '../src/data/country_coords.js';
import { COUNTRIES } from '../src/data/countries.js';
import { congressView, diplomacyMap, diplomacyView } from '../src/ui/dashboard.js';

const base = (patch = {}) => ({ ...createGameState('bra'), ...patch });
const sumShares = (sectors) => SECTOR_IDS.reduce((sum, id) => sum + sectors[id].share, 0);

test('setores somam 100% e o crescimento total nao muda pelos ajustes', () => {
  const sectors = createSectors(7);
  assert.ok(Math.abs(sumShares(sectors) - 1) < 1e-9);
  const step = advanceSectors(sectors, 0.003, { infrastructure: 0.02, education: 0.01, interestGap: 0.1 });
  const weighted = SECTOR_IDS.reduce((sum, id) => sum + sectors[id].share * step.sectors[id].growth, 0);
  assert.ok(Math.abs(weighted - 0.003) < 1e-6, 'media ponderada igual ao crescimento do PIB');
  assert.ok(Math.abs(sumShares(step.sectors) - 1) < 1e-9);
  assert.ok(Math.abs(Object.values(getEmploymentShares(sectors)).reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

test('infraestrutura favorece a industria e juros altos a sufocam', () => {
  const sectors = createSectors(3);
  const infra = advanceSectors(sectors, 0.003, { infrastructure: 0.03 }).sectors;
  const tight = advanceSectors(sectors, 0.003, { interestGap: 0.2 }).sectors;
  assert.ok(infra.industry.growth > tight.industry.growth);
  assert.equal(normalizeSectors(undefined, 1).agro.share > 0, true);
});

test('a economia avanca com setores e o jogo salva e carrega o historico', () => {
  const state = base();
  const next = advanceEconomy(state.economy, DEFAULT_BUDGET);
  assert.ok(next.sectors && Math.abs(sumShares(next.sectors) - 1) < 1e-9);
  const month = advanceMonth(state);
  assert.equal(month.indicatorHistory.gdp.length, 2);
  const loaded = hydrateGameState(JSON.stringify(month));
  assert.equal(loaded.indicatorHistory.cash.length, 2);
  let history = month.indicatorHistory;
  for (let index = 0; index < INDICATOR_HISTORY_LIMIT + 5; index++) history = recordIndicators(history, month.economy, 55);
  assert.equal(history.gdp.length, INDICATOR_HISTORY_LIMIT);
});

test('eleicao: campanha abre 3 meses antes, vitoria reelege e derrota encerra', () => {
  assert.equal(ELECTION_TERM_MONTHS, 48);
  assert.equal(isCampaign(base({ monthCounter: 10 })), false);
  const campaign = base({ monthCounter: ELECTION_TERM_MONTHS - CAMPAIGN_MONTHS + 1 });
  assert.equal(isCampaign(campaign), true);
  assert.equal(monthsToElection(campaign), CAMPAIGN_MONTHS - 1);
  const popular = base({ monthCounter: ELECTION_TERM_MONTHS, factions: { elite: 90, trabalhadores: 90, militares: 90, religiosos: 90 } });
  const won = processElection(popular);
  assert.equal(won.election.lastResult.won, true);
  assert.equal(won.election.nextMonth, ELECTION_TERM_MONTHS * 2);
  assert.equal(won.presidentialMandate.term, 2);
  const hated = base({ monthCounter: ELECTION_TERM_MONTHS, factions: { elite: 5, trabalhadores: 5, militares: 5, religiosos: 5 } });
  const lost = processElection(hated);
  assert.equal(lost.regime.gameOver, true);
  assert.equal(lost.regime.outcome, 'derrota-eleitoral');
  const dictatorship = base({ monthCounter: ELECTION_TERM_MONTHS, regime: { ...base().regime, type: 'dictatorship' } });
  assert.equal(processElection(dictatorship).regime.gameOver, false);
});

test('campanha: propaganda custa caixa e soma pontos na pesquisa, uma vez por mes', () => {
  const state = base({ monthCounter: ELECTION_TERM_MONTHS - 1 });
  const before = getPollingShare(state);
  const next = applyElectionAction(state, 'advertising');
  assert.ok(getPollingShare(next) > before);
  assert.ok(next.economy.cash < state.economy.cash);
  assert.equal(applyElectionAction(next, 'advertising').election.campaignBonus, next.election.campaignBonus);
  assert.match(applyElectionAction(base({ monthCounter: 5 }), 'advertising').notice, /campanha/i);
});

test('lealdade das bancadas muda o resultado da votacao', () => {
  const state = base();
  const congress = (loyalty) => ({ ...state.congress, blocs: state.congress.blocs.map((bloc) => ({ ...bloc, support: 0.5, loyalty })) });
  assert.ok(getVoteForecast(congress(90), state.factions).votesFor > getVoteForecast(congress(10), state.factions).votesFor);
});

test('Congresso: bancada cobra favor, conceder custa caixa e recusar derruba a lealdade', () => {
  let state = base({ monthCounter: 20 });
  for (let month = 20; month < 200 && !normalizeCongressLife(state.congressLife).demand; month++) {
    state = processCongressLife({ ...state, monthCounter: month, congress: { ...state.congress, blocs: state.congress.blocs.map((bloc) => ({ ...bloc, loyalty: 30 })) } });
  }
  const demand = normalizeCongressLife(state.congressLife).demand;
  assert.ok(demand, 'algum mes gera um pedido');
  const accepted = answerCongressDemand(state, true);
  assert.ok(accepted.economy.cash < state.economy.cash);
  assert.equal(normalizeCongressLife(accepted.congressLife).demand, null);
  const refused = answerCongressDemand(state, false);
  const before = state.congress.blocs.find((bloc) => bloc.id === demand.blocId).loyalty;
  assert.ok(refused.congress.blocs.find((bloc) => bloc.id === demand.blocId).loyalty < before);
});

test('Congresso: projeto da oposicao pode ser sancionado ou vetado e expira em lei', () => {
  const state = base({ monthCounter: 10, congressLife: { demand: null, bill: { id: 'wealth_tax', deadline: 12 }, lastBillMonth: 10 } });
  const sanctioned = answerOppositionBill(state, 'sanction');
  assert.ok(sanctioned.economy.cash > state.economy.cash);
  assert.equal(normalizeCongressLife(sanctioned.congressLife).bill, null);
  const vetoed = answerOppositionBill(state, 'veto');
  assert.ok(vetoed.congress.blocs.find((bloc) => bloc.id === 'left').loyalty < 50);
  const expired = processCongressLife({ ...state, monthCounter: 12 });
  assert.notEqual(normalizeCongressLife(expired.congressLife).bill?.id, 'wealth_tax');
  assert.ok(Object.keys(OPPOSITION_BILLS).length >= 4);
});

test('o mapa tem coordenadas para todos os paises e a diplomacia mostra o mapa', () => {
  const missing = COUNTRIES.filter((country) => !COUNTRY_COORDS[country.id]);
  assert.deepEqual(missing.map((country) => country.id), []);
  const state = base();
  const first = state.geopolitics.contacts[0].id;
  const html = diplomacyView(state, '', { selected: first, filter: 'hostile' });
  assert.match(html, /bubble-map/);
  assert.match(html, /data-action="map-country"/);
  assert.match(html, /map-chip/);
  assert.match(diplomacyMap(state, { selected: first }), /map-country-card/);
});

test('Congresso mostra a coalizao das bancadas', () => {
  assert.match(congressView(base()), /Coalizão e articulação/);
});
