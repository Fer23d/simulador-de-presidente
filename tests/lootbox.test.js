import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, hydrateGameState } from '../src/core/game-state.js';
import { advanceMonthlyGameMechanics } from '../src/core/game_mechanics.js';
import { advanceLootboxClick, collectExpeditionLoot, createExpeditionLoot, openExpeditionLootbox } from '../src/core/expeditions.js';
import { nextRandom } from '../src/core/geopolitics.js';
import { bunkerView, expeditionReportView } from '../src/ui/dashboard.js';
import { advanceWastelandMonth } from '../src/core/wasteland.js';
import { isLootboxCrateClick } from '../src/core/lootbox_renderer.js';

function seedForSuccessfulExpedition() {
  for (let seed = 1; seed < 100_000; seed++) {
    if (nextRandom(seed).value < 0.7) return seed;
  }
  throw new Error('A deterministic successful expedition seed was not found.');
}

test('successful expedition holds its random rewards until the player collects the revealed crate', () => {
  const base = createGameState('bra');
  const state = {
    ...base,
    is_wasteland: true,
    randomSeed: seedForSuccessfulExpedition(),
    scrap: 400,
    science: 20,
    shelter_supplies: { ...base.shelter_supplies, food: 50, energy: 40 },
    inhabitants: [{ id: 'scout-1', is_on_expedition: true, expedition_timer: 1, loyalty: 100 }],
    pendingExpeditionReports: [],
  };
  const returned = advanceMonthlyGameMechanics(state);

  assert.equal(returned.pendingLoot, true);
  assert.ok(Array.isArray(returned.currentLoot) && returned.currentLoot.length >= 2);
  assert.equal(returned.scrap, state.scrap);
  assert.equal(returned.science, state.science);
  assert.equal(returned.shelter_supplies.food, state.shelter_supplies.food);
  assert.equal(returned.pendingExpeditionReports[0].success, true);
  assert.match(returned.notice, /COFRE DO ERMO|CARGA DO ERMO/i);
  assert.ok(returned.currentLoot.every((reward) => ['scrap', 'science', 'food', 'energy', 'medkits'].includes(reward.resource)));
});
test('lootbox requires opening and exactly three clicks before collection is enabled', () => {
  const loot = createExpeditionLoot(73);
  let state = openExpeditionLootbox({ pendingLoot: true, currentLoot: loot.loot, lootbox_opened: false });
  assert.equal(state.lootbox_opened, true);
  assert.equal(openExpeditionLootbox(state), state);

  state = advanceLootboxClick(state, 1.25);
  assert.equal(state.lootbox_click_count, 1);
  assert.equal(state.lootbox_revealed, false);
  state = advanceLootboxClick(state, 1.75);
  assert.equal(state.lootbox_click_count, 2);
  assert.equal(state.lootbox_revealed, false);
  state = advanceLootboxClick(state, 2.25);
  assert.equal(state.lootbox_click_count, 3);
  assert.equal(state.lootbox_revealed, true);
  assert.equal(state.lootbox_cards_visible, false);
  assert.equal(state.lootbox_revealed_at, 2.25);
  assert.equal(advanceLootboxClick(state, 3), state);
});

test('collecting revealed loot applies bounded rewards once and clears the pending crate', () => {
  const base = createGameState('bra');
  const rewards = [
    { id: 'a', resource: 'scrap', amount: 300, rarity: 'rare' },
    { id: 'b', resource: 'food', amount: 90, rarity: 'common' },
    { id: 'c', resource: 'technology', amount: 2, rarity: 'epic' },
  ];
  const pending = { ...base, is_wasteland: true, pendingLoot: true, currentLoot: rewards,
    lootbox_opened: true, lootbox_click_count: 3, lootbox_revealed: true,
    lootbox_cards_visible: true,
    pendingExpeditionReports: [{ id: 'success', inhabitantId: 'scout', success: true },
      { id: 'lost', inhabitantId: 'other', success: false }],
    shelter_supplies: { ...base.shelter_supplies, food: 10 }, scrap: 25,
    technology: { ...base.technology, points: 4 } };

  const tooEarly = collectExpeditionLoot({ ...pending, lootbox_revealed: false });
  assert.equal(tooEarly.pendingLoot, true);
  assert.equal(tooEarly.scrap, pending.scrap);
  const beforeCards = collectExpeditionLoot({ ...pending, lootbox_cards_visible: false });
  assert.equal(beforeCards.pendingLoot, true);
  const collected = collectExpeditionLoot(pending);
  assert.equal(collected.scrap, 325);
  assert.equal(collected.shelter_supplies.food, 100);
  assert.equal(collected.technology.points, 6);
  assert.equal(collected.pendingLoot, false);
  assert.deepEqual(collected.currentLoot, []);
  assert.deepEqual(collected.pendingExpeditionReports.map(({ id }) => id), ['lost']);
  assert.equal(collectExpeditionLoot(collected).scrap, collected.scrap);
});

