const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

const PORTRAIT_ROLE = Object.freeze({
  medic: 'doctor', doctor: 'doctor', engineer: 'engineer', guard: 'soldier', soldier: 'soldier',
  resident: 'worker', worker: 'worker', scientist: 'worker',
});
const ROLE_NAME = Object.freeze({
  medic: 'Médico', doctor: 'Médico', engineer: 'Engenheiro', guard: 'Soldado', soldier: 'Soldado',
  resident: 'Trabalhador', worker: 'Trabalhador', scientist: 'Cientista',
});

export const DIALOGUE_CHAR_INTERVAL_MS = 18;

export function isDialogueTextComplete(renderedCharacters, totalCharacters) {
  return renderedCharacters >= totalCharacters;
}

export function renderDialogueView(npc, text = '') {
  const role = PORTRAIT_ROLE[npc?.role] ?? 'worker';
  const storedName = typeof npc?.name === 'string' && npc.name.trim() ? npc.name.trim() : 'Habitante';
  const name = storedName === 'Habitante Genérico'
    ? `${ROLE_NAME[npc?.role] ?? 'Habitante'} · ${storedName}` : storedName;
  return `<section class="bunker-dialogue" data-dialogue-modal role="dialog" aria-modal="true" aria-label="Conversa com ${escapeHtml(name)}" hidden>
    <div class="dialogue-portrait dialogue-portrait--${role}" role="img" aria-label="Retrato de ${escapeHtml(name)}"></div>
    <div class="dialogue-copy"><p class="eyebrow">/// CANAL PESSOAL ///</p><h3 data-dialogue-name>${escapeHtml(name)}</h3><p class="dialogue-text" data-dialogue-text aria-live="polite">${escapeHtml(text)}</p><span class="dialogue-feedback" data-dialogue-feedback aria-live="polite" hidden>+15 LEALDADE</span></div>
    <button type="button" class="quiet-action dialogue-close" data-action="close-dialogue">[ E / ESPAÇO ] AVANÇAR</button>
  </section>`;
}
