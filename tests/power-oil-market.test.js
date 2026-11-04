import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, hydrateGameState } from '../src/core/game-state.js';
import { transicionarParaWasteland, advanceWastelandMonth } from '../src/core/wasteland.js';
import { buildShelterRoom, repairShelterGenerator, upgradeShelterRoom, INITIAL_SHELTER_GRID } from '../src/core/shelter_engine.js';
import { BASE_POWER, checkRoomPower, getLightingGenerators, getPowerBudget, getPowerCapacity, isVaultLit, ROOM_ENERGY_DRAW } from '../src/core/power.js';
import { toggleGeneratorFuel } from '../src/core/oil_economy.js';
import { canTrade, describeOffer, getMarketTier, MARKET_SPECIALS, normalizeDarkMarket, priceWithReputation, rollDarkMarket, tradeAtMarket } from '../src/core/market.js';
import { adoptLayd } from '../src/core/companion.js';
import { generatorFuelView, marketReputationView, marketView } from '../src/ui/dashboard.js';

function vault(extra = {}) {
  const base = transicionarParaWasteland(createGameState('bra'));
  return { ...base, scrap: 20_000, oil: 500, shelter_supplies: { ...base.shelter_supplies, food: 100, energy: 100, oxygen: 300 }, ...extra };
}
const withGenerators = (state, count, level = 1) => {
  const grid = state.shelter_grid.map((row) => [...row]);
  for (let index = 0; index < count; index++) grid[1][index + 1] = { id: `generator-1-${index + 1}`, type: 'generator', floor: 1, column: index + 1, level, operational: true };
  return { ...state, shelter_grid: grid };
};

test('rooms spend energy and a new room is only allowed when the free energy covers it', () => {
  let state = vault();
  assert.equal(getPowerCapacity(state), BASE_POWER);
  assert.ok(getPowerBudget(state).free > 0);
  state = buildShelterRoom(state, 'greenhouse', 0, 2);
  assert.equal(state.shelter_grid[0][2].type, 'greenhouse', 'the first room fits in the emergency reactor');
  const blocked = buildShelterRoom(state, 'laboratory', 0, 3);
  assert.equal(blocked.shelter_grid[0][3], null, 'a second hungry room does not fit');
  assert.match(blocked.notice, /Energia insuficiente/);
  assert.match(blocked.notice, new RegExp(`${ROOM_ENERGY_DRAW.laboratory} de energia`));
  assert.equal(blocked.scrap, state.scrap, 'nothing is charged for a blocked build');
  const powered = repairShelterGenerator(buildShelterRoom(state, 'generator', 0, 3), 0, 3);
  assert.equal(powered.shelter_grid[0][3].type, 'generator', 'generators can always be built');
  assert.equal(buildShelterRoom(powered, 'laboratory', 0, 4).shelter_grid[0][4].type, 'laboratory', 'a working generator pays for the lab');
});

test('upgrading a room is also limited by free energy', () => {
  const grid = INITIAL_SHELTER_GRID.map((row) => [...row]);
  grid[0][2] = { id: 'laboratory-0-2', type: 'laboratory', floor: 0, column: 2, level: 3 };
  const state = { ...vault(), shelter_grid: grid, science: 5_000 };
  const blocked = upgradeShelterRoom(state, 0, 2);
  assert.equal(blocked.shelter_grid[0][2].level, 3);
  assert.match(blocked.notice, /Energia insuficiente/);
  const fixed = withGenerators({ ...state, shelter_grid: grid }, 1, 5);
  assert.equal(upgradeShelterRoom(fixed, 0, 2).shelter_grid[0][2].level, 4);
  assert.equal(checkRoomPower(state, 'generator').ok, true);
});