test('lootbox rewards are deterministic for a given seed and do not grant invalid resource types', () => {
  const first = createExpeditionLoot(912);
  assert.deepEqual(createExpeditionLoot(912), first);
  assert.equal(first.loot.length, 3);
  assert.ok(first.loot.every((item) => ['scrap', 'science', 'food', 'energy', 'technology', 'medkits'].includes(item.resource)));
});

test('pending loot survives game save hydration with safe reward records', () => {
  const base = createGameState('bra');
  const snapshot = { ...base, is_wasteland: true, pendingLoot: true,
    currentLoot: [{ id: 'loot-a', resource: 'food', label: 'Comida', amount: 123, rarity: 'rare' }],
    lootbox_opened: true, lootbox_click_count: 2, lootbox_revealed: false,
    lootbox_shake_started_at: 4.5 };
  const restored = hydrateGameState(JSON.stringify(snapshot));
  assert.equal(restored.pendingLoot, true);
  assert.equal(restored.currentLoot[0].amount, 123);
  assert.equal(restored.lootbox_click_count, 2);
  assert.equal(restored.lootbox_opened, true);
  const restoredReveal = hydrateGameState(JSON.stringify({ ...snapshot, lootbox_click_count: 3, lootbox_revealed: true,
    lootbox_cards_visible: false }));
  assert.equal(restoredReveal.lootbox_cards_visible, true);
});

test('a successful expedition report yields to the loot crate until its rewards are collected', () => {
  const report = expeditionReportView({
    pendingLoot: true,
    pendingExpeditionReports: [{ id: 'success', inhabitantId: 'scout', success: true }],
  });
  assert.equal(report, '');
  const revealed = expeditionReportView({ pendingLoot: true, lootbox_revealed: true, lootbox_cards_visible: true,
    currentLoot: [{ id: 'loot-1', resource: 'food', label: 'Comida', amount: 250, rarity: 'epic' }],
    pendingExpeditionReports: [{ id: 'success', inhabitantId: 'scout-1', success: true,
      destination: 'Ruínas de Capital', vipFound: true, vipName: 'Dr. Isaac' }] });
  assert.match(revealed, /data-action="collect-expedition-loot"/);
  assert.match(revealed, /250/);
  assert.match(revealed, /role="dialog"/);
  assert.match(revealed, /Dr\. Isaac/);
  assert.match(revealed, /Ruínas de Capital/);
});

test('the wasteland month remains paused while expedition rewards are awaiting collection', () => {
  const base = createGameState('bra');
  const state = { ...base, is_wasteland: true, pendingLoot: true,
    currentLoot: [{ id: 'loot-pause', resource: 'scrap', label: 'Sucata', amount: 100, rarity: 'common' }],
    monthCounter: 7, wasteland_turn: 4 };
  const next = advanceWastelandMonth(state);
  assert.equal(next.monthCounter, 7);
  assert.equal(next.wasteland_turn, 4);
  assert.match(next.notice, /cofre|carga|recompensa/i);
});

test('bunker HUD prompts crate opening, exposes click progress, and limits clicks to the chest', () => {
  const base = createGameState('bra');
  const state = { ...base, is_wasteland: true, pendingLoot: true,
    currentLoot: [{ id: 'loot-hud', resource: 'food', label: 'Comida', amount: 50, rarity: 'common' }] };
  const unopened = bunkerView(state);
  assert.match(unopened, /data-action="open-expedition-lootbox"/);
  assert.match(unopened, /data-action="advance" disabled/);
  const opened = bunkerView({ ...state, lootbox_opened: true, lootbox_click_count: 2 });
  assert.match(opened, /COFRE DO ERMO · 2\/3/);
  assert.doesNotMatch(opened, /data-action="open-expedition-lootbox"/);
  assert.equal(isLootboxCrateClick({ x: 480, y: 300 }, 960, 600), true);
  assert.equal(isLootboxCrateClick({ x: 30, y: 30 }, 960, 600), false);
});
