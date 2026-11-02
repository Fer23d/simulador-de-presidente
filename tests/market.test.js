import test from 'node:test';
import assert from 'node:assert/strict';
import { canTrade, getStock, hasMarketSuit, isMarketOpen, normalizeDarkMarket, rollDarkMarket, tradeAtMarket } from '../src/core/market.js';
import { createGameState, hydrateGameState } from '../src/core/game-state.js';
import { advanceWastelandMonth, transicionarParaWasteland } from '../src/core/wasteland.js';
import { marketView } from '../src/ui/dashboard.js';
import { getMarketRect, isMarketAt, renderMarket } from '../src/core/market_renderer.js';
import { OIL_SLOT_X } from '../src/core/oil_renderer.js';

function vault(extra = {}) {
  const base = transicionarParaWasteland(createGameState());
  return { ...base, oil: 100, scrap: 200, shelter_supplies: { weapons: 10, medkits: 10, food: 100, energy: 100, oxygen: 100 },
    dark_market: rollDarkMarket(0), ...extra };
}

test('the market stall stands after the last oil derrick', () => {
  assert.ok(getMarketRect().centerX > OIL_SLOT_X.at(-1) + 150);
  assert.equal(isMarketAt(getMarketRect().centerX, getMarketRect().groundY - 40), true);
  assert.equal(isMarketAt(OIL_SLOT_X[0], getMarketRect().groundY - 40), false);
});

test('each month brings a market with sell and buy offers whose prices change', () => {
  const march = rollDarkMarket(3);
  assert.equal(march.open, true);
  assert.ok(march.offers.some((o) => o.kind === 'sell' && o.res === 'oil'));
  assert.ok(march.offers.some((o) => o.kind === 'sell' && o.res === 'food'));
  assert.ok(march.offers.some((o) => o.kind === 'buy'));
  assert.deepEqual(rollDarkMarket(3), march, 'same month, same offers');
  assert.notDeepEqual(rollDarkMarket(4).offers.map((o) => o.scrap), march.offers.map((o) => o.scrap));
  assert.equal(march.lastOpenDay, 3, 'the market remains through the third Vault day');
  for (const res of ['oil', 'food', 'medkits', 'weapons']) {
    const sell = march.offers.find((o) => o.id === `sell-${res}`);
    const buy = march.offers.find((o) => o.id === `buy-${res}`);
    if (sell && buy) assert.ok(sell.scrap < buy.scrap, `${res}: selling pays less than buying costs`);
  }
});

test('the market closes on the fourth day and reopens next month', () => {
  const state = vault();
  assert.equal(isMarketOpen(state), true);
  assert.equal(isMarketOpen({ ...state, wasteland_day: 3 }), true);
  assert.equal(isMarketOpen({ ...state, wasteland_day: 4 }), false);
  assert.equal(isMarketOpen({ ...state, wasteland_turn: 1, wasteland_day: 0, dark_market: rollDarkMarket(1) }), true);
});

test('closing a Vault month opens a new market', () => {
  const next = advanceWastelandMonth({ ...vault(), dark_market: null });
  assert.equal(isMarketOpen(next), true);
  assert.equal(next.dark_market.turn, next.wasteland_turn);
});

test('only the anti-radiation suit lets the player trade', () => {
  const state = vault();
  assert.equal(hasMarketSuit('hazmat'), true);
  assert.equal(hasMarketSuit('default'), false);
  const refused = canTrade(state, 'sell-oil', 'default');
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /Traje Antirradiação/);
  assert.equal(tradeAtMarket(state, 'sell-oil', 'default').oil, 100, 'nothing changes without the suit');
  assert.equal(canTrade(state, 'sell-oil', 'hazmat').ok, true);
});

