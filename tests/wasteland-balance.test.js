import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, hydrateGameState } from '../src/core/game-state.js';
import { advanceWastelandMonth, transicionarParaWasteland } from '../src/core/wasteland.js';
import { canResolveWastelandEvent, getWastelandEvent, resolveWastelandEvent } from '../src/core/game_mechanics.js';
import { buildShelterRoom, repairShelterGenerator } from '../src/core/shelter_engine.js';
import { bunkerView, renderStoryCard } from '../src/ui/dashboard.js';

function makeWastelandState() {
  const state = transicionarParaWasteland(createGameState('bra'));
  const shelterGrid = state.shelter_grid.map((row) => [...row]);
  shelterGrid[0][4] = { id: 'life-support-0-4', type: 'life_support', floor: 0, column: 4, level: 1 };
  return {
    ...state,
    randomSeed: 1,
    shelter_grid: shelterGrid,
    country: { ...state.country, populacao: 1000, populacao_base: 1000 },
    shelter_supplies: { ...state.shelter_supplies, food: 100, energy: 100 },
  };
}

function addProductionRooms(state) {
  state = { ...state, scrap: 1000 };
  state = buildShelterRoom(state, 'greenhouse', 0, 2);
  state = buildShelterRoom(state, 'generator', 0, 3);
  return repairShelterGenerator(state, 0, 3);
}

test('low morale halves assigned greenhouse and generator output while inhabitants keep working', () => {
  let state = addProductionRooms(makeWastelandState());
  state = {
    ...state,
    inhabitants: state.inhabitants.map((npc) => ['worker-0-2', 'worker-0-3'].includes(npc.id)
      ? { ...npc, loyalty: 30 }
      : npc),
  };

  const next = advanceWastelandMonth(state);
  assert.equal(next.shelter_supplies.food, 144);
  assert.equal(next.shelter_supplies.energy, 142);
  assert.equal(next.inhabitants.find((npc) => npc.id === 'worker-0-2').currentState, 'idle');
  assert.equal(next.inhabitants.find((npc) => npc.id === 'worker-0-2').loyalty, 30);
});

test('resource shortages reduce loyalty by ten and reaching zero only rebels after a one-time 20 percent roll', () => {
  const prepared = makeWastelandState();
  const state = {
    ...prepared,
    shelter_grid: prepared.shelter_grid.map((row, floor) => row.map((room, column) => floor === 0 && column === 2
      ? { id: 'test-life-support', type: 'life_support', floor, column, level: 5 }
      : room)),
    shelter_supplies: { food: 0, energy: 0 },
    inhabitants: prepared.inhabitants.map((npc, index) => ({ ...npc, loyalty: index ? 30 : 20 })),
  };

  const result = advanceWastelandMonth(state);
  assert.equal(result.inhabitants[0].loyalty, 10);
  assert.equal(result.inhabitants[0].currentState, 'idle');
  assert.equal(result.inhabitants[1].loyalty, 20);

  const atZero = advanceWastelandMonth({
    ...state,
    randomSeed: 1,
    inhabitants: state.inhabitants.map((npc, index) => ({ ...npc, loyalty: index ? 30 : 10 })),
  });
  assert.equal(atZero.inhabitants[0].loyalty, 0);
  assert.notEqual(atZero.inhabitants[0].currentState, 'rebel');
  assert.equal(atZero.inhabitants[0].rebellionCheckDone, true);
});

test('the single rebellion roll is 20 percent and a rebel only damages five scrap per month', () => {
  const prepared = makeWastelandState();
  const target = { ...prepared.inhabitants[0], loyalty: 10 };
  const others = prepared.inhabitants.slice(1).map((npc) => ({ ...npc, loyalty: 80 }));
  const rebel = advanceWastelandMonth({ ...prepared, randomSeed: 1972,
    shelter_supplies: { food: 0, energy: 0 }, inhabitants: [target, ...others] });
  assert.equal(rebel.inhabitants[0].currentState, 'rebel');
  assert.equal(rebel.scrap, prepared.scrap + 25 - 5);

  const next = advanceWastelandMonth({
    ...rebel,
    pendingExpeditionReports: [],
    shelter_supplies: { food: 100, energy: 100 },
  });
  assert.equal(next.scrap, rebel.scrap + 25 - 5);
});

