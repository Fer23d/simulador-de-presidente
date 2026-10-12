import test from 'node:test';
import assert from 'node:assert/strict';

import {
  advanceMonth,
  changeTax,
  createGameState,
  attemptAutogolpe,
  fundNuclear,
  hydrateGameState,
  negotiate,
  proposeTreaty,
  setBudget,
  startWar,
  voteLaborLaw,
  voteLaw,
  anexarPais,
  exigirAnexacao,
  lancarAtaqueNuclear,
  resolvePeaceTreaty,
  createLeague,
  confirmarVotoSim,
  autorizarAniquilacaoNuclear,
  inviteToLeague,
} from '../src/core/game-state.js';

test('creates a game state for Brazil', () => {
  const state = createGameState('bra');
  assert.equal(state.country.id, 'bra');
  assert.deepEqual(state.news, []);
  assert.ok(state.ministers);
  assert.deepEqual(state.factions, { elite: 50, trabalhadores: 50, militares: 50, religiosos: 50 });
  assert.equal(Object.hasOwn(state.economy, 'popularity'), false);
});

test('keeps the five most recent news headlines', async () => {
  const { addNews } = await import('../src/core/game-state.js');
  const state = createGameState('bra');
  const result = ['um', 'dois', 'tres', 'quatro', 'cinco', 'seis'].reduce((next, text) => addNews(next, text), state);

  assert.equal(result.news.length, 5);
  assert.equal(result.news[0].text, 'seis');
});

test('changes only a recognized tax rate within its limits', () => {
  const state = createGameState('bra');
  const updated = changeTax(state, 'incomeTaxRate', 1);

  assert.equal(updated.budget.incomeTaxRate, 0.17);
  assert.equal(changeTax(state, 'other', 1), state);
});

test('falls back to a valid game state for corrupted serialized data', () => {
  assert.equal(hydrateGameState('{invalid').country.id, 'bra');
});

test('falls back to a valid game state for structurally corrupted saved arrays', () => {
  const corrupted = JSON.stringify({
    ...createGameState('bra'),
    congress: { blocs: [null] },
    history: [null],
  });
  const hydrated = hydrateGameState(corrupted);

  assert.equal(hydrated.congress.blocs.length, 4);
  assert.deepEqual(hydrated.history, []);
});

test('advancing a month updates the calendar and records history', () => {
  const state = createGameState('bra');
  const updated = advanceMonth(state);

  assert.equal(updated.calendar.month, 2);
  assert.equal(updated.history.length, 1);
});

test('opens the global games decision at the 120th monthly turn', () => {
  const state = { ...createGameState('bra'), monthCounter: 119 };
  const result = advanceMonth(state);

  assert.equal(result.pendingGlobalBid.status, 'pending');
});

test('blocks the monthly simulation while a peace treaty needs a decision', () => {
  const state = createGameState('bra');
  const prepared = { ...state, geopolitics: { ...state.geopolitics, peaceTreaty: { targetId: 'arg', status: 'pending' } } };

  const result = advanceMonth(prepared);

  assert.deepEqual(result.calendar, prepared.calendar);
  assert.match(result.notice, /Tratado de Paz/);
});

test('blocks the monthly simulation while a national crisis awaits a decision', () => {
  const state = { ...createGameState('bra'), pendingEvent: { id: 'test-crisis', options: [] } };

  const result = advanceMonth(state);

  assert.deepEqual(result.calendar, state.calendar);
  assert.match(result.notice, /crise nacional/i);
});

test('negotiation returns a message and preserves a valid state', () => {
  const state = createGameState('bra');
  const updated = negotiate(state, 'center');

  assert.equal(typeof updated.notice, 'string');
  assert.ok(updated.economy.cash >= 0);
});

test('labor vote stores its result after approval or rejection', () => {
  const updated = voteLaborLaw(createGameState('bra'));

  assert.equal(updated.laws.laborReform.voteCompleted, true);
  assert.equal(typeof updated.notice, 'string');
});

test('labor law needs negotiation before it wins a majority in Brazil', () => {
  const state = createGameState('bra');
  const rejected = voteLaborLaw(state);
  const negotiated = negotiate(state, 'center');
  const approved = voteLaborLaw(negotiated);

  assert.equal(rejected.laws.laborReform.approved, false);
  assert.equal(approved.laws.laborReform.approved, true);
});

