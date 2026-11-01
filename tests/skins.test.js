import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, hydrateGameState } from '../src/core/game-state.js';
import {
  equipSkin, getSkin, isSkinAvailableForClass, isSkinRequirementMet, PRESIDENT_CLASSES, PRESIDENT_SKINS, purchaseSkin,
  SKIN_RARITIES,
} from '../src/core/player_state.js';
import {
  createEntitlements, getActiveTrial, grantPremiumSkin, hasPremiumSkin, SKIN_TRIAL_DURATION_MS, startSkinTrial,
} from '../src/core/store.js';
import { ENCYCLOPEDIA_ENTRIES } from '../src/core/encyclopedia.js';
import { renderWardrobeView } from '../src/ui/dashboard.js';

function suiteState(scrap = 100_000, presidentClass = 'worker') {
  const base = createGameState('bra');
  const state = { ...base, is_wasteland: true, scrap, presidentClass, shelter_grid: base.shelter_grid.map((row) => [...row]) };
  state.shelter_grid[0][2] = { id: 'suite', type: 'presidential_suite', floor: 0, column: 2, level: 1 };
  return state;
}

test('the catalog has unique skins with rarities, descriptions and valid requirements', () => {
  assert.equal(new Set(PRESIDENT_SKINS.map((skin) => skin.id)).size, PRESIDENT_SKINS.length);
  const entryIds = new Set(ENCYCLOPEDIA_ENTRIES.map((item) => item.id));
  for (const skin of PRESIDENT_SKINS) {
    assert.ok(SKIN_RARITIES[skin.rarity], skin.id);
    assert.ok(skin.description.length > 10, skin.id);
    if (skin.requires) assert.ok(entryIds.has(skin.requires), skin.id);
  }
  assert.equal(getSkin('default').cost, 0);
});