test('every third Wasteland month blocks further advancement until the dilemma is resolved', () => {
  let state = makeWastelandState();
  state = advanceWastelandMonth(state);
  state = advanceWastelandMonth(state);
  state = advanceWastelandMonth(state);

  assert.equal(state.wastelandMonthCounter, 3);
  assert.equal(state.wasteland_turn, 3);
  assert.equal(state.pendingBunkerEvent?.id, 'ration-emergency');
  const blocked = advanceWastelandMonth(state);
  assert.equal(blocked.monthCounter, state.monthCounter);
  assert.deepEqual(blocked.shelter_supplies, state.shelter_supplies);
  assert.match(bunkerView({ ...state, president_selection_pending: false, presidentClass: 'worker' }), /data-action="advance" disabled/);
  assert.match(renderStoryCard(state), /A Ração de Emergência/);
});

test('greenhouse quarantine suppresses three complete production calculations and resumes on the fourth', () => {
  let state = addProductionRooms(makeWastelandState());
  const grid = state.shelter_grid.map((row) => row.map((room) => room?.type === 'greenhouse'
    ? { ...room, disabledMonthsRemaining: 3 }
    : room));
  state = { ...state, shelter_grid: grid, shelter_supplies: { ...state.shelter_supplies, food: 100 } };

  state = advanceWastelandMonth(state);
  assert.equal(state.shelter_supplies.food, 94);
  assert.equal(state.shelter_grid.flat().find((room) => room?.type === 'greenhouse').disabledMonthsRemaining, 2);
  state = advanceWastelandMonth(state);
  assert.equal(state.shelter_supplies.food, 88);
  state = advanceWastelandMonth(state);
  state = resolveWastelandEvent(state, 'refuse-ration-cuts');
  assert.equal(state.shelter_supplies.food, 82);
  assert.equal(state.shelter_grid.flat().find((room) => room?.type === 'greenhouse').disabledMonthsRemaining, 0);

  state = advanceWastelandMonth(state);
  assert.equal(state.shelter_supplies.food, 175);
});

test('dilemma choices apply their effects, clear the pause, and survive save hydration while pending', () => {
  const base = makeWastelandState();
  const waiting = {
    ...base,
    wasteland_turn: undefined,
    wastelandMonthCounter: 6,
    pendingBunkerEvent: { id: 'ration-emergency' },
    shelter_supplies: { ...base.shelter_supplies, food: 10 },
  };
  const supported = resolveWastelandEvent(waiting, 'support-scientists');
  assert.equal(supported.shelter_supplies.food, 210);
  assert.ok(supported.inhabitants.every((npc) => npc.loyalty === 80));
  assert.equal(supported.pendingBunkerEvent, null);

  const refused = resolveWastelandEvent(waiting, 'refuse-ration-cuts');
  assert.equal(refused.shelter_supplies.food, 10);
  assert.ok(refused.inhabitants.every((npc) => npc.loyalty === 100));
  assert.equal(refused.pendingBunkerEvent, null);

  const restored = hydrateGameState(JSON.stringify({ ...waiting, version: 18 }));
  assert.deepEqual(restored.pendingBunkerEvent, { id: 'ration-emergency' });
  assert.equal(restored.wastelandMonthCounter, 6);
});

test('legacy Wasteland cadence hydrates both counters and the current counter wins when both are saved', () => {
  const base = makeWastelandState();
  assert.equal(createGameState('bra').wastelandEventCursor, 0);
  assert.equal(base.wastelandEventCursor, 0);
  const legacy = hydrateGameState(JSON.stringify({ ...base, version: 18, wasteland_turn: undefined, wastelandMonthCounter: 6 }));
  assert.equal(legacy.wasteland_turn, 6);
  assert.equal(legacy.wastelandMonthCounter, 6);

  const current = hydrateGameState(JSON.stringify({
    ...base, version: 18, wasteland_turn: 4, wastelandMonthCounter: 9,
  }));
  assert.equal(current.wasteland_turn, 4);
  assert.equal(current.wastelandMonthCounter, 4);
  assert.equal(Number.isInteger(current.wastelandEventCursor), true);
});

test('radio scouts spend food and yield a deterministic scrap cache only on success', () => {
  const base = { ...addProductionRooms(makeWastelandState()), shelter_supplies: { food: 100, energy: 100 } };
  const pending = { ...base, pendingBunkerEvent: { id: 'radio-signal-unknown' } };
  assert.deepEqual(getWastelandEvent('radio-signal-unknown').options[0].cost, { food: 50 });
  assert.equal(canResolveWastelandEvent(pending, 'radio-signal-unknown', 'send-scouts'), true);

  const success = resolveWastelandEvent(pending, 'send-scouts');
  assert.equal(success.shelter_supplies.food, 50);
  assert.equal(success.scrap, pending.scrap + 100);
  assert.notEqual(success.randomSeed, pending.randomSeed);

  const failed = resolveWastelandEvent({ ...pending, randomSeed: 1198 }, 'send-scouts');
  assert.equal(failed.shelter_supplies.food, 50);
  assert.equal(failed.scrap, pending.scrap);
});

