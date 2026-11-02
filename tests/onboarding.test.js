import test from 'node:test';
import assert from 'node:assert/strict';
import { createOnboarding, getBootTips, getStoryScenes, guessLanguage, onboardingText } from '../src/core/onboarding.js';
import { bootScreenView, profileOnboardingView, storyOnboardingView } from '../src/ui/onboarding_ui.js';
import { drawCoverArt } from '../src/core/cover_art.js';

test('the onboarding flags default to showing the profile and the story', () => {
  assert.deepEqual(createOnboarding(), { profileDone: false, skipStory: false });
  assert.deepEqual(createOnboarding({ profileDone: true, skipStory: true, junk: 1 }), { profileDone: true, skipStory: true });
});

test('the language is guessed from the browser on the first visit', () => {
  assert.equal(guessLanguage('es-MX'), 'es');
  assert.equal(guessLanguage('en-US'), 'en');
  assert.equal(guessLanguage('pt-BR'), 'pt-BR');
  assert.equal(guessLanguage('fr'), 'pt-BR');
  assert.equal(guessLanguage(), 'pt-BR');
});

test('the story tells the game and the starting mode, with the player name, in every language', () => {
  for (const language of ['pt-BR', 'es', 'en']) {
    const scenes = getStoryScenes(language, 'Fernanda');
    assert.equal(scenes.length, 5);
    assert.ok(scenes.every((scene, index) => scene.index === index && scene.total === 5 && scene.title && scene.text));
    assert.ok(scenes.some((scene) => scene.text.includes('Fernanda')));
    assert.ok(scenes.every((scene) => !scene.text.includes('{name}')));
    assert.ok(getBootTips(language).length >= 5);
  }
  assert.match(getStoryScenes('pt-BR', '').map((scene) => scene.text).join(' '), /Presidente/);
  assert.match(getStoryScenes('en', '  ').map((scene) => scene.text).join(' '), /President/);
  assert.equal(onboardingText('en', 'skip'), '[ SKIP STORY ]');
  assert.equal(onboardingText('xx', 'skip'), '[ PULAR HISTÓRIA ]');
});

test('the cover shows the loading bar, the tip and asks for a key when ready', () => {
  const loading = bootScreenView({ language: 'pt-BR', tip: 'Dica X', progress: .4, ready: false });
  assert.match(loading, /CARREGANDO/);
  assert.match(loading, /width:40%/);
  assert.match(loading, /Dica X/);
  assert.match(loading, /class="cover-art"/);
  const ready = bootScreenView({ language: 'en', tip: 'Tip', progress: 1, ready: true });
  assert.match(ready, /PRESS ANY KEY/);
  assert.match(ready, /data-boot-ready="1"/);
});

test('the profile screen asks for name, language and sound and lets the player continue', () => {
  const view = profileOnboardingView({ language: 'pt-BR', name: '<Ana>', volume: .5, muted: true, tutorialEnabled: false });
  assert.match(view, /data-onb-name/);
  assert.match(view, /&lt;Ana&gt;/);
  assert.match(view, /data-onb-language/);
  assert.match(view, /value="en"/);
  assert.match(view, /data-title-volume/);
  assert.match(view, /data-title-mute checked/);
  assert.doesNotMatch(view, /data-title-tutorial checked/);
  assert.match(view, /data-title-action="profile-continue"/);
  assert.doesNotMatch(view, /data-title-action="main"/);
  assert.match(profileOnboardingView({ backAction: 'main' }), /data-title-action="main"/);
});

test('the story can be advanced, skipped or never shown again', () => {
  const scenes = getStoryScenes('pt-BR', 'Ana');
  const first = storyOnboardingView({ language: 'pt-BR', scene: scenes[0] });
  assert.match(first, /story-next/);
  assert.match(first, /PULAR HISTÓRIA/);
  assert.match(first, /data-onb-never/);
  const last = storyOnboardingView({ language: 'pt-BR', scene: scenes[4] });
  assert.match(last, /story-start/);
  assert.match(last, /COMEÇAR/);
  const replay = storyOnboardingView({ language: 'pt-BR', scene: scenes[4], replay: true });
  assert.doesNotMatch(replay, /data-onb-never/);
  assert.equal(storyOnboardingView({ language: 'pt-BR' }), '');
});

test('the cover art is drawn without a document and without errors', () => {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  assert.doesNotThrow(() => drawCoverArt(ctx, 800, 600, 100));
});