test('every president class has one scrap exclusive and one premium exclusive', () => {
  for (const profile of PRESIDENT_CLASSES) {
    const exclusives = PRESIDENT_SKINS.filter((skin) => skin.exclusiveClass === profile.id);
    assert.equal(exclusives.length, 2, profile.id);
    assert.equal(exclusives.filter((skin) => skin.premium).length, 1, profile.id);
    assert.ok(exclusives.find((skin) => !skin.premium).cost > 0, profile.id);
  }
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

test('class exclusives are only sold and worn by their class', () => {
  const worker = suiteState(100_000, 'worker');
  const doctor = suiteState(100_000, 'doctor');
  assert.equal(isSkinAvailableForClass(getSkin('worker_welder'), 'worker'), true);
  assert.equal(isSkinAvailableForClass(getSkin('worker_welder'), 'doctor'), false);
  const bought = purchaseSkin(worker, 'worker_welder');
  assert.ok(bought.unlockedSkins.includes('worker_welder'));
  assert.equal(equipSkin(bought, 'worker_welder').equippedSkin, 'worker_welder');
  assert.match(purchaseSkin(doctor, 'worker_welder').notice, /exclusiva de outra classe/);
  const smuggled = { ...doctor, unlockedSkins: ['default', 'worker_welder'] };
  assert.equal(equipSkin(smuggled, 'worker_welder').equippedSkin, 'default');
  const restored = hydrateGameState(JSON.stringify({ ...smuggled, equippedSkin: 'worker_welder' }));
  assert.equal(restored.equippedSkin, 'default');
});

test('premium skins cannot be bought with scrap and are worn only through store entitlements', () => {
  const state = suiteState(1_000_000, 'commander');
  const refused = purchaseSkin(state, 'commander_supreme');
  assert.match(refused.notice, /PREMIUM/);
  assert.equal(refused.scrap, state.scrap);
  assert.equal(equipSkin(state, 'commander_supreme').equippedSkin, 'default');
  const entitlements = grantPremiumSkin(createEntitlements(), 'commander_supreme');
  assert.equal(hasPremiumSkin(entitlements, 'commander_supreme'), true);
  const worn = equipSkin(state, 'commander_supreme', { entitled: entitlements.skins });
  assert.equal(worn.equippedSkin, 'commander_supreme');
  assert.ok(worn.unlockedSkins.includes('commander_supreme'));
});

test('entitlements ignore unknown or non-premium skins and grants are idempotent', () => {
  assert.deepEqual(createEntitlements({ skins: ['golden', 'bogus', 'doctor_plague', 'doctor_plague'] }).skins, ['doctor_plague']);
  const once = grantPremiumSkin(createEntitlements(), 'survivor_legend');
  assert.deepEqual(grantPremiumSkin(once, 'survivor_legend').skins, ['survivor_legend']);
  assert.deepEqual(grantPremiumSkin(once, 'golden').skins, ['survivor_legend']);
});

test('the fitting room lends a premium skin for two minutes only', () => {
  assert.equal(startSkinTrial('golden', 0), null);
  const trial = startSkinTrial('worker_foreman', 1_000);
  assert.deepEqual(trial, { skinId: 'worker_foreman', endsAt: 1_000 + SKIN_TRIAL_DURATION_MS });
  assert.equal(getActiveTrial(trial, 1_000 + SKIN_TRIAL_DURATION_MS - 1), trial);
  assert.equal(getActiveTrial(trial, 1_000 + SKIN_TRIAL_DURATION_MS), null);
});

test('the wardrobe groups class exclusives, marks premium and shows the fitting room', () => {
  const state = { ...suiteState(9_000, 'worker'), unlockedSkins: ['default', 'hazmat'], equippedSkin: 'hazmat' };
  const view = renderWardrobeView(state, { now: 0 });
  assert.match(view, /EXCLUSIVAS · O OPERÁRIO/);
  assert.match(view, /Macacão de Soldador/);
  assert.match(view, /Capataz de Ouro/);
  assert.doesNotMatch(view, /Médico da Peste|Comandante Supremo|Lenda Viva|Operações Noturnas/);
  assert.match(view, /★ PREMIUM/);
  assert.match(view, /data-action="skin-trial" data-skin="worker_foreman"/);
  assert.match(view, /LOJA EM BREVE/);
  assert.match(view, /COLEÇÃO 2\/18/);
  assert.match(view, /TRILHA DE NÍVEIS · EXCLUSIVAS \(SEU NÍVEL: 1\)/);
  assert.match(view, /Casaco de Estadista/);
  assert.match(view, /★ TRILHA · NV 60/);
  assert.match(view, /\[ 🔒 NÍVEL 10 · FALTAM 9 \]/);
  assert.match(view, /data-action="skin-trial" data-skin="trail_statesman"/);
  assert.doesNotMatch(view, /data-action="skin-buy" data-skin="trail_/, 'trail skins are never bought');
  assert.match(view, /🔒 Requer descoberta: \?\?\?/);
  assert.match(view, /data-action="skin-equip" data-skin="hazmat" disabled>\[ EQUIPADA \]/);
  const trying = renderWardrobeView(state, { trial: { skinId: 'worker_foreman', endsAt: 90_000 }, now: 0 });
  assert.match(trying, /PROVADOR ATIVO: Capataz de Ouro · 1:30/);
  assert.match(trying, /PROVANDO · 1:30/);
  const entitled = renderWardrobeView(state, { entitled: ['worker_foreman'], now: 0 });
  assert.match(entitled, /data-action="skin-equip" data-skin="worker_foreman"/);
});

test('the six Level Track skins are exclusive: one per level ending in 0, never sold, always free of cost', async () => {
  const { LEVEL_SKINS, getLevelTier } = await import('../src/core/levels.js');
  const trail = PRESIDENT_SKINS.filter((skin) => skin.levelReward);
  assert.equal(trail.length, 6);
  assert.deepEqual(trail.map((skin) => skin.levelReward), [10, 20, 30, 40, 50, 60]);
  for (const skin of trail) {
    assert.equal(LEVEL_SKINS[skin.levelReward], skin.id, 'the level table points at the skin');
    assert.equal(getLevelTier(skin.levelReward), 'zero', 'only levels ending in 0');
    assert.equal(skin.cost, 0);
    assert.ok(!skin.premium && !skin.exclusiveClass, 'not a store or class skin');
    assert.match(skin.id, /^trail_/);
    assert.ok(skin.description.length > 20);
  }
  assert.equal(new Set(trail.map((skin) => skin.accessory)).size, 6, 'six different head pieces');
  assert.deepEqual(trail.map((skin) => skin.accessory), ['trilby', 'beret', 'laurel', 'hardhat', 'halo', 'circlet']);
  assert.deepEqual(trail.map((skin) => skin.garment), ['statesman_coat', 'veteran_gear', 'founder_tunic', 'architect_vest', 'legend_coat', 'president_regalia'],
    'six different pieces of clothing, drawn on top of the sprite');
  assert.deepEqual(trail.filter((skin) => skin.keepFace).map((skin) => skin.levelReward), [10, 20, 30, 40, 60], 'faces keep their natural colour, except the dark Legend');
  assert.ok(!PRESIDENT_SKINS.some((skin) => skin.id === 'debug_grid'), 'no calibration leftovers');
  assert.deepEqual(trail.map((skin) => skin.rarity), ['rare', 'epic', 'epic', 'legendary', 'legendary', 'legendary'], 'rarity climbs with the level');
  const state = { ...suiteState(999_999, 'worker'), unlockedSkins: ['default'] };
  for (const skin of trail) {
    const attempt = purchaseSkin(state, skin.id);
    assert.equal(attempt.scrap, state.scrap, 'no scrap is spent');
    assert.ok(!attempt.unlockedSkins.includes(skin.id));
    assert.match(attempt.notice, new RegExp(`Trilha de Níveis e chega no nível ${skin.levelReward}`));
  }
  const buyable = PRESIDENT_SKINS.filter((skin) => !skin.levelReward && !skin.premium && skin.id !== 'default');
  assert.ok(buyable.length >= 10 && buyable.every((skin) => skin.cost > 0), 'everything else is still bought with scrap');
});

test('a Level Track skin can be tried on before it is earned, and is equipped normally once unlocked', async () => {
  const { startSkinTrial, getActiveTrial } = await import('../src/core/store.js');
  const trial = startSkinTrial('trail_legend', 0);
  assert.ok(trial, 'the fitting room works for the track skins');
  assert.equal(getActiveTrial(trial, 1_000)?.skinId, 'trail_legend');
  assert.equal(startSkinTrial('scrap_armor', 0), null, 'ordinary skins are still bought, not tried');
  const earned = { ...suiteState(0, 'survivor'), unlockedSkins: ['default', 'trail_legend'] };
  const equipped = equipSkin(earned, 'trail_legend');
  assert.equal(equipped.equippedSkin, 'trail_legend');
  assert.equal(equipSkin({ ...earned, unlockedSkins: ['default'] }, 'trail_legend').equippedSkin, earned.equippedSkin, 'not earned, not equipped');
});

test('every Level Track skin draws on the actor without errors, including the new laurel, halo and cape', async () => {
  const { drawSkinPreview } = await import('../src/core/sprite_engine.js');
  const calls = [];
  const gradient = { addColorStop() {} };
  const ctx = new Proxy({}, { get: (target, property) => {
    if (property === 'canvas') return { width: 120, height: 150 };
    if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => gradient;
    if (property === 'getImageData') return () => ({ data: new Uint8ClampedArray(4 * 16), width: 4, height: 4 });
    return (...args) => { calls.push(property); return undefined; };
  }, set: () => true });
  const sheet = { width: 400, height: 400, naturalWidth: 400, naturalHeight: 400 };
  const assets = { getImage: () => sheet };
  for (const skin of PRESIDENT_SKINS.filter((candidate) => candidate.levelReward)) {
    assert.doesNotThrow(() => drawSkinPreview(ctx, { assets, presidentClass: 'survivor', skinId: skin.id, time: 321 }), skin.id);
  }
});
