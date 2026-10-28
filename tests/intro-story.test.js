import test from 'node:test';
import assert from 'node:assert/strict';
import { getIntroScenes } from '../src/core/intro_story.js';
import { renderWastelandCinematic } from '../src/ui/dashboard.js';

const ready = { is_wasteland: true, wasteland_cinematic_ready: true, presidentClass: 'worker' };

test('the opening story has five chapters and ends with the command alert, named after the chosen president', () => {
  const scenes = getIntroScenes(ready);
  assert.equal(scenes.length, 6);
  assert.equal(scenes.filter((scene) => scene.final).length, 1);
  assert.ok(scenes.at(-1).final);
  assert.match(scenes[0].text, /Joaquim "Quim" Barreto/);
  assert.match(scenes[4].text, /Foi você que apertou o botão\?/);
  assert.match(getIntroScenes({ presidentClass: 'doctor' })[0].text, /Beatriz Okafor/);
  assert.match(scenes.at(-1).text, /Eu não sei governar/);
});

test('each chapter offers continue and skip, and only the last one takes command', () => {
  const first = renderWastelandCinematic(ready, { scene: 0 });
  assert.match(first, /CAPÍTULO 1 DE 5 · O ÚLTIMO DIA/);
  assert.match(first, /data-action="intro-next"/);
  assert.match(first, /data-action="intro-skip"/);
  assert.doesNotMatch(first, /dismiss-wasteland-cinematic/);
  const last = renderWastelandCinematic(ready, { scene: 5 });
  assert.match(last, /dismiss-wasteland-cinematic/);
  assert.doesNotMatch(last, /intro-skip/);
  assert.match(renderWastelandCinematic(ready, { scene: 99 }), /ASSUMIR COMANDO DO VAULT/);
});
