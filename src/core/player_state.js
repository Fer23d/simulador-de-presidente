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

export const SKIN_RARITIES = Object.freeze({
  common: Object.freeze({ label: 'COMUM', color: '#b9c7bd' }),
  rare: Object.freeze({ label: 'RARA', color: '#6fb7ff' }),
  epic: Object.freeze({ label: 'ÉPICA', color: '#c58bff' }),
  legendary: Object.freeze({ label: 'LENDÁRIA', color: '#ffb000' }),
});

// tint retinge so os pixels do sprite (blend + mascara de alfa); aura, effect e accessory sao desenhados em volta.
const skin = (data) => Object.freeze({ tint: null, aura: null, effect: null, accessory: null, requires: null, ...data });
export const PRESIDENT_SKINS = Object.freeze([
  skin({ id: 'default', name: 'Uniforme do Vault', cost: 0, rarity: 'common', filter: 'none',
    description: 'O uniforme padrão de quem fechou a porta do cofre.' }),
  skin({ id: 'scrap_armor', name: 'Armadura de Sucata', cost: 5_000, rarity: 'common',
    filter: 'grayscale(.7) contrast(1.25) sepia(.25)', tint: { blend: 'overlay', colors: ['#c9cfd2', '#5b6064'], alpha: .45 },
    description: 'Placas de metal rebitadas sobre o uniforme. Barulhenta, mas segura.' }),
  skin({ id: 'business', name: 'Terno Pré-Guerra', cost: 6_000, rarity: 'common',
    filter: 'grayscale(.85) contrast(1.15)', tint: { blend: 'color', colors: ['#2b3a6b', '#1b2238'], alpha: .85 },
    accessory: 'tie', description: 'O último terno engomado do mundo. Ainda cheira a poder.' }),
  skin({ id: 'hazmat', name: 'Traje Antirradiação', cost: 8_000, rarity: 'common',
    filter: 'grayscale(1) brightness(1.15)', tint: { blend: 'multiply', colors: ['#f6d23a', '#d9a41c'], alpha: 1 },
    accessory: 'visor', description: 'Borracha amarela da cabeça aos pés. A radiação que se vire.' }),
  skin({ id: 'golden', name: 'Traje Dourado Ridículo', cost: 10_000, rarity: 'rare',
    filter: 'sepia(.9) saturate(2.4) brightness(1.15)', tint: { blend: 'overlay', colors: ['#fff1a8', '#b8860b'], alpha: .55, shimmer: true },
    aura: { color: 'rgba(255, 210, 90, .75)', blur: 10 }, effect: 'sparkle', accessory: 'crown',
    description: 'Ouro maciço, coroa incluída. O povo passa fome, mas o comandante brilha.' }),
  skin({ id: 'raider', name: 'Couro de Saqueador', cost: 12_000, rarity: 'rare',
    filter: 'sepia(.6) saturate(1.3) contrast(1.15)', tint: { blend: 'multiply', colors: ['#b07a52', '#5e3a22'], alpha: .9 },
    accessory: 'mohawk', description: 'Couro curtido, moicano vermelho e nenhum respeito pelas regras do Vault.' }),
  skin({ id: 'cultist', name: 'Manto de Cultista', cost: 15_000, rarity: 'rare',
    filter: 'hue-rotate(82deg) saturate(1.4) brightness(.8)', tint: { blend: 'multiply', colors: ['#9b7cff', '#2a1640'], alpha: .85 },
    aura: { color: 'rgba(160, 90, 255, .7)', blur: 9 }, effect: 'embers', accessory: 'eyes', eyeColor: '#c38bff',
    description: 'Seguidores do Átomo juram que você foi escolhido pela bomba.' }),
  skin({ id: 'generalissimo', name: 'Farda de Generalíssimo', cost: 20_000, rarity: 'epic',
    filter: 'grayscale(.55) brightness(.85) contrast(1.2)', tint: { blend: 'color', colors: ['#5b6b2c', '#2f3818'], alpha: .9 },
    accessory: 'medals', description: 'Medalhas por batalhas que nunca aconteceram. Ninguém ousa perguntar.' }),
  skin({ id: 'ghoul', name: 'Brilho Radioativo', cost: 25_000, rarity: 'epic', requires: 'weather-radstorm',
    filter: 'brightness(.95) saturate(.7)', tint: { blend: 'screen', colors: ['#3dff7a', '#0e5a2a'], alpha: .5, shimmer: true },
    aura: { color: 'rgba(60, 255, 120, .9)', blur: 14, pulse: true }, effect: 'radiation', accessory: 'eyes', eyeColor: '#9dffb8',
    description: 'Sobreviveu a uma tempestade radioativa e agora brilha no escuro.' }),
  skin({ id: 'shadow', name: 'Sombra do Ermo', cost: 40_000, rarity: 'legendary', requires: 'rare-full-map',
    filter: 'brightness(.18) contrast(1.5)', tint: null,
    aura: { color: 'rgba(255, 40, 40, .65)', blur: 12, pulse: true }, effect: 'smoke', accessory: 'eyes', eyeColor: '#ff3b30',
    description: 'Quem mapeou cada ruína do Ermo deixa de ser homem e vira lenda.' }),

  // Exclusivas de classe: a primeira sai por sucata; a segunda e PREMIUM e so e liberada por direito de uso da loja.
  skin({ id: 'worker_welder', name: 'Macacão de Soldador', cost: 18_000, rarity: 'epic', exclusiveClass: 'worker',
    filter: 'saturate(.8) contrast(1.15)', tint: { blend: 'multiply', colors: ['#d98a45', '#6b3f22'], alpha: .85 },
    pattern: 'soot', accessory: 'welding_mask', effect: 'sparks',
    description: 'Macacão de lona chamuscado e máscara de solda com visor incandescente. Faíscas onde quer que ande.' }),
  skin({ id: 'worker_foreman', name: 'Capataz de Ouro', cost: 0, rarity: 'legendary', exclusiveClass: 'worker', premium: true,
    filter: 'sepia(.85) saturate(2.2) brightness(1.1)', tint: { blend: 'overlay', colors: ['#fff4b8', '#a8740a'], alpha: .6, shimmer: true },
    aura: { color: 'rgba(255, 205, 80, .7)', blur: 11 }, accessory: 'headlamp', effect: 'sparkle',
    description: 'Capacete folheado a ouro com lanterna de mineiro acesa. Constrói o Vault com estilo.' }),
  skin({ id: 'commander_nightops', name: 'Operações Noturnas', cost: 18_000, rarity: 'epic', exclusiveClass: 'commander',
    filter: 'grayscale(.9) brightness(1.05) contrast(1.25)', tint: { blend: 'multiply', colors: ['#8fa097', '#3d4943'], alpha: .9 },
    pattern: 'camo', accessory: 'nvg', aura: { color: 'rgba(80, 255, 120, .35)', blur: 6 },
    description: 'Camuflagem digital e óculos de visão noturna. Ninguém no Vault vê o comandante chegar.' }),
  skin({ id: 'commander_supreme', name: 'Comandante Supremo', cost: 0, rarity: 'legendary', exclusiveClass: 'commander', premium: true,
    filter: 'grayscale(.6) brightness(.8) contrast(1.25)', tint: { blend: 'color', colors: ['#1f2a4d', '#0d1226'], alpha: .9 },
    pattern: 'braid', aura: { color: 'rgba(255, 196, 64, .55)', blur: 8 }, accessory: 'beret',
    description: 'Farda azul-noite, boina vermelha, dragonas e alamares de ouro. O exército inteiro presta continência.' }),
  skin({ id: 'doctor_containment', name: 'Jaleco de Contenção', cost: 18_000, rarity: 'epic', exclusiveClass: 'doctor',
    filter: 'grayscale(.8) brightness(1.25) contrast(1.1)', tint: { blend: 'screen', colors: ['#f3f7f2', '#b9c4bd'], alpha: .35 },
    pattern: 'hazard', accessory: 'respirator', effect: 'bio',
    description: 'Jaleco selado com faixas de risco biológico e respirador de duplo filtro. Nenhum esporo passa.' }),
  skin({ id: 'doctor_plague', name: 'Médico da Peste', cost: 0, rarity: 'legendary', exclusiveClass: 'doctor', premium: true,
    filter: 'grayscale(.85) brightness(.72) contrast(1.3)', tint: { blend: 'multiply', colors: ['#9a7b58', '#3a2c1f'], alpha: .85 },
    aura: { color: 'rgba(170, 120, 255, .45)', blur: 9, pulse: true }, accessory: 'plague_mask', effect: 'incense',
    description: 'Máscara de bico com lentes de vidro, chapéu de abas largas e capa de couro encerado. A cura tem um preço.' }),
  skin({ id: 'survivor_wanderer', name: 'Andarilho do Ermo', cost: 18_000, rarity: 'epic', exclusiveClass: 'survivor',
    filter: 'sepia(.55) saturate(1.1) contrast(1.1)', tint: { blend: 'multiply', colors: ['#d8b98a', '#7a5a3a'], alpha: .75 },
    accessory: 'poncho', effect: 'dust',
    description: 'Poncho tecido à mão e cachecol ao vento. Cada fio carrega a poeira de mil quilômetros.' }),
  skin({ id: 'survivor_legend', name: 'Lenda Viva', cost: 0, rarity: 'legendary', exclusiveClass: 'survivor', premium: true,
    filter: 'grayscale(.8) brightness(.35) contrast(1.4)', tint: null, pattern: 'scars',
    aura: { color: 'rgba(255, 120, 30, .7)', blur: 12, pulse: true }, accessory: 'eyes', eyeColor: '#ff9a2e', effect: 'embers_fire',
    description: 'Cicatrizes que ainda queimam como brasa. Sobreviveu a tudo e o fogo da bomba vive dentro dele.' }),
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

export function isSkinAvailableForClass(skin, classId) {
  return Boolean(skin) && (!skin.exclusiveClass || skin.exclusiveClass === classId);
}

export function normalizePlayerCosmetics(state = {}) {
  const unlockedSkins = [...new Set(['default', ...(Array.isArray(state.unlockedSkins)
    ? state.unlockedSkins.filter((id) => SKINS_BY_ID.has(id)) : [])])];
  const presidentClass = CLASS_IDS.has(state.presidentClass) ? state.presidentClass : null;
  const equipped = getSkin(state.equippedSkin);
  return {
    presidentClass,
    president_selection_pending: Boolean(state.president_selection_pending),
    unlockedSkins,
    equippedSkin: unlockedSkins.includes(state.equippedSkin)
      && (!equipped?.exclusiveClass || equipped.exclusiveClass === presidentClass) ? state.equippedSkin : 'default',
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

export function isSkinRequirementMet(skin, discovered = []) {
  return !skin?.requires || new Set(discovered).has(skin.requires);
}

// discovered: ids da enciclopedia ja descobertos; algumas vestimentas exigem uma descoberta antes da compra.
export function purchaseSkin(state, skinId, { discovered = [] } = {}) {
  const skin = getSkin(skinId);
  if (!state?.is_wasteland || !skin || skin.id === 'default' || !state.shelter_grid?.flat().some((room) => room?.type === 'presidential_suite')
    || state.unlockedSkins?.includes(skin.id)) return state;
  if (!isSkinAvailableForClass(skin, state.presidentClass)) return { ...state, notice: `${skin.name} é exclusiva de outra classe.` };
  if (skin.premium) return { ...state, notice: `${skin.name} é PREMIUM e chega pela loja do Vault.` };
  if (!isSkinRequirementMet(skin, discovered)) return { ...state, notice: `${skin.name} exige uma descoberta rara na Enciclopédia do Ermo.` };
  if ((Number(state.scrap) || 0) < skin.cost) return { ...state, notice: 'Sucata insuficiente para adquirir esta vestimenta.' };
  return {
    ...state,
    scrap: state.scrap - skin.cost,
    unlockedSkins: [...new Set([...(state.unlockedSkins ?? ['default']), skin.id])],
    notice: `${skin.name} adquirida.`,
  };
}

// entitled: skins premium cujo direito de uso ja pertence a conta do jogador (loja), fora do save da partida.
export function equipSkin(state, skinId, { entitled = [] } = {}) {
  const skin = getSkin(skinId);
  const owned = state?.unlockedSkins?.includes(skinId) || (skin?.premium && entitled.includes(skinId));
  if (!state?.is_wasteland || !state.shelter_grid?.flat().some((room) => room?.type === 'presidential_suite')
    || !owned || !skin || !isSkinAvailableForClass(skin, state.presidentClass) || state.equippedSkin === skinId) return state;
  return { ...state, equippedSkin: skinId, unlockedSkins: [...new Set([...(state.unlockedSkins ?? ['default']), skinId])],
    notice: `${skin.name} equipada.` };
}

export function getPresidentSpriteKey(classId) {
  return getPresidentClass(classId)?.spriteSheet ?? 'character_sheet';
}