test('tracks separate votes for multiple congressional laws', () => {
  const state = createGameState('bra');
  const updated = voteLaw(state, 'tax-reform');

  assert.equal(updated.laws.taxReform.voteCompleted, true);
  assert.equal(updated.laws.laborReform.voteCompleted, false);
});

test('confirms a congressional law through the same voting rules', () => {
  const state = createGameState('bra');
  const result = confirmarVotoSim(state, 'tax-reform');

  assert.equal(result.laws.taxReform.voteCompleted, true);
  assert.equal(result.activeLawIds.includes('tax-reform'), result.laws.taxReform.approved);
});

test('obliterates an active war target only after nuclear authorization', () => {
  const state = createGameState('bra');
  const prepared = {
    ...state,
    country: { ...state.country, uranium: 101 },
    technology: { ...state.technology, unlocked: ['efficient-fission'] },
    military: { ...state.military, nuclear: { ...state.military.nuclear, bombBuilt: true } },
    geopolitics: {
      ...state.geopolitics,
      contacts: state.geopolitics.contacts.map((contact) => contact.id === 'arg'
        ? { ...contact, atWar: true, population: 1_000_000, populacao_base: 1_000_000, pib_base: 500_000_000_000, militaryPower: 80, military: { exercito: { soldados: 20_000, blindados: 8 }, marinha: { navios: 3 }, aeronautica: { cacas: 5 } } }
        : contact),
    },
  };

  const blocked = autorizarAniquilacaoNuclear(prepared, 'arg', 'NAO');
  const result = autorizarAniquilacaoNuclear(prepared, 'arg', 'KABOOM');
  const target = result.geopolitics.contacts.find((contact) => contact.id === 'arg');

  assert.equal(blocked.geopolitics, prepared.geopolitics);
  assert.equal(target.wasteland, true);
  assert.equal(target.population, 0);
  assert.equal(target.populacao_base, 0);
  assert.equal(target.pib_base, 0);
  assert.equal(target.militaryPower, 0);
  assert.equal(result.geopolitics.onuScore, 0);
  assert.equal(result.nuclearSanctionsPending, true);
});

test('migrates a version 1 save with negative cash intact', () => {
  const legacy = createGameState('bra');
  legacy.version = 1;
  legacy.economy.cash = -500;

  assert.equal(hydrateGameState(JSON.stringify(legacy)).economy.cash, -500);
});

test('blocks progression after a terminal regime outcome', () => {
  const state = {
    ...createGameState('bra'),
    regime: { type: 'democracy', gameOver: true, outcome: 'golpe-militar' },
  };

  assert.deepEqual(advanceMonth(state).calendar, state.calendar);
});

test('monthly terminal defeat triggers an active Dead Hand network', () => {
  const state = createGameState('bra');
  const prepared = {
    ...state,
    dead_hand_active: true,
    country: { ...state.country, uranium: 1 },
    factions: { ...state.factions, militares: 10 },
  };
  const result = advanceMonth(prepared);

  assert.equal(result.dead_hand_triggered, true);
  assert.equal(result.country.wasteland, true);
});

test('updates a spending slider through the state command', () => {
  assert.equal(setBudget(createGameState('bra'), 'defenseSpend', 0.07).budget.defenseSpend, 0.07);
});

test('approves labor law by decree in dictatorship', () => {
  const state = {
    ...createGameState('bra'),
    regime: { type: 'dictatorship', gameOver: false, outcome: null },
  };

  assert.equal(voteLaborLaw(state).laws.laborReform.approved, true);
});

test('integrates diplomatic, nuclear, and war commands', () => {
  const state = createGameState('bra');
  const treaty = proposeTreaty(state, 'arg');
  const war = startWar(state, 'arg');
  const nuclear = fundNuclear(state, 'civil', 5_000_000_000);

  assert.equal(treaty.geopolitics.contacts.find((item) => item.id === 'arg').tradeTreaty, true);
  assert.equal(war.geopolitics.contacts.find((item) => item.id === 'arg').atWar, true);
  assert.ok(nuclear.military.nuclear.civilProgress > 0);
});

