import { getSkin, PRESIDENT_SKINS } from './player_state.js';

// Direitos de uso da loja pertencem a conta do jogador, nao a partida: sobrevivem a uma Nova Partida.
// Uma futura integracao de pagamento so precisa chamar grantPremiumSkin depois de confirmar a compra.
export const SKIN_TRIAL_DURATION_MS = 120_000;
const PREMIUM_IDS = new Set(PRESIDENT_SKINS.filter((skin) => skin.premium).map((skin) => skin.id));

export function createEntitlements(value = {}) {
  const skins = Array.isArray(value?.skins) ? value.skins.filter((id) => PREMIUM_IDS.has(id)) : [];
  return { version: 1, skins: [...new Set(skins)] };
}

export function grantPremiumSkin(entitlements, skinId) {
  const current = createEntitlements(entitlements);
  if (!PREMIUM_IDS.has(skinId) || current.skins.includes(skinId)) return current;
  return { ...current, skins: [...current.skins, skinId] };
}

export function hasPremiumSkin(entitlements, skinId) {
  return createEntitlements(entitlements).skins.includes(skinId);
}

// Provador: veste uma skin premium por tempo limitado, so na sessao atual, sem tocar no save.
export function startSkinTrial(skinId, now = Date.now()) {
  const skin = getSkin(skinId);
  if (!skin?.premium) return null;
  return { skinId, endsAt: now + SKIN_TRIAL_DURATION_MS };
}

export function getActiveTrial(trial, now = Date.now()) {
  return trial && Number(trial.endsAt) > now && getSkin(trial.skinId)?.premium ? trial : null;
}