test('radio scouts fail rolls at or above the 65 percent success threshold', () => {
  const state = {
    ...addProductionRooms(makeWastelandState()),
    randomSeed: 1069,
    shelter_supplies: { food: 100, energy: 100 },
    pendingBunkerEvent: { id: 'radio-signal-unknown' },
  };

  const result = resolveWastelandEvent(state, 'send-scouts');
  assert.equal(result.scrap, state.scrap);
  assert.equal(result.shelter_supplies.food, 50);
});

test('radio scouts succeed on a roll between the cure and scout thresholds', () => {
  const state = {
    ...addProductionRooms(makeWastelandState()),
    randomSeed: 940,
    shelter_supplies: { food: 100, energy: 100 },
    pendingBunkerEvent: { id: 'radio-signal-unknown' },
  };

  assert.ok(0.6 < (Math.imul(state.randomSeed, 1664525) + 1013904223 >>> 0) / 4294967296);
  const result = resolveWastelandEvent(state, 'send-scouts');
  assert.equal(result.scrap, state.scrap + 100);
  assert.equal(result.shelter_supplies.food, 50);
});

test('radio event uses the approved narrative title', () => {
  assert.equal(getWastelandEvent('radio-signal-unknown').title, 'Sinal de Rádio Desconhecido');
});

test('ignoring the radio signal has no costs or loot', () => {
  const state = { ...makeWastelandState(), pendingBunkerEvent: { id: 'radio-signal-unknown' } };
  const result = resolveWastelandEvent(state, 'ignore-signal');
  assert.deepEqual(result.shelter_supplies, state.shelter_supplies);
  assert.equal(result.scrap, state.scrap);
  assert.equal(result.randomSeed, state.randomSeed);
  assert.equal(result.pendingBunkerEvent, null);
});

test('quarantining fungal growth disables the first greenhouse for three months', () => {
  const state = { ...addProductionRooms(makeWastelandState()), pendingBunkerEvent: { id: 'greenhouse-fungus' } };
  const event = getWastelandEvent('greenhouse-fungus');
  assert.deepEqual(event.prerequisites, { roomType: 'greenhouse' });
  const result = resolveWastelandEvent(state, 'quarantine-greenhouse');
  const room = result.shelter_grid.flat().find((candidate) => candidate?.type === 'greenhouse');
  assert.equal(room.disabledMonthsRemaining, 3);
});

test('a successful fungal cure spends 80 energy and keeps the greenhouse active', () => {
  const state = { ...addProductionRooms(makeWastelandState()), pendingBunkerEvent: { id: 'greenhouse-fungus' } };
  const result = resolveWastelandEvent(state, 'attempt-cure');
  const room = result.shelter_grid.flat().find((candidate) => candidate?.type === 'greenhouse');
  assert.equal(getWastelandEvent('greenhouse-fungus').options[1].cost.energy, 80);
  assert.equal(result.shelter_supplies.energy, state.shelter_supplies.energy - 80);
  assert.equal(room.disabledMonthsRemaining ?? 0, 0);
});

test('fungal cure fails rolls at or above the 60 percent success threshold', () => {
  const state = {
    ...addProductionRooms(makeWastelandState()),
    randomSeed: 940,
    pendingBunkerEvent: { id: 'greenhouse-fungus' },
  };

  const result = resolveWastelandEvent(state, 'attempt-cure');
  const greenhouse = result.shelter_grid.flat().find((room) => room?.type === 'greenhouse');
  assert.equal(result.shelter_supplies.energy, state.shelter_supplies.energy - 80);
  assert.equal(greenhouse.disabledMonthsRemaining, 3);
});

test('an unaffordable fungal cure preserves supplies, seed, and pending event', () => {
  const state = { ...addProductionRooms(makeWastelandState()), randomSeed: 31,
    shelter_supplies: { food: 10, energy: 79 }, pendingBunkerEvent: { id: 'greenhouse-fungus' } };
  const result = resolveWastelandEvent(state, 'attempt-cure');
  assert.equal(result.shelter_supplies.energy, 79);
  assert.ok(result.shelter_supplies.energy >= 0);
  assert.equal(result.randomSeed, 31);
  assert.deepEqual(result.pendingBunkerEvent, state.pendingBunkerEvent);
});