test('false flag grants ONU amnesty only for its marked war target', () => {
  const state = createGameState('bra');
  const marked = startWar({ ...state, just_war_target: 'arg' }, 'arg');
  const unmarked = startWar({ ...state, just_war_target: 'arg' }, 'usa');

  assert.equal(marked.geopolitics.onuScore, state.geopolitics.onuScore);
  assert.equal(unmarked.geopolitics.onuScore, state.geopolitics.onuScore - 18);
});

test('a refused false-flag ultimatum also preserves ONU reputation', () => {
  const state = createGameState('bra');
  const prepared = {
    ...state,
    just_war_target: 'arg',
    randomSeed: 1714,
    military: { ...state.military, exercito: { ...state.military.exercito, soldados: 3_000_000 } },
  };
  const result = exigirAnexacao(prepared, 'arg');

  assert.equal(result.geopolitics.onuScore, state.geopolitics.onuScore);
  assert.equal(result.geopolitics.contacts.find((contact) => contact.id === 'arg').atWar, true);
});

test('every peace treaty outcome consumes false flag legitimacy', () => {
  const state = createGameState('bra');
  for (const choice of ['annex', 'loot', 'demilitarize', 'reparations']) {
    const prepared = {
      ...state,
      just_war_target: 'arg',
      geopolitics: {
        ...state.geopolitics,
        peaceTreaty: { targetId: 'arg', status: 'pending' },
        contacts: state.geopolitics.contacts.map((contact) => contact.id === 'arg' ? { ...contact, militaryPower: 0 } : contact),
      },
    };
    assert.equal(resolvePeaceTreaty(prepared, 'arg', choice).just_war_target, null);
  }
});

test('can change to dictatorship only after the military conditions are met', () => {
  const state = createGameState('bra');
  const eligible = { ...state, military: { ...state.military, support: 61, exercito: { soldados: 200_000, blindados: 25 } } };

  const result = attemptAutogolpe(eligible);
  assert.equal(result.regime.type, 'dictatorship');
  assert.ok(Object.values(result.laws).every((law) => law.approved));
});

test('blocks state-changing commands after the game ends', () => {
  const state = { ...createGameState('bra'), regime: { ...createGameState('bra').regime, gameOver: true } };

  assert.equal(startWar(state, 'arg').geopolitics, state.geopolitics);
  assert.equal(setBudget(state, 'defenseSpend', 0.1).budget, state.budget);
});

test('keeps a saved zero spending rate and recovers malformed military data', () => {
  const saved = createGameState('bra');
  saved.budget.defenseSpend = 0;
  saved.military = {};
  const hydrated = hydrateGameState(JSON.stringify(saved));

  assert.equal(hydrated.budget.defenseSpend, 0);
  assert.ok(hydrated.military.nuclear);
});

test('preserves the cabinet, news and a pending crisis in a saved game', () => {
  const saved = createGameState('bra');
  saved.ministers.economy = { id: 'economy' };
  saved.news = [{ text: 'Manchete persistida.', calendar: { month: 1, year: 2026 } }];
  saved.pendingEvent = { id: 'severe-drought' };

  const hydrated = hydrateGameState(JSON.stringify(saved));

  assert.equal(hydrated.ministers.economy.id, 'economy');
  assert.equal(hydrated.news[0].text, 'Manchete persistida.');
  assert.equal(hydrated.pendingEvent.id, 'severe-drought');
});

test('migrates an older military save with army management defaults', () => {
  const saved = createGameState('bra');
  saved.version = 3;
  delete saved.military.soldiers;
  delete saved.military.equipmentMultiplier;
  const hydrated = hydrateGameState(JSON.stringify(saved));

  assert.ok(hydrated.military.soldiers > 0);
  assert.ok(hydrated.military.exercito);
  assert.ok(hydrated.military.marinha);
  assert.ok(hydrated.military.aeronautica);
});

test('preserves the Dead Hand wasteland state when reloading a terminal save', () => {
  const state = createGameState('bra');
  const destroyed = {
    ...state,
    dead_hand_triggered: true,
    country: { ...state.country, wasteland: true, populacao: 0, populacao_base: 0, pib_base: 0 },
    economy: { ...state.economy, gdp: 0, cash: 0 },
  };
  const hydrated = hydrateGameState(JSON.stringify(destroyed));

  assert.equal(hydrated.country.wasteland, true);
  assert.equal(hydrated.country.populacao_base, 0);
  assert.equal(hydrated.country.pib_base, 0);
  assert.equal(hydrated.economy.gdp, 0);
});

