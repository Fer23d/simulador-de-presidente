import test from 'node:test';
import assert from 'node:assert/strict';
import {
  arriveAtMission, createMissionLocation, getMissionReward, isMissionPending, isPlayerAtMission, normalizeMission,
} from '../src/core/missions.js';
import { createGameState, hydrateGameState } from '../src/core/game-state.js';
import { advanceWastelandMonth, transicionarParaWasteland } from '../src/core/wasteland.js';
import { buildShelterRoom } from '../src/core/shelter_engine.js';
import { resolveWastelandEvent } from '../src/core/game_mechanics.js';
import { bunkerView, missionObjectiveView, renderStoryCard } from '../src/ui/dashboard.js';

function vaultWithRooms() {
  let state = { ...transicionarParaWasteland(createGameState('bra')), scrap: 5_000, randomSeed: 3,
    president_selection_pending: false, presidentClass: 'worker' };
  state = buildShelterRoom(state, 'greenhouse', 0, 2);
  state = buildShelterRoom(state, 'generator', 0, 3);
  state = buildShelterRoom(state, 'elevator', 1, 0);
  state = buildShelterRoom(state, 'greenhouse', 1, 1);
  return state;
}

test('missions happen in a matching room on any floor, never in the elevator', () => {
  const { shelter_grid: grid } = vaultWithRooms();
  for (let seed = 1; seed < 40; seed++) {
    const fungus = createMissionLocation(grid, 'greenhouse-fungus', seed);
    assert.equal(grid[fungus.floor][fungus.column].type, 'greenhouse');
    const bearings = createMissionLocation(grid, 'generator-bearings', seed);
    assert.equal(grid[bearings.floor][bearings.column].type, 'generator');
    const any = createMissionLocation(grid, 'radio-signal-unknown', seed);
    assert.notEqual(grid[any.floor][any.column].type, 'elevator');
  }
  const floors = new Set(Array.from({ length: 40 }, (_, seed) => createMissionLocation(grid, 'greenhouse-fungus', seed + 1).floor));
  assert.deepEqual([...floors].sort(), [0, 1]);
});

test('the scheduled dilemma becomes a located mission that hides the card until arrival', () => {
  let state = vaultWithRooms();
  for (let month = 0; month < 3; month++) state = advanceWastelandMonth(state);
  const mission = state.pendingBunkerEvent;
  assert.ok(isMissionPending(mission));
  assert.match(state.notice, /MISSÃO: .* andar \d+, setor \d+/);
  assert.equal(renderStoryCard(state), '');
  assert.match(missionObjectiveView(state), /VÁ ATÉ LÁ E APERTE \[E\]/);
  assert.match(bunkerView(state), /data-mission-objective/);
  assert.equal(isPlayerAtMission(mission, mission.floor, mission.column), true);
  const blocked = resolveWastelandEvent(state, 'refuse-ration-cuts');
  assert.match(blocked.notice, /Vá até o local/);
  assert.equal(blocked.pendingBunkerEvent, mission);

  const arrived = arriveAtMission(state);
  assert.equal(isMissionPending(arrived.pendingBunkerEvent), false);
  assert.match(renderStoryCard(arrived), /RECOMPENSA DA MISSÃO/);
  assert.equal(missionObjectiveView(arrived), '');
});

test('resolving a mission pays scrap that grows with depth', () => {
  assert.equal(getMissionReward({ id: 'x', floor: 0, column: 1 }), 25);
  assert.equal(getMissionReward({ id: 'x', floor: 3, column: 1 }), 55);
  assert.equal(getMissionReward({ id: 'x' }), 0);
  const state = { ...vaultWithRooms(), pendingBunkerEvent: { id: 'ration-emergency', floor: 1, column: 1, arrived: true } };
  const resolved = resolveWastelandEvent(state, 'refuse-ration-cuts');
  assert.equal(resolved.scrap, state.scrap + 35);
  assert.equal(resolved.pendingBunkerEvent, null);
  assert.match(resolved.notice, /Missão concluída.*\+35 sucatas/);
});

test('mission location and arrival survive the save, invalid rooms fall back to the classic dilemma', () => {
  const state = { ...vaultWithRooms(), pendingBunkerEvent: { id: 'greenhouse-fungus', floor: 1, column: 1 } };
  assert.deepEqual(hydrateGameState(JSON.stringify(state)).pendingBunkerEvent, { id: 'greenhouse-fungus', floor: 1, column: 1 });
  const arrived = arriveAtMission(state);
  assert.equal(hydrateGameState(JSON.stringify(arrived)).pendingBunkerEvent.arrived, true);
  assert.deepEqual(normalizeMission({ floor: 1, column: 0 }, state.shelter_grid), {});
  assert.deepEqual(normalizeMission({ floor: 5, column: 6 }, state.shelter_grid), {});
});

test('arriving at the mission tells its story with the real floor and sector', async () => {
  const { getMissionStory, MISSION_STORIES } = await import('../src/core/missions.js');
  const { WASTELAND_EVENTS } = await import('../src/core/game_mechanics.js');
  for (const event of WASTELAND_EVENTS) assert.ok(MISSION_STORIES[event.id], event.id);
  assert.equal(getMissionStory({ id: 'greenhouse-fungus' }), null);
  const story = getMissionStory({ id: 'greenhouse-fungus', floor: 1, column: 2 });
  assert.match(story, /andar 2/);
  assert.match(story, /setor 2/);
  const state = { ...vaultWithRooms(), pendingBunkerEvent: { id: 'greenhouse-fungus', floor: 1, column: 1, arrived: true } };
  const card = renderStoryCard(state);
  assert.match(card, /ANDAR 2 · SETOR 1/);
  assert.match(card, /penugem cinzenta/);
});
