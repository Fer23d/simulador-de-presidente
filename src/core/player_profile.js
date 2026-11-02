import { getPresidentClass } from './player_state.js';

export const DEFAULT_PLAYER_NAME = 'Presidente';
export const MAX_PLAYER_NAME_LENGTH = 32;

export const SUPPORTED_LANGUAGES = Object.freeze([
  { id: 'pt-BR', label: 'Português (Brasil)' },
  { id: 'es', label: 'Español' },
  { id: 'en', label: 'English' },
]);

const LANGUAGE_IDS = new Set(SUPPORTED_LANGUAGES.map((language) => language.id));

function normalizeName(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_PLAYER_NAME_LENGTH);
}

export function normalizeLanguage(value) {
  return LANGUAGE_IDS.has(value) ? value : 'pt-BR';
}

export function createPlayerProfile(value = {}) {
  return {
    name: normalizeName(value.name ?? value.playerName),
    language: normalizeLanguage(value.language),
  };
}

export function getPlayerDisplayName(state) {
  const name = normalizeName(state?.playerProfile?.name);
  return name || (state?.title && state.title !== 'Presidente' ? state.title : DEFAULT_PLAYER_NAME);
}

// Nome do protagonista nas historias e dialogos: o do perfil do jogador e, sem ele, o do lider da classe escolhida.
export function getLeaderName(state) {
  const name = normalizeName(state?.playerProfile?.name);
  return name || getPresidentClass(state?.presidentClass)?.leader || 'O Presidente';
}

export function updatePlayerProfile(state, patch = {}) {
  const profile = createPlayerProfile({ ...state.playerProfile, ...patch });
  return {
    ...state,
    playerProfile: profile,
    notice: profile.name ? `Identidade atualizada: ${profile.name}.` : 'Identidade mantida como Presidente.',
  };
}
