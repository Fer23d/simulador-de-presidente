import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceInhabitantNeeds, countDormitoryBeds, getCriticalNeeds, getNeedsProductivityMultiplier,
  getNeedsSpeedMultiplier, normalizeNeeds,
} from '../src/core/needs.js';
import { getRoomWorkforce } from '../src/core/bunker_economy.js';
import { applyDialoguePacification } from '../src/core/dialogues.js';
import { Inhabitant } from '../src/core/inhabitant.js';
import { createGameState, hydrateGameState } from '../src/core/game-state.js';
import { advanceWastelandMonth, transicionarParaWasteland } from '../src/core/wasteland.js';

const worker = (needs) => ({ id: 'w', floor: 0, column: 2, workFloor: 0, workColumn: 2, loyalty: 100, needs });

test('needs default to full and clamp invalid values', () => {
  assert.deepEqual(normalizeNeeds(), { satiety: 100, rest: 100, morale: 100 });
  assert.deepEqual(normalizeNeeds({ satiety: -20, rest: 'x', morale: 140 }), { satiety: 0, rest: 100, morale: 100 });
  assert.deepEqual(getCriticalNeeds({ satiety: 10, rest: 29, morale: 30 }), ['satiety', 'rest']);
});

test('fed inhabitants recover satiety and starving ones lose it', () => {
  const [fed] = advanceInhabitantNeeds([worker({ satiety: 50, rest: 100, morale: 100 })], { fed: true, beds: 4 });
  const [starving] = advanceInhabitantNeeds([worker({ satiety: 50, rest: 100, morale: 100 })], { fed: false, beds: 4 });
  assert.equal(fed.needs.satiety, 90);
  assert.equal(starving.needs.satiety, 15);
});

test('workers tire faster and dormitory beds decide how much rest returns', () => {
  const idle = { id: 'i', floor: 0, column: 1, workFloor: null, workColumn: null, needs: { rest: 50 } };
  const [rested, idleRested] = advanceInhabitantNeeds([worker({ rest: 50 }), idle], { beds: 4 });
  const [crowded] = advanceInhabitantNeeds([worker({ rest: 50 })], { beds: 0 });
  assert.equal(rested.needs.rest, 60);
  assert.equal(idleRested.needs.rest, 80);
  assert.equal(crowded.needs.rest, 30);
});

test('hunger, exhaustion and dark nights drain morale, and low morale costs loyalty', () => {
  const [content] = advanceInhabitantNeeds([worker({ morale: 60 })], { fed: true, beds: 4 });
  assert.equal(content.needs.morale, 65);
  assert.equal(content.loyalty, 100);
  const [miserable] = advanceInhabitantNeeds([worker({ satiety: 20, rest: 20, morale: 60 })],
    { fed: false, beds: 0, darkNights: true });
  assert.equal(miserable.needs.morale, 15);
  assert.equal(miserable.loyalty, 90);
});

test('inhabitants away on expedition keep their needs untouched', () => {
  const explorer = { ...worker({ satiety: 50 }), is_on_expedition: true };
  assert.equal(advanceInhabitantNeeds([explorer], { fed: false })[0], explorer);
});

test('critical needs slow inhabitants and cut their share of room output', () => {
  assert.equal(getNeedsProductivityMultiplier({ satiety: 10, rest: 10 }), .7 * .8);
  assert.equal(getNeedsSpeedMultiplier({ rest: 10 }), .75);
  const room = { type: 'greenhouse', floor: 0, column: 2 };
  const healthy = getRoomWorkforce({ inhabitants: [worker()] }, room).effective;
  const starving = getRoomWorkforce({ inhabitants: [worker({ satiety: 10 })] }, room).effective;
  assert.equal(healthy, 1);
  assert.equal(starving, .7);
  const npc = new Inhabitant({ id: 'slow', floor: 0, column: 1, needs: { rest: 10 },
    currentState: 'walking_right', targetOffsetX: 100 });
  npc.update(.1);
  assert.equal(npc.offsetX, npc.speed * .1 * .75);
  assert.deepEqual(npc.snapshot().needs, { satiety: 100, rest: 10, morale: 100 });
});

test('talking to an inhabitant lifts morale', () => {
  const state = { currentDay: 2, inhabitants: [{ id: 'a', loyalty: 50, needs: { morale: 40 } }] };
  assert.equal(applyDialoguePacification(state, 'a').npc.needs.morale, 55);
});

test('dormitory levels provide four beds each', () => {
  assert.equal(countDormitoryBeds([[{ type: 'dormitory', level: 2 }, { type: 'vault', level: 1 }, null]]), 8);
});

test('the bunker month feeds residents, reports shortages and needs survive the save', () => {
  const base = transicionarParaWasteland(createGameState('bra'));
  const starving = { ...base, shelter_supplies: { ...base.shelter_supplies, food: 0 } };
  const next = advanceWastelandMonth(starving);
  assert.ok(next.inhabitants.every((npc) => npc.needs.satiety === 65));
  assert.match(next.notice, /FOME/);
  assert.match(next.notice, /DORMITÓRIOS LOTADOS: 0 leitos/);
  assert.deepEqual(hydrateGameState(JSON.stringify(next)).inhabitants.map((npc) => npc.needs),
    next.inhabitants.map((npc) => npc.needs));
});

test('critical needs show icons above the inhabitant and the needs panel draws three bars', async () => {
  const { drawNeedsPanel, renderSpriteScene } = await import('../src/core/sprite_engine.js');
  const { cellCenter, INITIAL_SHELTER_GRID } = await import('../src/core/shelter_engine.js');
  const texts = [];
  const bars = [];
  const ctx = { canvas: { width: 960, height: 600 }, save() {}, restore() {}, translate() {}, scale() {},
    createPattern() { return 'soil'; }, beginPath() {}, ellipse() {}, fill() {}, drawImage() {},
    fillText(text) { texts.push(text); }, fillRect(x, y, width, height) { if (height === 6) bars.push(this.fillStyle); } };
  renderSpriteScene(ctx, { grid: INITIAL_SHELTER_GRID,
    player: { ...cellCenter(0, 1), floor: 0, vx: 0, facing: 1, liftTarget: null },
    inhabitants: [{ id: 'tired', floor: 0, column: 1, offsetX: 0, role: 'resident', loyalty: 30,
      needs: { satiety: 10, rest: 80, morale: 5 } }],
    camera: { offset_x: 0, offset_y: 0 }, assets: { getImage: () => ({ width: 1200, height: 800 }) } });
  assert.deepEqual(texts, ['⚠', '🍖', '☹']);

  texts.length = 0;
  drawNeedsPanel(ctx, 100, 100, { satiety: 10, rest: 50, morale: 90 });
  assert.deepEqual(texts, ['FOME', 'CANSAÇO', 'MORAL']);
  assert.deepEqual(bars.filter((color) => color !== '#2a2f2c'), ['#ff263d', '#e6c75a', '#39ff14']);
});
