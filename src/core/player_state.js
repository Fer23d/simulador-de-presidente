export const PRESIDENT_CLASSES = Object.freeze([
  Object.freeze({ id: 'worker', name: 'O Operário', buff: 'Construções e melhorias custam 15% menos sucata.',
    flaw: 'Produz 15% menos Ciência.', spriteSheet: 'npc_walk_sheet', spriteRole: 'resident', spriteRow: 0, spriteRows: 4 }),
  Object.freeze({ id: 'commander', name: 'O Comandante', buff: 'Soldados têm o dobro da eficácia de Supressão.',
    flaw: 'Consumo global de comida aumenta 10%.', spriteSheet: 'npc_walk_sheet', spriteRole: 'guard', spriteRow: 3, spriteRows: 4 }),
  Object.freeze({ id: 'doctor', name: 'O Doutor', buff: 'Imunidade a doenças e à radiação passiva.',
    flaw: 'Causa 20% menos dano em combate manual.', spriteSheet: 'npc_walk_sheet', spriteRole: 'medic', spriteRow: 2, spriteRows: 4 }),
  Object.freeze({ id: 'survivor', name: 'O Sobrevivente', buff: 'Sem bônus: adaptável a qualquer situação.',
    flaw: 'Sem penalidades.', spriteSheet: 'character_sheet', spriteRole: 'president', spriteRow: 0, spriteRows: 2 }),
]);

export const PRESIDENT_SKINS = Object.freeze([
  Object.freeze({ id: 'default', name: 'Uniforme do Vault', cost: 0, filter: 'none' }),
  Object.freeze({ id: 'scrap_armor', name: 'Armadura de Sucata', cost: 5_000, filter: 'grayscale(.72) contrast(1.2) sepia(.22)' }),
  Object.freeze({ id: 'golden', name: 'Traje Dourado Ridículo', cost: 10_000, filter: 'sepia(.82) saturate(1.8) brightness(1.12)' }),
  Object.freeze({ id: 'cultist', name: 'Manto de Cultista', cost: 15_000, filter: 'hue-rotate(82deg) saturate(1.4)' }),
]);

const CLASS_IDS = new Set(PRESIDENT_CLASSES.map(({ id }) => id));
const SKINS_BY_ID = new Map(PRESIDENT_SKINS.map((skin) => [skin.id, skin]));
const NEUTRAL_MODIFIERS = Object.freeze({ buildCostMultiplier: 1, upgradeCostMultiplier: 1,
  scienceOutputMultiplier: 1, generatorOutputMultiplier: 1, loyaltyLossMultiplier: 1,
  suppressionMultiplier: 1, foodConsumptionMultiplier: 1,
  diseaseImmunity: false, radiationGainMultiplier: 1, combatDamageMultiplier: 1 });
const CLASS_MODIFIERS = Object.freeze({
  worker: Object.freeze({ ...NEUTRAL_MODIFIERS, buildCostMultiplier: .85, upgradeCostMultiplier: .85, scienceOutputMultiplier: .85 }),
  commander: Object.freeze({ ...NEUTRAL_MODIFIERS, suppressionMultiplier: 2, foodConsumptionMultiplier: 1.1 }),
  doctor: Object.freeze({ ...NEUTRAL_MODIFIERS, diseaseImmunity: true, radiationGainMultiplier: 0, combatDamageMultiplier: .8 }),
  survivor: NEUTRAL_MODIFIERS,
});

export function getPresidentClassModifiers(classId) {
  return CLASS_MODIFIERS[classId] ?? NEUTRAL_MODIFIERS;
}

export function getPresidentClass(classId) {
  return PRESIDENT_CLASSES.find((profile) => profile.id === classId) ?? null;
}

export function getSkin(skinId) {
  return SKINS_BY_ID.get(skinId) ?? null;
}

export function normalizePlayerCosmetics(state = {}) {
  const unlockedSkins = [...new Set(['default', ...(Array.isArray(state.unlockedSkins)
    ? state.unlockedSkins.filter((id) => SKINS_BY_ID.has(id)) : [])])];
  return {
    presidentClass: CLASS_IDS.has(state.presidentClass) ? state.presidentClass : null,
    president_selection_pending: Boolean(state.president_selection_pending),
    unlockedSkins,
    equippedSkin: unlockedSkins.includes(state.equippedSkin) ? state.equippedSkin : 'default',
  };
}

export function startGame(state, classId) {
  if (!state?.is_wasteland || !state.president_selection_pending || !CLASS_IDS.has(classId)) return state;
  return {
    ...state,
    presidentClass: classId,
    president_selection_pending: false,
    notice: `${getPresidentClass(classId).name} assumiu o comando do Vault.`,
  };
}

export function purchaseSkin(state, skinId) {
  const skin = getSkin(skinId);
  if (!state?.is_wasteland || !skin || skin.id === 'default' || !state.shelter_grid?.flat().some((room) => room?.type === 'presidential_suite')
    || state.unlockedSkins?.includes(skin.id)) return state;
  if ((Number(state.scrap) || 0) < skin.cost) return { ...state, notice: 'Sucata insuficiente para adquirir esta vestimenta.' };
  return {
    ...state,
    scrap: state.scrap - skin.cost,
    unlockedSkins: [...new Set([...(state.unlockedSkins ?? ['default']), skin.id])],
    notice: `${skin.name} adquirida.`,
  };
}

export function equipSkin(state, skinId) {
  if (!state?.is_wasteland || !state.shelter_grid?.flat().some((room) => room?.type === 'presidential_suite')
    || !state.unlockedSkins?.includes(skinId) || !getSkin(skinId) || state.equippedSkin === skinId) return state;
  return { ...state, equippedSkin: skinId, notice: `${getSkin(skinId).name} equipada.` };
}

export function getPresidentSpriteKey(classId) {
  return getPresidentClass(classId)?.spriteSheet ?? 'character_sheet';
}
