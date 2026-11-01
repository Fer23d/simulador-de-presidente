import test from 'node:test';
import assert from 'node:assert/strict';
import { adoptLayd, canPetDog, createDogActor, hasLayd, normalizeCompanion, petDog, updateDogActor } from '../src/core/companion.js';
import { createGameState, hydrateGameState } from '../src/core/game-state.js';
import { getStoryEvent, dismissStory } from '../src/core/story_engine.js';
import { drawDog, DOG_HEIGHT } from '../src/core/dog_renderer.js';

const player = (extra = {}) => ({ x: 400, floor: 1, facing: 1, vx: 0, liftTarget: null, ...extra });

test('Layd only joins once, when the player chooses to stay, and the save remembers her', () => {
  const state = createGameState();
  assert.equal(hasLayd(state), false);
  const adopted = adoptLayd({ ...state, wasteland_turn: 40 });
  assert.equal(hasLayd(adopted), true);
  assert.equal(adopted.companion.name, 'Layd');
  assert.equal(adopted.companion.since, 40);
  assert.match(adopted.notice, /Layd/);
  assert.equal(adopted.pendingStory, true, 'her arrival is told as a story card');
  assert.match(getStoryEvent(adopted.currentStory).text, /latidos/);
  assert.match(dismissStory(adopted).seen_stories.join(), /layd_arrives/);
  assert.equal(adoptLayd(adopted), adopted, 'adopting twice changes nothing');
  const loaded = hydrateGameState(JSON.stringify({ ...adopted, version: createGameState().version }));
  assert.equal(loaded.companion.adopted, true);
  assert.equal(hydrateGameState(JSON.stringify({ ...state, version: state.version })).companion, null);
  assert.equal(normalizeCompanion({ adopted: false }), null);
  assert.equal(normalizeCompanion({ adopted: true, bond: 900 }).bond, 100);
});

test('Layd walks behind the player, runs when far away and sits when the player stops', () => {
  let dog = { ...createDogActor(player()), x: 380, pose: 'stand' };
  const near = updateDogActor(dog, player({ x: 500, vx: 170 }), .05);
  assert.ok(near.x > dog.x, 'moves toward the player');
  assert.equal(near.facing, 1);
  assert.match(near.pose, /walk|run/);
  const far = updateDogActor({ ...dog, x: 0 }, player({ x: 900, vx: 170 }), .05);
  assert.equal(far.pose, 'run');
  assert.ok(far.x - 0 > near.x - dog.x, 'runs faster than she walks');
  const behind = updateDogActor({ ...dog, x: 560 }, player({ x: 400, facing: -1, vx: 0 }), .05);
  assert.ok(behind.x < 560, 'turns back to the player');
  dog = { ...dog, x: 340 };
  for (let step = 0; step < 80; step++) dog = updateDogActor(dog, player(), .05);
  assert.equal(dog.pose, 'sit', 'sits once the player has been still for a while');
  assert.ok(Math.abs(dog.x - 400) < 120);
});

test('Layd uses the elevator to change floors with the player and waits while the lift moves', () => {
  let dog = { ...createDogActor(player({ floor: 1 })), x: 600 };
  const upstairs = player({ floor: 3, x: 300 });
  for (let step = 0; step < 200 && dog.floor !== 3; step++) dog = updateDogActor(dog, upstairs, .05, { elevatorX: 120 });
  assert.equal(dog.floor, 3);
  assert.ok(Math.abs(dog.x - 120) < 10, 'she took the elevator column');
  const lifting = updateDogActor(dog, player({ liftTarget: 2 }), .05, { elevatorX: 120 });
  assert.equal(lifting.x, dog.x);
});

test('petting works only when the dog is close, on the same floor', () => {
  const dog = { ...createDogActor(player()), x: 380 };
  assert.equal(canPetDog(dog, player()), true);
  assert.equal(canPetDog({ ...dog, x: 100 }, player()), false);
  assert.equal(canPetDog({ ...dog, floor: 2 }, player()), false);
  const petted = petDog(dog, player());
  assert.ok(petted.petSeconds > 0);
  assert.equal(updateDogActor(petted, player(), .05).pose, 'sit');
  assert.equal(petDog({ ...dog, x: 100 }, player()).petSeconds, 0);
});

test('Layd can be drawn in every pose without errors', () => {
  const calls = [];
  const ctx = new Proxy({}, { get: (target, name) => {
    if (name === 'createLinearGradient') return () => ({ addColorStop() {} });
    return (...args) => { calls.push(name); return args; };
  }, set: () => true });
  for (const pose of ['stand', 'walk', 'run', 'sit']) {
    for (const happy of [false, true]) drawDog(ctx, { x: 100, y: 100, facing: -1, scale: 1.2, pose, gait: 2, time: 500, happy });
  }
  assert.ok(calls.includes('fill') && calls.includes('stroke'));
  assert.ok(DOG_HEIGHT > 30);
});
