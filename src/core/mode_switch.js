// Troca de modo: Presidencia, Vault e Cidade. Ao zerar um modo (final do Vault, epilogo da Cidade, fim ou marco da
// Presidencia), o jogador pode comecar em qualquer outro. O progresso fica na conta, entao a troca segue liberada.
import { getGameMode } from './levels.js';

export const MODES = Object.freeze([
  Object.freeze({ id: 'presidency', label: 'Presidência', icon: '🏛️', text: 'Governe um país, faça diplomacia e guerra.' }),
  Object.freeze({ id: 'vault', label: 'Vault', icon: '☢️', text: 'Comande a colônia subterrânea depois da bomba.' }),
  Object.freeze({ id: 'city', label: 'Cidade', icon: '🏙️', text: 'Reconstrua o mundo, construção por construção.' }),
]);

export const PRESIDENCY_MILESTONE_MONTHS = 120;
export const MODES_DONE_PREF = 'modesDone';

// O modo atual esta zerado? Vault: chegou a um final. Cidade: epilogo pronto. Presidencia: fim de jogo, uma missao historica
// cumprida ou dez anos no poder.
export function isModeCompleted(state) {
  const mode = getGameMode(state);
  if (mode === 'city') return Boolean(state?.city?.result);
  if (mode === 'vault') return Boolean(state?.ending);
  return Boolean(state?.regime?.gameOver)
    || Object.keys(state?.missions?.completed ?? {}).length > 0
    || (Number(state?.monthCounter) || 0) >= PRESIDENCY_MILESTONE_MONTHS;
}

export function normalizeModesDone(value) {
  return Object.fromEntries(MODES.map((mode) => [mode.id, value?.[mode.id] === true]));
}

export function markModeDone(done, state) {
  const current = normalizeModesDone(done);
  return isModeCompleted(state) ? { ...current, [getGameMode(state)]: true } : current;
}

// A troca fica liberada quando o modo atual esta zerado ou a conta ja zerou algum modo.
export function canSwitchMode(state, done) {
  return isModeCompleted(state) || Object.values(normalizeModesDone(done)).some(Boolean);
}

export const getOtherModes = (state) => MODES.filter((mode) => mode.id !== getGameMode(state));
