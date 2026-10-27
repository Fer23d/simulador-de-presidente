import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/game-state.js';
import { equipSkin, getSkin, isSkinRequirementMet, PRESIDENT_SKINS, purchaseSkin, SKIN_RARITIES } from '../src/core/player_state.js';
import { ENCYCLOPEDIA_ENTRIES } from '../src/core/encyclopedia.js';
import { renderWardrobeView } from '../src/ui/dashboard.js';

function suiteState(scrap = 100_000) {
  const base = createGameState('bra');
  const state = { ...base, is_wasteland: true, scrap, shelter_grid: base.shelter_grid.map((row) => [...row]) };
  state.shelter_grid[0][2] = { id: 'suite', type: 'presidential_suite', floor: 0, column: 2, level: 1 };
  return state;
}

test('the catalog has ten unique skins with rarities, descriptions and valid encyclopedia requirements', () => {
  assert.equal(PRESIDENT_SKINS.length, 10);
  assert.equal(new Set(PRESIDENT_SKINS.map((skin) => skin.id)).size, PRESIDENT_SKINS.length);
  const entryIds = new Set(ENCYCLOPEDIA_ENTRIES.map((item) => item.id));
  for (const skin of PRESIDENT_SKINS) {
    assert.ok(SKIN_RARITIES[skin.rarity], skin.id);
    assert.ok(skin.description.length > 10, skin.id);
    if (skin.requires) assert.ok(entryIds.has(skin.requires), skin.id);
  }
  assert.equal(getSkin('default').cost, 0);
});

test('rare skins require their encyclopedia discovery before they can be bought', () => {
  const state = suiteState();
  const shadow = getSkin('shadow');
  assert.equal(isSkinRequirementMet(shadow, []), false);
  const blocked = purchaseSkin(state, 'shadow');
  assert.match(blocked.notice, /exige uma descoberta/);
  assert.equal(blocked.scrap, state.scrap);
  const bought = purchaseSkin(state, 'shadow', { discovered: ['rare-full-map'] });
  assert.ok(bought.unlockedSkins.includes('shadow'));
  assert.equal(bought.scrap, state.scrap - shadow.cost);
  assert.equal(equipSkin(bought, 'shadow').equippedSkin, 'shadow');
});

test('the wardrobe shows previews, rarity, collection progress and locked requirements', () => {
  const state = { ...suiteState(9_000), unlockedSkins: ['default', 'hazmat'], equippedSkin: 'hazmat' };
  const locked = renderWardrobeView(state);
  assert.equal((locked.match(/data-skin-preview=/g) ?? []).length, PRESIDENT_SKINS.length);
  assert.match(locked, /COLEÇÃO 2\/10/);
  assert.match(locked, /LENDÁRIA/);
  assert.match(locked, /🔒 Requer descoberta: \?\?\?/);
  assert.match(locked, /data-action="skin-buy" data-skin="shadow" disabled/);
  const unlocked = renderWardrobeView(state, { discovered: ['weather-radstorm'] });
  assert.match(unlocked, /✓ Requer descoberta: Tempestade Radioativa/);
  assert.match(unlocked, /data-action="skin-equip" data-skin="hazmat" disabled>\[ EQUIPADA \]/);
});
