import { describeLevelGate, DOOR_REQUIRED_LEVEL, describeLevelReward, getGameMode, getLevelProgress, getLevelTier, getModeLabel, MAX_LEVEL,
  TIER_MULTIPLIER } from '../core/levels.js';
import { getUiLanguage, translateUiText, uiText } from '../core/i18n.js';

const escapeText = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
export const LEVEL_MODES = Object.freeze(['presidency', 'vault', 'city']);

function levelText(state, value) {
  return translateUiText(value, getUiLanguage(state));
}

function levelAbbrev(state) {
  return uiText(getUiLanguage(state), 'level.abbrev', 'NV');
}

// Aba do topo: so o nivel e uma barrinha; a trilha completa abre num painel proprio.
export function levelTabView(state) {
  const progress = getLevelProgress(state);
  const gate = describeLevelGate(state);
  const title = levelText(state, gate ? `Nível ${progress.level} · a Porta do Vault abre no nível ${gate.required}` : `Nível ${progress.level} · ${progress.title}`);
  const label = levelText(state, 'NÍVEIS');
  return `<button type="button" class="level-tab" data-action="open-levels" title="${escapeText(title)}" aria-label="${escapeText(levelText(state, `Abrir a trilha de níveis. ${title}`))}"><span class="level-tab-label">${escapeText(label)}</span><strong class="level-tab-number">${escapeText(levelAbbrev(state))} ${progress.level}</strong><span class="level-tab-bar" aria-hidden="true"><span style="width:${Math.round(progress.fraction * 100)}%"></span></span>${gate ? '<span class="level-tab-lock" aria-hidden="true">🔒</span>' : ''}</button>`;
}

function cardView(level, current, mode, state) {
  const tier = getLevelTier(level);
  const status = level < current ? 'is-done' : level === current ? 'is-current' : 'is-locked';
  const lines = (level === 1 ? ['Ponto de partida da jornada'] : describeLevelReward(level, mode, state)).map((line) => levelText(state, line));
  const badge = tier === 'zero' ? `<span class="level-card-badge">${escapeText(levelText(state, 'PRÊMIO MÁXIMO'))} ★★</span>` : tier === 'five' ? `<span class="level-card-badge">${escapeText(levelText(state, 'PRÊMIO ESPECIAL'))} ★</span>` : '';
  const mark = status === 'is-done' ? `<span class="level-card-mark" aria-label="${escapeText(levelText(state, 'Já alcançado'))}">✓</span>` : status === 'is-current' ? `<span class="level-card-mark">${escapeText(levelText(state, 'VOCÊ ESTÁ AQUI'))}</span>` : '';
  const gate = level === DOOR_REQUIRED_LEVEL ? `<p class="level-card-gate">🚪 ${escapeText(levelText(state, 'A Porta do Vault só abre neste nível'))}</p>` : '';
  return `<li class="level-card level-card--${tier} ${status}" data-level="${level}"><header><strong>${escapeText(levelAbbrev(state))} ${level}</strong>${mark}</header>${badge}<ul>${lines.map((line) => `<li>${escapeText(line)}</li>`).join('')}</ul>${gate}</li>`;
}

// Trilha dos 60 niveis com o premio de cada um no modo escolhido.
export function levelTrackView(state, mode = getGameMode(state)) {
  const progress = getLevelProgress(state);
  const gate = describeLevelGate(state);
  const chosen = LEVEL_MODES.includes(mode) ? mode : getGameMode(state);
  const xp = levelText(state, progress.level >= MAX_LEVEL ? 'XP máximo' : `${number.format(progress.current)} / ${number.format(progress.needed)} XP`);
  const tabs = LEVEL_MODES.map((id) => `<button type="button" class="level-mode-tab" data-level-mode="${id}" aria-pressed="${id === chosen}">${escapeText(levelText(state, getModeLabel(id)))}${id === getGameMode(state) ? ` <small>${escapeText(levelText(state, '(atual)'))}</small>` : ''}</button>`).join('');
  const special = levelText(state, progress.nextSpecial === null ? 'Você chegou ao nível máximo.' : `Próximo prêmio especial: nível ${progress.nextSpecial}${progress.nextSpecial % 10 === 0 ? ' ★★' : ' ★'}.`);
  const cards = Array.from({ length: MAX_LEVEL }, (_, index) => cardView(index + 1, progress.level, chosen, state)).join('');
  return `<section class="bunker-dialog level-dialog" role="dialog" aria-modal="true" aria-labelledby="levels-title" data-levels-panel data-level="${progress.level}" data-xp="${progress.xp}">
    <p class="eyebrow">/// ${escapeText(levelText(state, 'PROGRESSÃO'))} ///</p>
    <h2 id="levels-title">${escapeText(levelText(state, 'TRILHA DE NÍVEIS'))}</h2>
    <div class="level-summary"><strong class="level-summary-number">${escapeText(levelAbbrev(state))} ${progress.level}</strong><span class="level-summary-title">${escapeText(levelText(state, progress.title))}</span><div class="level-bar" role="meter" aria-label="${escapeText(levelText(state, 'Progresso do nível'))}" aria-valuemin="0" aria-valuemax="${progress.needed}" aria-valuenow="${progress.current}"><span style="width:${Math.round(progress.fraction * 100)}%"></span></div><small>${escapeText(xp)} · ${escapeText(special)}</small>${gate ? `<small class="level-lock">🔒 ${escapeText(levelText(state, `A Porta do Vault só abre no nível ${gate.required}: faltam ${gate.missing} níveis (${number.format(Math.max(0, gate.missingXp))} XP).`))}</small>` : ''}</div>
    <p class="level-rules">${escapeText(levelText(state, 'Todo nível dá um prêmio do modo em que você está.'))} <b>${escapeText(levelText(state, 'Nível comum'))}</b> ×${TIER_MULTIPLIER.normal} · <b>${escapeText(levelText(state, 'terminado em 5'))}</b> ×${TIER_MULTIPLIER.five} · <b>${escapeText(levelText(state, 'terminado em 0'))}</b> ×${TIER_MULTIPLIER.zero}, ${escapeText(levelText(state, 'com título, vestimenta exclusiva e bônus extra.'))}</p>
    <div class="level-mode-tabs" role="group" aria-label="${escapeText(levelText(state, 'Modo dos prêmios'))}">${tabs}</div>
    <ol class="level-grid">${cards}</ol>
    <div class="action-row"><button type="button" class="quiet-action" data-action="close-levels">[ FECHAR ]</button></div>
  </section>`;
}

// Texto do aviso de nivel novo; os niveis 5 e 0 ganham chamada propria.
export function levelToastParts(entry, language = 'pt-BR') {
  const call = entry.tier === 'zero' ? 'PRÊMIO MÁXIMO!' : entry.tier === 'five' ? 'PRÊMIO ESPECIAL!' : 'Prêmio de nível';
  return { tier: entry.tier, title: `⭐ ${translateUiText(`NÍVEL ${entry.level} · ${call}`, language)}`, detail: translateUiText(entry.text, language), durationMs: entry.tier === 'zero' ? 9_000 : entry.tier === 'five' ? 6_500 : 4_500 };
}
