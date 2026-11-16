// Botoes de troca de modo, usados nas telas de final (Vault e Cidade) e em Meu Perfil.
import { getOtherModes } from '../core/mode_switch.js';

export function modeSwitchButtons(state, { disabled = false } = {}) {
  return getOtherModes(state)
    .map((mode) => `<button type="button" class="quiet-action mode-switch-button" data-action="switch-mode" data-mode="${mode.id}" ${disabled ? 'disabled' : ''} title="${mode.text}">${mode.icon} Jogar no modo ${mode.label}</button>`)
    .join('');
}

export function modeSwitchRow(state) {
  return `<div class="action-row mode-switch-row"><span class="mode-switch-label">TROCAR DE MODO</span>${modeSwitchButtons(state)}</div>`;
}
