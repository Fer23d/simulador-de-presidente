import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, hydrateGameState } from '../src/core/game-state.js';
import { equipSkin, getPresidentClassModifiers, PRESIDENT_CLASSES, purchaseSkin, startGame } from '../src/core/player_state.js';
import { drawPresidentSelection, getPresidentSelectionAtPoint } from '../src/core/menu.js';
import { bunkerView, renderWardrobeView } from '../src/ui/dashboard.js';
import { calculateSuppression, advanceMonthlyGameMechanics, resolveWastelandEvent } from '../src/core/game_mechanics.js';
import { getRoomEconomyProfile } from '../src/core/bunker_economy.js';
import { getShelterBuildCost } from '../src/core/shelter_engine.js';
import { advanceWastelandMonth, transicionarParaWasteland } from '../src/core/wasteland.js';

test('publishes four profession origins with their requested passive modifiers', () => {
  assert.deepEqual(PRESIDENT_CLASSES.map(({ id }) => id), ['worker', 'commander', 'doctor', 'survivor']);
  assert.equal(getPresidentClassModifiers('worker').buildCostMultiplier, 0.85);
  assert.equal(getPresidentClassModifiers('worker').upgradeCostMultiplier, 0.85);
  assert.equal(getPresidentClassModifiers('worker').scienceOutputMultiplier, 0.85);
  assert.equal(getPresidentClassModifiers('commander').suppressionMultiplier, 2);
  assert.equal(getPresidentClassModifiers('commander').foodConsumptionMultiplier, 1.1);
  assert.equal(getPresidentClassModifiers('doctor').diseaseImmunity, true);
  assert.equal(getPresidentClassModifiers('doctor').radiationGainMultiplier, 0);
  assert.equal(getPresidentClassModifiers('doctor').combatDamageMultiplier, 0.8);
  assert.equal(getPresidentClassModifiers('survivor').upgradeCostMultiplier, 1);
});

test('Comandante doubles suppression and Operário makes shortage loyalty loss neutral', () => {
  const soldiers = [{ id: 'guard', role: 'soldier', loyalty: 80 }];
  assert.equal(calculateSuppression({ inhabitants: soldiers }).suppressionFactor, 0.1);
  assert.equal(calculateSuppression({ inhabitants: soldiers, presidentClass: 'commander' }).suppressionFactor, 0.2);
  const base = { inhabitants: [{ id: 'worker', loyalty: 80 }], shelter_supplies: { food: 0, energy: 2 }, randomSeed: 17 };
  assert.equal(advanceMonthlyGameMechanics(base).inhabitants[0].loyalty, 70);
  assert.equal(advanceMonthlyGameMechanics({ ...base, presidentClass: 'worker' }).inhabitants[0].loyalty, 70);
});

test('starts a class selection once without granting the removed Oligarch scrap bonus', () => {
  const state = { ...createGameState('bra'), is_wasteland: true, president_selection_pending: true, scrap: 500 };
  const started = startGame(state, 'worker');
  assert.equal(started.presidentClass, 'worker');
  assert.equal(started.president_selection_pending, false);
  assert.equal(started.scrap, 500);
  assert.equal(startGame(started, 'doctor'), started);
  assert.equal(startGame(state, 'unknown').president_selection_pending, true);
});

test('Operário discounts construction, upgrades, and laboratory science output', () => {
  const worker = { is_wasteland: true, presidentClass: 'worker', scrap: 1000,
    shelter_grid: Array.from({ length: 5 }, () => Array(10).fill(null)),
    country: { populacao_base: 100 }, inhabitants: [{ id: 'lab-tech', workFloor: 0, workColumn: 1, loyalty: 100 }] };
  const room = { id: 'lab', type: 'laboratory', floor: 0, column: 1, level: 1 };
  assert.equal(getShelterBuildCost('dormitory', 0, 'worker'), Math.ceil(getShelterBuildCost('dormitory', 0) * 0.85));
  assert.equal(getRoomEconomyProfile(worker, room).production.amount, 34);
});

test('Doutor prevents passive radiation from increasing while the Survivor has no modifier', () => {
  const base = transicionarParaWasteland(createGameState('bra'));
  const prepared = { ...base, president_selection_pending: false, shelter_radiation: 20,
    shelter_supplies: { ...base.shelter_supplies, oxygen: 1000 }, randomSeed: 17,
    shelter_grid: base.shelter_grid.map((row) => row.map((room) => room?.type === 'vault' ? room : null)) };
  const doctor = advanceWastelandMonth({ ...prepared, presidentClass: 'doctor' });
  const survivor = advanceWastelandMonth({ ...prepared, presidentClass: 'survivor' });
  assert.equal(doctor.shelter_radiation, 20);
  assert.equal(survivor.shelter_radiation, 22);
});

