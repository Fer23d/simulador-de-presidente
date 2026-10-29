import test from 'node:test';
import assert from 'node:assert/strict';
import { completeTutorialStep, createTutorial, getContextTip, getTutorialPhase, getTutorialStep,
  markTipSeen, restartTutorial, setTutorialEnabled, syncTutorial } from '../src/core/tutorial.js';
import { INITIAL_SHELTER_GRID } from '../src/core/shelter_engine.js';

const grid = (...rooms) => {
  const next = INITIAL_SHELTER_GRID.map((row) => row.slice());
  rooms.forEach((room, index) => { next[1][index + 1] = { floor: 1, column: index + 1, operational: true, ...room }; });
  return next;
};
const vault = (extra = {}) => ({ is_wasteland: true, shelter_grid: grid(), wasteland_turn: 0,
  shelter_supplies: { food: 20 }, weather: { type: 'clear' }, ...extra });

test('the tutorial follows the phase: one step in the presidency, nothing during the vault cinematic', () => {
  const tutorial = createTutorial();
  assert.equal(getTutorialPhase({}), 'presidency');
  assert.equal(getTutorialStep(tutorial, {}).id, 'presidency');
  assert.equal(getTutorialStep(tutorial, { is_wasteland: true, president_selection_pending: true }), null);
  assert.equal(getTutorialStep(tutorial, { is_wasteland: true, wasteland_cinematic_ready: true }), null);
  assert.equal(getTutorialStep(tutorial, vault({ ending: { id: 'republic' } })), null);
});

test('vault steps advance as the player builds and lets time pass', () => {
  let tutorial = completeTutorialStep(createTutorial(), 'controls');
  const step = getTutorialStep(tutorial, vault());
  assert.equal(step.id, 'dormitory');
  assert.equal(step.number, 2);
  assert.equal(step.total, 6);
  assert.equal(getTutorialStep(tutorial, vault({ shelter_grid: grid({ type: 'dormitory' }) })).id, 'generator');
  const built = vault({ shelter_grid: grid({ type: 'dormitory' }), wasteland_turn: 0 });
  built.shelter_grid[1][2] = { type: 'generator', operational: false };
  assert.equal(getTutorialStep(tutorial, built).id, 'generator', 'a broken generator does not count');
  const full = vault({ shelter_grid: grid({ type: 'dormitory' }, { type: 'generator' }, { type: 'greenhouse' }), wasteland_turn: 1 });
  tutorial = syncTutorial(tutorial, full);
  assert.deepEqual(tutorial.done, ['controls', 'dormitory', 'generator', 'greenhouse', 'advance']);
  assert.equal(getTutorialStep(tutorial, full).id, 'finish');
  tutorial = completeTutorialStep(tutorial, 'finish');
  assert.equal(getTutorialStep(tutorial, full), null);
});

test('context tips wait for the tutorial step and show only once', () => {
  const dark = vault({ isNight: true });
  let tutorial = createTutorial();
  assert.equal(getContextTip(tutorial, dark), null, 'the controls step comes first');
  tutorial = completeTutorialStep(tutorial, 'controls');
  tutorial = { ...tutorial, done: [...tutorial.done, 'dormitory', 'generator', 'greenhouse', 'advance', 'finish'] };
  assert.equal(getContextTip(tutorial, dark).id, 'dark_night');
  tutorial = markTipSeen(tutorial, 'dark_night');
  assert.equal(getContextTip(tutorial, dark), null);
  assert.equal(getContextTip(tutorial, vault({ pendingBunkerEvent: { id: 'x', floor: 1, column: 2 } })).id, 'mission');
  assert.equal(getContextTip(tutorial, vault({ pendingBunkerEvent: { id: 'x', floor: 1, column: 2, arrived: true } })), null);
  assert.equal(getContextTip(tutorial, vault({ shelter_supplies: { food: 3 } })).id, 'low_food');
});

test('the tutorial can be switched off, restarted and survives bad saves', () => {
  const off = setTutorialEnabled(createTutorial(), false);
  assert.equal(getTutorialStep(off, {}), null);
  assert.equal(getContextTip(off, vault({ isNight: true })), null);
  assert.deepEqual(restartTutorial(), { enabled: true, done: [], tips: [] });
  assert.deepEqual(createTutorial({ done: ['controls', 'bogus', 'controls'], tips: 'nope' }), { enabled: true, done: ['controls'], tips: [] });
  assert.deepEqual(createTutorial(null), { enabled: true, done: [], tips: [] });
});

test('the title screen offers continue only with a save and asks before overwriting it', async () => {
  const { titleScreenView } = await import('../src/ui/dashboard.js');
  const fresh = titleScreenView();
  assert.match(fresh, /LAST OFFICE/);
  assert.match(fresh, /APÓS A GUERRA, TUDO MUDA/);
  assert.doesNotMatch(fresh, /data-title-action="continue"/);
  assert.match(fresh, /data-title-action="new-game"/);
  const saved = titleScreenView({ hasSave: true });
  assert.match(saved, /data-title-action="continue"/);
  assert.match(saved, /data-title-action="confirm-new"/);
  assert.match(titleScreenView({ view: 'confirm-new', hasSave: true }), /partida salva será apagada/);
  const options = titleScreenView({ view: 'options', audio: { volume: .4, muted: true }, tutorialEnabled: false });
  assert.match(options, /value="40"/);
  assert.match(options, /data-title-mute checked/);
  assert.doesNotMatch(options, /data-title-tutorial checked/);
  assert.match(titleScreenView({ view: 'credits' }), /Fer23d/);
});

test('the coach panel shows the step counter, waits for action steps and offers a way out', async () => {
  const { tutorialCoachView } = await import('../src/ui/dashboard.js');
  const tutorial = completeTutorialStep(createTutorial(), 'controls');
  const action = tutorialCoachView(getTutorialStep(tutorial, vault()));
  assert.match(action, /TUTORIAL 2\/6/);
  assert.match(action, /AGUARDANDO SUA AÇÃO/);
  assert.match(action, /data-tutorial-skip/);
  assert.match(tutorialCoachView(getTutorialStep(createTutorial(), vault())), /data-tutorial-ack="controls"/);
  assert.match(tutorialCoachView(null, { id: 'storm', title: 'X', text: 'Y' }), /data-tutorial-tip="storm"/);
  assert.equal(tutorialCoachView(null, null), '');
});
