import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, hydrateGameState } from '../src/core/game-state.js';
import { advanceWastelandMonth, transicionarParaWasteland } from '../src/core/wasteland.js';
import { getRoomEconomyProfile, getRoomStorageCapacity, getRoomUpgradeCosts } from '../src/core/bunker_economy.js';
import { buildShelterRoom, INITIAL_SHELTER_GRID, upgradeShelterRoom } from '../src/core/shelter_engine.js';
import { nextRandom } from '../src/core/geopolitics.js';
import { normalizeInhabitants } from '../src/core/rpg_bunker.js';
import { Inhabitant } from '../src/core/inhabitant.js';
import { bunkerView, expeditionLogisticsView, expeditionReportView, renderRoomManagement } from '../src/ui/dashboard.js';

function createVault() {
  const base = transicionarParaWasteland(createGameState('bra'));
  return { ...base, scrap: 10_000, science: 10_000,
    country: { ...base.country, populacao: 1000, populacao_base: 1000 },
    shelter_supplies: { ...base.shelter_supplies, food: 100, energy: 100 },
  };
}

function seedForRolls(predicate) {
  for (let seed = 0; seed < 100_000; seed++) {
    const first = nextRandom(seed);
    const second = nextRandom(first.seed);
    if (predicate(first.value, second.value)) return seed;
  }
  throw new Error('No deterministic seed found');
}

test('laboratory is buildable, staffed as a research room, and produces science', () => {
  const built = buildShelterRoom(createVault(), 'laboratory', 0, 2);
  const lab = built.shelter_grid[0][2];
  const worker = built.inhabitants.find((npc) => npc.workFloor === 0 && npc.workColumn === 2);

  assert.equal(lab.type, 'laboratory');
  assert.equal(worker.role, 'scientist');
  assert.equal(worker.name, 'Habitante Genérico');
  assert.equal(worker.isVIP, false);
  assert.equal(getRoomEconomyProfile(built, lab).production.amount, 40);
  assert.equal(advanceWastelandMonth({ ...built, science: 0 }).science, 40);
});

test('level four and five upgrades require scrap and science and debit both atomically', () => {
  const grid = INITIAL_SHELTER_GRID.map((row) => [...row]);
  grid[0][2] = { id: 'laboratory-0-2', type: 'laboratory', floor: 0, column: 2, level: 3 };
  const noScience = { ...createVault(), shelter_grid: grid, scrap: 1650, science: 499 };
  assert.deepEqual(getRoomUpgradeCosts(grid[0][2]), { scrap: 1650, science: 500 });
  assert.equal(upgradeShelterRoom(noScience, 0, 2).shelter_grid[0][2].level, 3);

  const levelFour = upgradeShelterRoom({ ...noScience, science: 500 }, 0, 2);
  assert.equal(levelFour.shelter_grid[0][2].level, 4);
  assert.equal(levelFour.scrap, 0);
  assert.equal(levelFour.science, 0);

  const levelFive = upgradeShelterRoom({ ...levelFour, scrap: 2750, science: 1500 }, 0, 2);
  assert.equal(levelFive.shelter_grid[0][2].level, 5);
  assert.equal(levelFive.scrap, 0);
  assert.equal(levelFive.science, 0);
});

test('VIP modifiers double staffed production while morale still halves their contribution', () => {
  let state = buildShelterRoom(createVault(), 'laboratory', 0, 2);
  const vip = { id: 'vip-scientist', floor: 0, column: 2, workFloor: 0, workColumn: 2,
    isVIP: true, modifier: 2, name: 'Dr. Isaac', role: 'scientist', loyalty: 100 };
  state = { ...state, inhabitants: [...state.inhabitants, vip] };
  assert.equal(getRoomEconomyProfile(state, state.shelter_grid[0][2]).production.amount, 120);
  state = { ...state, inhabitants: state.inhabitants.map((npc) => npc.id === vip.id ? { ...npc, loyalty: 30 } : npc) };
  assert.equal(getRoomEconomyProfile(state, state.shelter_grid[0][2]).production.amount, 80);
});

test('science storage caps monthly laboratory output and is persisted in saves', () => {
  const built = buildShelterRoom(createVault(), 'laboratory', 0, 2);
  const grid = built.shelter_grid.map((row) => row.map((room) => room?.type === 'laboratory' ? { ...room, level: 2 } : room));
  const capped = advanceWastelandMonth({ ...built, shelter_grid: grid, science: 990 });
  assert.equal(getRoomStorageCapacity(grid, 'science'), 1000);
  assert.equal(capped.science, 1000);
  assert.equal(hydrateGameState(JSON.stringify(capped)).science, 1000);
});

test('VIPs consume two rations while an ordinary housed inhabitant consumes one', () => {
  const state = createVault();
  state.inhabitants = state.inhabitants.map((npc, index) => index === 0
    ? { ...npc, isVIP: true, modifier: 2, name: 'Coronel Silva' }
    : npc);
  assert.equal(advanceWastelandMonth(state).shelter_supplies.food, 95);
});