test('annexation transfers target territory, population and GDP and records the target as annexed', () => {
  const state = createGameState('bra');
  const target = state.geopolitics.contacts.find((contact) => contact.id === 'arg');
  target.militaryPower = 0;
  const annexed = anexarPais(state, 'arg');

  assert.equal(annexed.country.area_km2, state.country.area_km2 + 2780400);
  assert.equal(annexed.country.populacao_base, state.country.populacao_base + 45808747);
  assert.ok(annexed.country.pib_base > state.country.pib_base);
  assert.ok(annexed.geopolitics.annexedCountryIds.includes('arg'));
  assert.equal(annexed.geopolitics.contacts.find((contact) => contact.id === 'arg').anexado, true);
});

test('turns a refused annexation ultimatum into war and accepts overwhelming peaceful annexation', () => {
  const state = createGameState('bra');
  const strong = {
    ...state,
    military: { ...state.military, exercito: { ...state.military.exercito, blindados: 200 } },
    randomSeed: 1,
  };
  const result = exigirAnexacao(strong, 'arg');

  assert.ok(result.geopolitics.contacts.find((contact) => contact.id === 'arg').anexado || result.geopolitics.contacts.find((contact) => contact.id === 'arg').atWar);
});

test('nuclear strike devastates an active war target and ends every alliance', () => {
  const state = startWar(createGameState('bra'), 'arg');
  const armed = { ...state, military: { ...state.military, armasNucleares: 1 } };
  const target = armed.geopolitics.contacts.find((contact) => contact.id === 'arg');
  const result = lancarAtaqueNuclear(armed, 'arg');
  const attacked = result.geopolitics.contacts.find((contact) => contact.id === 'arg');

  assert.equal(attacked.militaryPower, target.militaryPower * 0.2);
  assert.equal(attacked.population, Math.floor(target.population * 0.2));
  assert.equal(result.geopolitics.onuScore, 0);
  assert.ok(result.geopolitics.contacts.every((contact) => contact.alliance === false));
});

test('transfers an annexed target and removes it from active diplomacy', () => {
  const state = createGameState('bra');
  const prepared = {
    ...state,
    geopolitics: {
      ...state.geopolitics,
      peaceTreaty: { targetId: 'arg', status: 'pending' },
      contacts: state.geopolitics.contacts.map((contact) => contact.id === 'arg' ? { ...contact, militaryPower: 0 } : contact),
    },
  };
  const result = resolvePeaceTreaty(prepared, 'arg', 'annex');

  assert.equal(result.geopolitics.contacts.find((contact) => contact.id === 'arg').destruido, true);
  assert.equal(result.geopolitics.peaceTreaty, null);
});

test('transfers eighty percent of target cash when peace treaty is looted', () => {
  const state = createGameState('bra');
  const prepared = {
    ...state,
    geopolitics: {
      ...state.geopolitics,
      peaceTreaty: { targetId: 'arg', status: 'pending' },
      contacts: state.geopolitics.contacts.map((contact) => contact.id === 'arg' ? { ...contact, militaryPower: 0, cash: 10_000 } : contact),
    },
  };
  const result = resolvePeaceTreaty(prepared, 'arg', 'loot');

  assert.equal(result.economy.cash, state.economy.cash + 8_000);
  assert.equal(result.geopolitics.contacts.find((contact) => contact.id === 'arg').cash, 2_000);
  assert.equal(result.geopolitics.contacts.find((contact) => contact.id === 'arg').relation, -100);
});

test('creates a league and invites a closely aligned contact', () => {
  const state = createGameState('bra');
  const league = createLeague(state, 'Liga Atlantica');
  const eligible = {
    ...league,
    geopolitics: { ...league.geopolitics, contacts: league.geopolitics.contacts.map((contact) => contact.id === 'arg' ? { ...contact, relation: 90 } : contact) },
  };
  const result = inviteToLeague(eligible, 'arg');

  assert.equal(league.geopolitics.league.leaderId, 'bra');
  assert.equal(result.geopolitics.league.memberIds.includes('arg'), true);
});