test('Doutor ignores disease exposure from saturated filters but still pays the food cost', () => {
  const state = { is_wasteland: true, pendingBunkerEvent: { id: 'air-filter-crisis' },
    presidentClass: 'doctor', inhabitants: [{ id: 'resident', loyalty: 80 }],
    shelter_supplies: { food: 100, energy: 100, medkits: 0 }, randomSeed: 21 };
  const protectedState = resolveWastelandEvent(state, 'keep-ventilation-running');
  const unprotectedState = resolveWastelandEvent({ ...state, presidentClass: 'survivor' }, 'keep-ventilation-running');
  assert.equal(protectedState.inhabitants[0].loyalty, 80);
  assert.equal(protectedState.shelter_supplies.food, 70);
  assert.equal(unprotectedState.inhabitants[0].loyalty, 70);
});

test('skin purchases charge scrap once and only unlocked skins can be equipped', () => {
  const state = { ...createGameState('bra'), is_wasteland: true, scrap: 15000,
    shelter_grid: createGameState('bra').shelter_grid.map((row) => [...row]) };
  state.shelter_grid[0][2] = { id: 'suite', type: 'presidential_suite', floor: 0, column: 2, level: 1 };
  const purchased = purchaseSkin(state, 'cultist');
  assert.equal(purchased.scrap, 0);
  assert.ok(purchased.unlockedSkins.includes('cultist'));
  assert.equal(purchaseSkin(purchased, 'cultist'), purchased);
  assert.equal(equipSkin(purchased, 'golden').equippedSkin, 'default');
  assert.equal(equipSkin(purchased, 'cultist').equippedSkin, 'cultist');
  assert.equal(equipSkin(purchased, 'default').equippedSkin, 'default');
});

test('save hydration validates class and cosmetic ownership while preserving selection state', () => {
  const base = createGameState('bra');
  const restored = hydrateGameState(JSON.stringify({ ...base, version: base.version, is_wasteland: true,
    president_selection_pending: true, presidentClass: 'commander', unlockedSkins: ['default', 'cultist', 'bogus'], equippedSkin: 'cultist' }));
  assert.equal(restored.presidentClass, 'commander');
  assert.equal(restored.president_selection_pending, true);
  assert.deepEqual(restored.unlockedSkins, ['default', 'cultist']);
  assert.equal(restored.equippedSkin, 'cultist');
});

test('selection canvas paints the class menu and maps pointer coordinates to a class', () => {
  const operations = [];
  const context = new Proxy({}, { get(target, key) {
    if (key in target) return target[key];
    return (...args) => operations.push([key, ...args]);
  }, set(target, key, value) { target[key] = value; return true; } });
  drawPresidentSelection(context, { width: 960, height: 600, time: 0 });
  assert.ok(operations.some(([name]) => name === 'fillText'));
  assert.equal(getPresidentSelectionAtPoint({ x: 260, y: 220 }, 960, 600), 'worker');
  assert.equal(getPresidentSelectionAtPoint({ x: 20, y: 20 }, 960, 600), null);
});

test('Wasteland gate renders a pre-game canvas and accessible class choices instead of starting bunker controls', () => {
  const state = { ...createGameState('bra'), is_wasteland: true, president_selection_pending: true };
  const markup = bunkerView(state);
  assert.match(markup, /presidentSelectCanvas/);
  assert.match(markup, /data-action="select-president" data-class="worker"/);
  assert.match(markup, /data-class="commander"/);
  assert.match(markup, /data-class="doctor"/);
  assert.match(markup, /data-class="survivor"/);
  assert.doesNotMatch(markup, /shelterCanvas/);
});

test('wardrobe lists cosmetic prices, ownership and equip actions', () => {
  const state = { ...createGameState('bra'), is_wasteland: true, scrap: 6000,
    unlockedSkins: ['default', 'scrap_armor'], equippedSkin: 'default' };
  const markup = renderWardrobeView(state);
  assert.match(markup, /Traje Dourado Ridículo/);
  assert.match(markup, /10\.000 sucatas/);
  assert.match(markup, /Armadura de Sucata/);
  assert.match(markup, /EQUIPADA/);
  assert.match(markup, /data-action="skin-equip" data-skin="scrap_armor"/);
  assert.doesNotMatch(markup, /data-action="skin-buy" data-skin="scrap_armor"/);
});