test('a successful expedition has a deterministic ten percent VIP loot roll', () => {
  const built = buildShelterRoom(createVault(), 'laboratory', 0, 2);
  const seed = seedForRolls((success, vip) => success < 0.7 && vip < 0.1);
  const state = { ...built, randomSeed: seed, wasteland_turn: 1, wastelandMonthCounter: 1,
    inhabitants: built.inhabitants.map((npc) => npc.id === 'vault-resident-1'
      ? { ...npc, is_on_expedition: true, expedition_timer: 1 } : npc) };
  const result = advanceWastelandMonth(state);
  const vip = result.inhabitants.find((npc) => npc.isVIP);

  assert.ok(vip);
  assert.match(vip.name, /^(Dr\.|Dra\.|Coronel|Coronela)/);
  assert.equal(vip.modifier, 2);
  assert.equal(vip.role, 'scientist');
  assert.equal(vip.workFloor, 0);
  assert.equal(vip.workColumn, 2);
  assert.equal(result.pendingExpeditionReports[0].vipFound, true);
  assert.match(result.pendingExpeditionReports[0].vipName, /./);
});

test('VIP identity and modifier survive save hydration and NPC class snapshots', () => {
  const state = createVault();
  const vip = { ...state.inhabitants[0], id: 'vip-1', name: 'Dr. Isaac', isVIP: true, modifier: 2 };
  const restored = hydrateGameState(JSON.stringify({ ...state, inhabitants: [...state.inhabitants, vip] }));
  const normalized = normalizeInhabitants(restored.inhabitants, restored.shelter_grid).find((npc) => npc.id === 'vip-1');
  assert.equal(normalized.name, 'Dr. Isaac');
  assert.equal(normalized.isVIP, true);
  assert.equal(normalized.modifier, 2);
  const snapshot = new Inhabitant(normalized).snapshot();
  assert.equal(snapshot.name, 'Dr. Isaac');
  assert.equal(snapshot.isVIP, true);
  assert.equal(snapshot.modifier, 2);
});

test('the HUD shows science capacity, upgrade costs use red and green states, and mission reports name VIP loot', () => {
  const base = createVault();
  const grid = base.shelter_grid.map((row) => [...row]);
  grid[0][2] = { id: 'greenhouse-0-2', type: 'greenhouse', floor: 0, column: 2, level: 3 };
  grid[0][3] = { id: 'laboratory-0-3', type: 'laboratory', floor: 0, column: 3, level: 1 };
  const affordable = { ...base, president_selection_pending: false, presidentClass: 'worker', shelter_grid: grid, scrap: 1650, science: 500 };
  const roomMarkup = renderRoomManagement(affordable, grid[0][2]);
  assert.match(bunkerView(affordable), /CIÊNCIA 500 \/ 500/);
  assert.match(roomMarkup, /resource-cost--enough/);
  assert.doesNotMatch(roomMarkup, /resource-cost--short/);
  assert.match(renderRoomManagement({ ...affordable, science: 499 }, grid[0][2]), /resource-cost--short/);

  const explorer = { ...base.inhabitants[0], isVIP: true, name: 'Dr. Isaac', modifier: 2 };
  assert.match(expeditionLogisticsView({ ...base, inhabitants: [explorer] }), /⭐ Dr\. Isaac/);
  assert.match(expeditionReportView({ pendingExpeditionReports: [{ id: 'report', inhabitantId: 'vault-resident-1', success: true, vipFound: true, vipName: 'Dr. Isaac' }] }), /ESPECIALISTA RESGATADO: ⭐ Dr\. Isaac/);
});

test('a rogue VIP has a thirty percent chance to assassinate a normal inhabitant in an adjacent room', () => {
  const state = createVault();
  const vip = { ...state.inhabitants[0], id: 'vip-rebel', name: 'Coronel Silva', isVIP: true,
    modifier: 2, currentState: 'rebel', loyalty: 0, floor: 0, column: 2 };
  const victim = { ...state.inhabitants[1], id: 'worker-target', name: 'Técnico Raul', floor: 0, column: 1, workFloor: 0, workColumn: 1 };
  const far = { ...victim, id: 'worker-far', floor: 0, column: 5, workColumn: 5 };
  const successSeed = seedForRolls((roll) => roll < 0.3);
  const killed = advanceWastelandMonth({ ...state, randomSeed: successSeed, wasteland_turn: 2,
    wastelandMonthCounter: 2, inhabitants: [vip, victim, far] });

  assert.equal(killed.inhabitants.some((npc) => npc.id === 'worker-target'), false);
  assert.equal(killed.inhabitants.some((npc) => npc.id === 'worker-far'), true);
  assert.match(killed.notice, /ALERTA CRÍTICO.*assassinou.*Técnico Raul/i);
  assert.equal(killed.pendingBunkerEvent?.id, 'ration-emergency');

  const failedSeed = seedForRolls((roll) => roll >= 0.3);
  const survived = advanceWastelandMonth({ ...state, randomSeed: failedSeed, inhabitants: [vip, victim] });
  assert.equal(survived.inhabitants.some((npc) => npc.id === 'worker-target'), true);
});