test('the monthly energy balance includes the draw of every room and the emergency reactor', () => {
  const base = vault();
  const before = advanceWastelandMonth({ ...base, shelter_supplies: { ...base.shelter_supplies, energy: 100 } }).shelter_supplies.energy;
  const built = buildShelterRoom(base, 'greenhouse', 0, 2);
  const after = advanceWastelandMonth({ ...built, shelter_supplies: { ...built.shelter_supplies, energy: 100 } }).shelter_supplies.energy;
  const spent = before - after;
  assert.ok(spent >= ROOM_ENERGY_DRAW.greenhouse && spent <= ROOM_ENERGY_DRAW.greenhouse + 3, 'the greenhouse costs its energy every month (' + spent + ')');
});

test('two generators running on oil keep the Vault lit; without oil they do not', () => {
  const two = withGenerators(vault(), 2);
  assert.equal(isVaultLit(two), false, 'two plain generators leave the Vault dark');
  assert.equal(getLightingGenerators(two), 2);
  const fueled = toggleGeneratorFuel(two);
  assert.equal(fueled.generator_fuel, true);
  assert.equal(getLightingGenerators(fueled), 3);
  assert.equal(isVaultLit(fueled), true, 'two oil-fed generators count as three');
  assert.equal(isVaultLit({ ...fueled, oil: 0 }), false, 'no barrels, no light');
  assert.equal(isVaultLit(toggleGeneratorFuel(withGenerators(vault(), 1))), false, 'one oil-fed generator is not enough');
  assert.equal(isVaultLit(withGenerators(vault(), 3)), true, 'three plain generators still work');
  assert.ok(getPowerCapacity(fueled) > getPowerCapacity(two), 'oil also raises the capacity');
});

test('the generator panel shows the lighting status and the power budget', () => {
  const dark = generatorFuelView(withGenerators(vault(), 2));
  assert.match(dark, /VAULT ESCURO À NOITE/);
  assert.match(dark, /dois geradores com petróleo bastam/);
  const lit = generatorFuelView(toggleGeneratorFuel(withGenerators(vault(), 2)));
  assert.match(lit, /VAULT ILUMINADO À NOITE/);
  assert.match(lit, /livres por mês/);
});

test('market reputation grows with every trade and lowers prices', () => {
  assert.equal(getMarketTier(0), 0);
  assert.equal(getMarketTier(25), 1);
  assert.equal(getMarketTier(100), 4);
  const offer = { id: 'sell-oil', kind: 'sell', res: 'oil', amount: 20, scrap: 100, left: 3 };
  const buy = { ...offer, id: 'buy-oil', kind: 'buy' };
  assert.ok(priceWithReputation(offer, 100) > priceWithReputation(offer, 0), 'known sellers earn more');
  assert.ok(priceWithReputation(buy, 100) < priceWithReputation(buy, 0), 'known buyers pay less');
  let state = { ...vault(), dark_market: rollDarkMarket(5), equippedSkin: 'hazmat', wasteland_day: 0, wasteland_turn: 5 };
  const before = state.market_rep;
  state = tradeAtMarket(state, 'sell-oil', 'hazmat');
  assert.ok(state.market_rep > before);
  const climbing = tradeAtMarket({ ...state, market_rep: 24, dark_market: rollDarkMarket(5) }, 'sell-oil', 'hazmat');
  assert.match(climbing.notice, /confiar mais em você \(nível 1\)/);
  assert.match(marketReputationView({ market_rep: 55 }), /NÍVEL 2/);
  assert.equal(hydrateGameState(JSON.stringify({ ...state, version: createGameState().version })).market_rep, state.market_rep);
});