test('selling and buying move goods and scrap, and each offer runs out after three trades', () => {
  let state = vault();
  const sellOil = state.dark_market.offers.find((o) => o.id === 'sell-oil');
  state = tradeAtMarket(state, 'sell-oil', 'hazmat');
  assert.equal(state.oil, 100 - sellOil.amount);
  assert.equal(state.scrap, 200 + sellOil.scrap);
  const buyFood = state.dark_market.offers.find((o) => o.id === 'buy-food');
  const food = getStock(state, 'food');
  state = tradeAtMarket(state, 'buy-food', 'hazmat');
  assert.equal(getStock(state, 'food'), food + buyFood.amount);
  assert.equal(state.scrap, 200 + sellOil.scrap - buyFood.scrap);
  for (let i = 0; i < 3; i++) state = tradeAtMarket({ ...state, oil: 500 }, 'sell-oil', 'hazmat');
  assert.equal(canTrade({ ...state, oil: 500 }, 'sell-oil', 'hazmat').ok, false, 'sold out for the month');
  assert.equal(canTrade({ ...state, scrap: 0 }, 'buy-weapons', 'hazmat').ok, false, 'no scrap, no purchase');
  assert.equal(canTrade({ ...state, oil: 1 }, 'sell-oil', 'hazmat').ok, false, 'not enough oil');
});

test('the market panel shows offers, locks them without the suit and survives a save', () => {
  const state = vault();
  assert.match(marketView(state, 'hazmat'), /data-action="market-trade"/);
  assert.doesNotMatch(marketView(state, 'hazmat'), /SEM PROTEÇÃO/);
  assert.match(marketView(state, 'default'), /SEM PROTEÇÃO/);
  assert.match(marketView(state, 'default'), /disabled/);
  assert.match(marketView({ ...state, dark_market: null }, 'hazmat'), /3 dias por mês/);
  const loaded = hydrateGameState(JSON.stringify({ ...state, version: createGameState().version }));
  assert.deepEqual(loaded.dark_market, state.dark_market);
  assert.equal(normalizeDarkMarket({ open: true, offers: [{ kind: 'sell', res: 'gold', amount: 5, scrap: 5 }] }), null);
});

test('the stall can be drawn', () => {
  const calls = [];
  const ctx = new Proxy({}, { get: (target, name) => {
    if (name === 'createLinearGradient' || name === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (name === 'measureText') return () => ({ width: 40 });
    return (...args) => { calls.push(name); return args; };
  }, set: () => true });
  renderMarket(ctx, vault().dark_market, { time: 500, night: true });
  assert.ok(calls.includes('fill'));
  renderMarket(ctx, null);
});

test('the elevator takes the player to the surface only with the anti-radiation suit', async () => {
  const { createRpgPlayer, getElevatorPrompt, normalizeRpgPlayer, updatePlayer, SURFACE_FLOOR } = await import('../src/core/rpg_bunker.js');
  const { cellCenter } = await import('../src/core/shelter_engine.js');
  const grid = vault().shelter_grid.map((row) => row.slice());
  grid[0][0] = { type: 'elevator', floor: 0, column: 0, level: 1, operational: true };
  const atLift = { ...createRpgPlayer(grid), x: cellCenter(0, 0).x, y: cellCenter(0, 0).y };
  assert.match(getElevatorPrompt(atLift, grid, { surface: true, suit: true }), /SUBIR À SUPERFÍCIE/);
  assert.match(getElevatorPrompt(atLift, grid, { surface: true, suit: false }), /EXIGE TRAJE ANTIRRADIAÇÃO/);
  assert.equal(updatePlayer(atLift, { up: true, surface: true, suit: false }, grid, .1).liftTarget, null, 'no suit, no ride');
  let player = updatePlayer(atLift, { up: true, surface: true, suit: true }, grid, .1);
  assert.equal(player.liftTarget, SURFACE_FLOOR);
  for (let frame = 0; frame < 400 && player.liftTarget !== null; frame++) player = updatePlayer(player, { surface: true, suit: true }, grid, 1 / 60);
  assert.equal(player.floor, SURFACE_FLOOR);
  const arrivedX = player.x;
  for (let frame = 0; frame < 120; frame++) player = updatePlayer(player, { right: true, suit: true }, grid, 1 / 60);
  assert.ok(player.x > arrivedX + 200, 'walks freely along the surface');
  assert.ok(player.x <= getMarketRect().centerX + 200, 'but not beyond the stall area');
  assert.match(getElevatorPrompt({ ...player, x: cellCenter(0, 0).x }, grid), /DESCER/);
  assert.equal(normalizeRpgPlayer({ ...player }, grid).floor, SURFACE_FLOOR, 'the surface position survives a re-render');
});
