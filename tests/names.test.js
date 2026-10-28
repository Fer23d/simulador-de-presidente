import test from 'node:test';
import assert from 'node:assert/strict';
import { GENERIC_NAME, generateResidentIdentity, resolveResidentIdentity, RESIDENT_TRAITS } from '../src/core/names.js';
import { Inhabitant } from '../src/core/inhabitant.js';
import { normalizeInhabitants, createInitialInhabitants } from '../src/core/rpg_bunker.js';
import { INITIAL_SHELTER_GRID } from '../src/core/shelter_engine.js';
import { chooseDialogueLine } from '../src/core/dialogues.js';
import { renderDialogueView } from '../src/ui/dialogue_renderer.js';
import { PRESIDENT_CLASSES, startGame } from '../src/core/player_state.js';
import { LORE_CHAPTERS } from '../src/core/story_lore.js';

test('residents get a stable first name, surname and trait from their id', () => {
  const identity = generateResidentIdentity('worker-1-2');
  assert.deepEqual(identity, generateResidentIdentity('worker-1-2'));
  assert.match(identity.name, /^\S+ \S+$/);
  assert.ok(RESIDENT_TRAITS[identity.trait]);
  const names = new Set(Array.from({ length: 30 }, (_, index) => generateResidentIdentity(`npc-${index}`).name));
  assert.ok(names.size > 20);
});

test('generic saves receive a name while specialists and saved names are kept', () => {
  assert.notEqual(resolveResidentIdentity({ id: 'old', name: GENERIC_NAME }).name, GENERIC_NAME);
  assert.deepEqual(resolveResidentIdentity({ id: 'vip', name: 'Dr. Isaac Lindqvist', isVIP: true }), { name: 'Dr. Isaac Lindqvist', trait: null });
  assert.equal(resolveResidentIdentity({ id: 'x', name: 'Rita Lima', trait: 'musician' }).trait, 'musician');
  const [first] = normalizeInhabitants([{ ...createInitialInhabitants(INITIAL_SHELTER_GRID)[0], name: GENERIC_NAME }], INITIAL_SHELTER_GRID);
  assert.notEqual(first.name, GENERIC_NAME);
  assert.ok(first.trait);
  assert.equal(new Inhabitant(first).snapshot().trait, first.trait);
});

test('dialogue shows name, profession and trait, and residents can talk about their trait', () => {
  const npc = { id: 'a', role: 'engineer', name: 'Rita Lima', trait: 'musician' };
  assert.match(renderDialogueView(npc, 'oi'), /Rita Lima · Engenheiro · Músico/);
  assert.equal(chooseDialogueLine(npc, () => .99), RESIDENT_TRAITS.musician.line);
  assert.match(renderDialogueView({ role: 'scientist', name: 'Dr. Isaac Lindqvist', isVIP: true }), /<h3 data-dialogue-name>Dr\. Isaac Lindqvist<\/h3>/);
});

test('every president class has a leader, a story and a quote, used when taking command', () => {
  for (const profile of PRESIDENT_CLASSES) {
    assert.ok(profile.leader && profile.bio.length > 40 && profile.quote, profile.id);
  }
  const started = startGame({ is_wasteland: true, president_selection_pending: true }, 'doctor');
  assert.match(started.notice, /Dra\. Beatriz Okafor, O Doutor, assumiu/);
});

test('the story chapters introduce the cast', () => {
  assert.match(LORE_CHAPTERS.cap_1_origem.text, /Helena Vargas/);
  assert.match(LORE_CHAPTERS.cap_2_corrupcao.text, /Otávio Brandt/);
  assert.match(LORE_CHAPTERS.cap_3_guerra.text, /Hélio Rocha/);
  assert.match(LORE_CHAPTERS.cap_5_wasteland.text, /Tomé/);
});
