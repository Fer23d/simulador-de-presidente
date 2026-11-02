import { SUPPORTED_LANGUAGES } from '../core/player_profile.js';
import { onboardingText } from '../core/onboarding.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

const logo = '<p class="title-kicker">/// TERMINAL DO ÚLTIMO GABINETE ///</p><h1 id="title-logo" class="title-logo">LAST OFFICE</h1><p class="title-tagline">APÓS A GUERRA, TUDO MUDA</p>';

// Capa: arte do Vault, o logo e a barra de carregamento com uma dica; ao terminar, pede uma tecla.
export function bootScreenView({ language = 'pt-BR', tip = '', progress = 0, ready = false } = {}) {
  const percent = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  return `<section class="title-screen title-boot" role="dialog" aria-modal="true" aria-labelledby="title-logo" data-title-view="boot" data-boot-ready="${ready ? 1 : 0}">
    <canvas class="cover-art" aria-hidden="true"></canvas><canvas class="title-ash" aria-hidden="true"></canvas>
    <div class="title-content boot-content">${logo}
      <div class="boot-loader" data-boot-loader><div class="boot-label"><span data-boot-label>${escapeHtml(ready ? onboardingText(language, 'ready') : onboardingText(language, 'loading'))}</span><span data-boot-percent>${percent}%</span></div>
      <div class="boot-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span data-boot-fill style="width:${percent}%"></span></div>
      <p class="boot-tip"><b>${escapeHtml(onboardingText(language, 'tipLabel'))}:</b> <span data-boot-tip>${escapeHtml(tip)}</span></p></div>
    </div></section>`;
}

// Primeira entrada: nome, idioma e som antes de comecar.
export function profileOnboardingView({ language = 'pt-BR', name = '', volume = .7, muted = false, tutorialEnabled = true, backAction = '' } = {}) {
  const t = (key) => escapeHtml(onboardingText(language, key));
  const options = SUPPORTED_LANGUAGES.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === language ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('');
  return `<section class="title-screen" role="dialog" aria-modal="true" aria-labelledby="onb-profile-title" data-title-view="profile"><canvas class="title-ash" aria-hidden="true"></canvas>
    <div class="title-content"><p class="title-kicker">/// ${t('profileKicker')} ///</p>
      <div class="title-panel onboarding-panel"><h2 id="onb-profile-title">${t('profileTitle')}</h2><p>${t('profileLead')}</p>
        <label class="title-option onb-field"><span>${t('nameLabel')}</span><input type="text" maxlength="32" autocomplete="nickname" data-onb-name value="${escapeHtml(name)}" placeholder="${escapeHtml(onboardingText(language, 'namePlaceholder'))}" autofocus></label>
        <p class="onb-hint">${t('nameHint')}</p>
        <label class="title-option onb-field"><span>${t('language')}</span><select data-onb-language aria-label="${t('language')}">${options}</select></label>
        <label class="title-option"><span>${t('volume')}</span><input type="range" min="0" max="100" value="${Math.round(volume * 100)}" data-title-volume aria-label="${t('volume')}"></label>
        <label class="title-option"><span>${t('mute')}</span><input type="checkbox" data-title-mute ${muted ? 'checked' : ''}></label>
        <label class="title-option"><span>${t('tutorial')}</span><input type="checkbox" data-title-tutorial ${tutorialEnabled ? 'checked' : ''}></label>
        <div class="title-menu"><button type="button" class="title-button is-primary" data-title-action="profile-continue">${t('continue')}</button>${backAction ? `<button type="button" class="title-button" data-title-action="${escapeHtml(backAction)}">${t('back')}</button>` : ''}</div>
      </div></div></section>`;
}

// Historia do jogo e do modo: avanca cena a cena, pode ser pulada de uma vez.
export function storyOnboardingView({ language = 'pt-BR', scene, replay = false } = {}) {
  if (!scene) return '';
  const t = (key) => escapeHtml(onboardingText(language, key));
  const last = scene.index === scene.total - 1;
  const dots = Array.from({ length: scene.total }, (_, index) => `<span class="${index === scene.index ? 'is-on' : ''}"></span>`).join('');
  return `<section class="title-screen title-story" role="dialog" aria-modal="true" aria-labelledby="onb-story-title" data-title-view="story" data-scene="${scene.index}"><canvas class="title-ash" aria-hidden="true"></canvas>
    <div class="title-content story-content"><p class="title-kicker">/// ${t(replay ? 'replay' : 'storyKicker')} · ${t('scene')} ${scene.index + 1}/${scene.total} ///</p>
      <div class="story-icon" aria-hidden="true">${scene.icon}</div><h2 id="onb-story-title" class="story-title">${escapeHtml(scene.title)}</h2>
      <p class="story-text" data-story-text>${escapeHtml(scene.text)}</p><div class="story-dots" aria-hidden="true">${dots}</div>
      ${replay ? '' : `<label class="title-option story-never"><span>${t('never')}</span><input type="checkbox" data-onb-never></label>`}
      <div class="title-menu"><button type="button" class="title-button is-primary" data-title-action="${last ? 'story-start' : 'story-next'}" autofocus>${t(last ? (replay ? 'back' : 'start') : 'next')}</button>${last && replay ? '' : `<button type="button" class="title-button" data-title-action="story-skip">${t(replay ? 'back' : 'skip')}</button>`}</div>
    </div></section>`;
}