test('the market brings special items and the rare ones need reputation', () => {
  const normal = rollDarkMarket(8, { rep: 0, layd: false });
  const specials = normal.offers.filter((offer) => offer.kind === 'special');
  assert.equal(specials.length, 2, 'only two generic specials exist without reputation or Layd');
  assert.equal(rollDarkMarket(8, { rep: 30, layd: true }).offers.filter((offer) => offer.kind === 'special').length, 3);
  assert.ok(specials.every((offer) => !MARKET_SPECIALS[offer.key].needsLayd && MARKET_SPECIALS[offer.key].minTier === 0));
  const keysSeen = new Set();
  for (let turn = 0; turn < 60; turn++) rollDarkMarket(turn, { rep: 90, layd: true }).offers.forEach((offer) => offer.kind === 'special' && keysSeen.add(offer.key));
  assert.ok(keysSeen.has('generator_overhaul') && keysSeen.has('vaccine') && keysSeen.has('refined_fuel'));
  const plain = new Set();
  for (let turn = 0; turn < 60; turn++) rollDarkMarket(turn, { rep: 0, layd: false }).offers.forEach((offer) => offer.kind === 'special' && plain.add(offer.key));
  assert.ok(!plain.has('generator_overhaul') && !plain.has('vaccine') && !plain.has('refined_fuel'));
  assert.deepEqual(normalizeDarkMarket(JSON.parse(JSON.stringify(normal))).offers.filter((offer) => offer.kind === 'special').map((offer) => offer.key), specials.map((offer) => offer.key));
});

test('special items do what they say: vaccine for Layd, energy, oxygen, fuel and a generator overhaul', () => {
  const base = withGenerators(adoptLayd({ ...vault(), wasteland_turn: 5, wasteland_day: 0, scrap: 5_000 }), 1);
  const market = { turn: 5, open: true, lastOpenDay: 3, merchant: 'Velho Corvo', offers: Object.keys(MARKET_SPECIALS).map((key) => ({ id: `special-${key}`, kind: 'special', key, amount: 1, scrap: MARKET_SPECIALS[key].scrap, left: 1 })) };
  let state = { ...base, dark_market: market, market_rep: 80, pendingStory: false };
  const vaccine = tradeAtMarket(state, 'special-vaccine', 'hazmat');
  assert.equal(vaccine.companion.vaccines, state.companion.vaccines + 1);
  assert.ok(vaccine.scrap < state.scrap);
  assert.equal(tradeAtMarket(state, 'special-layd_ration', 'hazmat').companion.ration, state.companion.ration + 6);
  assert.equal(tradeAtMarket(state, 'special-power_cells', 'hazmat').shelter_supplies.energy, state.shelter_supplies.energy + 260);
  assert.equal(tradeAtMarket(state, 'special-air_filters', 'hazmat').shelter_supplies.oxygen, state.shelter_supplies.oxygen + 220);
  assert.equal(tradeAtMarket(state, 'special-refined_fuel', 'hazmat').oil, state.oil + 40);
  const overhauled = tradeAtMarket(state, 'special-generator_overhaul', 'hazmat');
  assert.equal(overhauled.shelter_grid[1][1].level, 2);
  assert.equal(overhauled.dark_market.offers.find((offer) => offer.id === 'special-generator_overhaul').left, 0, 'one per visit');
  assert.equal(canTrade(overhauled, 'special-generator_overhaul', 'hazmat').ok, false);
  const noLayd = { ...state, companion: { ...state.companion, status: 'gone' } };
  assert.match(canTrade(noLayd, 'special-vaccine', 'hazmat').reason, /Layd/);
  assert.equal(canTrade(state, 'special-vaccine', 'default').ok, false, 'still needs the suit');
  assert.equal(canTrade({ ...state, scrap: 1 }, 'special-power_cells', 'hazmat').ok, false);
  const noGenerators = { ...state, shelter_grid: INITIAL_SHELTER_GRID };
  assert.match(canTrade(noGenerators, 'special-generator_overhaul', 'hazmat').reason, /gerador funcionando/);
});

test('the market panel shows the reputation and marks the special offers', () => {
  const state = { ...withGenerators(adoptLayd({ ...vault(), wasteland_turn: 5, wasteland_day: 0 }), 1), dark_market: rollDarkMarket(5, { rep: 60, layd: true }), market_rep: 60 };
  const view = marketView(state, 'hazmat');
  assert.match(view, /REPUTAÇÃO COM O COMBOIO: NÍVEL 2/);
  assert.match(view, /market-offer is-special/);
  assert.match(view, /sucatas/);
  assert.ok(describeOffer(state.dark_market.offers.find((offer) => offer.kind === 'special'), 60).special);
});
