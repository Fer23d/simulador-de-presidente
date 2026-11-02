import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceCityDay, analyzeCity, canPlaceAt, CITY_BUILDINGS, CITY_DAYS_PER_YEAR, CITY_GATE, CITY_HEIGHT, CITY_OBJECTIVES, CITY_TOTAL_DAYS, CITY_WIDTH,
  demolishCityBuilding, generateCityGround, getBuildingAt, getCityDate, getCityEpilogue, getCityObjective, normalizeCity,
  placeCityBuilding, setCitySpeed, startCity } from '../src/core/city.js';
import { createGameState, hydrateGameState } from '../src/core/game-state.js';
import { transicionarParaWasteland } from '../src/core/wasteland.js';

const vaultEnding = (id = 'republic', extra = {}) => ({ ...transicionarParaWasteland(createGameState()), presidentClass: 'worker',
  ending: { id, month: 36 }, scrap: 400, oil: 200, ...extra });
const cityState = (id = 'republic', extra = {}) => startCity(vaultEnding(id, extra));
const withCity = (state, patch) => ({ ...state, city: { ...state.city, ...patch } });
const at = (city, x, y) => getBuildingAt(city, x, y);
const idx = (x, y) => y * CITY_WIDTH + x;

test('the ground is deterministic, keeps a clean camp by the gate and starts mostly contaminated', () => {
  const ground = generateCityGround(7);
  assert.equal(ground.length, CITY_WIDTH * CITY_HEIGHT);
  assert.equal(ground, generateCityGround(7));
  assert.notEqual(ground, generateCityGround(8));
  for (let y = 10; y < CITY_HEIGHT; y++) for (let x = 8; x <= 16; x++) assert.equal(ground[idx(x, y)], 'c', `camp ${x},${y}`);
  const contaminated = [...ground].filter((tile) => tile === 'x').length;
  assert.ok(contaminated > ground.length * .4, 'most of the map needs cleaning');
});

test('every Vault ending except the sealed door starts a city with its own flavour', () => {
  assert.equal(startCity(vaultEnding('sealed')).city, null, 'the sealed door never leaves the Vault');
  assert.equal(startCity({ ...vaultEnding('republic'), ending: null }).city, null, 'needs an ending first');
  const first = cityState('republic');
  assert.equal(startCity(first), first, 'does not restart an active city');
  const republic = first.city;
  const empire = cityState('empire').city;
  const exile = cityState('exile').city;
  assert.ok(republic.happiness > empire.happiness);
  assert.ok(exile.population < republic.population / 2 && exile.resources.scrap < republic.resources.scrap);
  assert.ok(cityState('encounter').city.resources.oil > republic.resources.oil);
  for (const id of ['republic', 'empire', 'encounter', 'last_office', 'exile']) assert.ok(cityState(id).city, id);
  assert.equal(republic.day, 0);
  assert.equal(republic.speed, 0, 'starts paused');
});

test('the starting camp is connected, powered, staffed and self-sufficient', () => {
  const { city } = cityState();
  const analysis = analyzeCity(city);
  assert.equal(analysis.active.length, city.buildings.filter((building) => building.type !== 'road').length, 'every camp building is connected');
  assert.equal(analysis.powerRatio, 1);
  assert.ok(analysis.capacity >= city.population, 'houses fit the first citizens');
  assert.ok(analysis.production.food >= city.population * .5 * .85, 'the farms nearly feed the camp');
  assert.ok(analysis.production.water >= city.population * .5);
  let state = cityState();
  for (let day = 0; day < 120; day++) state = advanceCityDay(state);
  assert.ok(state.city.population >= city.population, 'the camp does not shrink in its first four months');
  assert.equal(state.city.result, null);
});

test('buildings need a road to the gate: disconnected ones produce nothing', () => {
  let state = cityState();
  state = placeCityBuilding(state, 'workshop', 16, 14);
  assert.ok(at(state.city, 16, 14));
  assert.equal(analyzeCity(state.city).status.get('workshop-16-14').connected, false, 'no road beside it');
  assert.equal(analyzeCity(state.city).status.get('workshop-16-14').efficiency, 0);
  state = placeCityBuilding(state, 'road', 15, 14);
  assert.equal(analyzeCity(state.city).status.get('workshop-16-14').connected, false, 'the road itself is not linked yet');
  state = placeCityBuilding(state, 'road', 14, 14);
  state = placeCityBuilding(state, 'road', 13, 14);
  assert.equal(analyzeCity(state.city).status.get('workshop-16-14').connected, true, 'now linked to the gate road');
  assert.ok(analyzeCity(state.city).status.get('workshop-16-14').efficiency > 0);
});

test('placing checks bounds, gate, occupancy, contamination, rubble cost and scrap', () => {
  const state = cityState();
  const { city } = state;
  assert.equal(canPlaceAt(city, 'house', -1, 3).ok, false);
  assert.match(canPlaceAt(city, 'house', CITY_GATE.x, CITY_GATE.y).reason, /Porta/);
  assert.match(canPlaceAt(city, 'house', 12, 13).reason, /Já existe/);
  const contaminated = [...city.ground].findIndex((tile) => tile === 'x');
  assert.match(canPlaceAt(city, 'house', contaminated % CITY_WIDTH, Math.floor(contaminated / CITY_WIDTH)).reason, /contaminado/);
  const rubble = [...city.ground].findIndex((tile) => tile === 'r');
  const rx = rubble % CITY_WIDTH;
  const ry = Math.floor(rubble / CITY_WIDTH);
  assert.equal(canPlaceAt(city, 'house', rx, ry).cost, CITY_BUILDINGS.house.cost + 8, 'rubble costs extra');
  const built = placeCityBuilding(state, 'house', rx, ry);
  assert.equal(built.city.ground[rubble], 'c', 'building clears the rubble');
  assert.equal(built.city.resources.scrap, city.resources.scrap - CITY_BUILDINGS.house.cost - 8);
  const broke = withCity(state, { resources: { ...city.resources, scrap: 5 } });
  assert.match(placeCityBuilding(broke, 'house', 9, 13).city.message, /Sucata insuficiente/);
  assert.equal(placeCityBuilding(broke, 'house', 9, 13).city.buildings.length, city.buildings.length);
  assert.equal(placeCityBuilding(state, 'castle', 9, 13).city.buildings.length, city.buildings.length);
});

test('demolishing refunds half and the speed control only accepts known speeds', () => {
  let state = cityState();
  const scrap = state.city.resources.scrap;
  state = demolishCityBuilding(state, 13, 11);
  assert.equal(at(state.city, 13, 11), null);
  assert.equal(state.city.resources.scrap, scrap + 20);
  assert.match(demolishCityBuilding(state, 13, 11).city.message, /Nada para demolir/);
  assert.equal(setCitySpeed(state, 3).city.speed, 3);
  assert.equal(setCitySpeed(state, 7).city.speed, 0);
  assert.equal(setCitySpeed(state, 0).city.speed, 0);
});

test('reconstruction objectives expose progress and survive normalization', () => {
  const state = cityState();
  const objective = getCityObjective(state.city);
  assert.equal(objective.id, 'corridor');
  assert.ok(objective.progress >= 0 && objective.progress <= 1);
  const marked = withCity(state, { completedObjectives: ['corridor'], objectiveId: 'shelter' });
  assert.equal(getCityObjective(marked.city).id, 'shelter');
  const loaded = normalizeCity(marked.city);
  assert.deepEqual(loaded.completedObjectives, ['corridor']);
  assert.equal(loaded.objectiveId, 'shelter');
  assert.equal(CITY_OBJECTIVES.length, 5);
});

test('shortages hurt: no oil darkens the camp and no food or water makes people leave', () => {
  const state = cityState();
  const dark = analyzeCity(withCity(state, { resources: { ...state.city.resources, oil: 0 } }).city);
  assert.equal(dark.powerRatio, 0, 'generators need oil');
  assert.equal(dark.production.food, 0, 'farms stop without power');
  let hungry = withCity(state, { resources: { ...state.city.resources, food: 0, water: 0 },
    buildings: state.city.buildings.filter((building) => !['farm', 'well'].includes(building.type)) });
  const before = hungry.city.population;
  for (let day = 0; day < 10; day++) hungry = advanceCityDay(hungry);
  assert.ok(hungry.city.population < before, 'people leave when there is nothing to eat or drink');
  assert.ok(hungry.city.log.some((entry) => /comida/.test(entry.text)));
  assert.ok(hungry.city.happiness < state.city.happiness);
});

test('a purifier cleans contaminated land around it over time', () => {
  let state = cityState();
  state = placeCityBuilding(state, 'purifier', 13, 14);
  const around = () => [...Array(CITY_HEIGHT * CITY_WIDTH).keys()].filter((index) => {
    const x = index % CITY_WIDTH;
    const y = Math.floor(index / CITY_WIDTH);
    return state.city.ground[index] === 'x' && Math.abs(x - 13) + Math.abs(y - 14) <= 4;
  }).length;
  const before = around();
  assert.ok(before > 0, 'there is something to clean beside the camp');
  for (let day = 0; day < 60; day++) state = advanceCityDay(state);
  assert.ok(around() < before, 'the purifier worked');
});

test('services raise happiness through coverage', () => {
  const state = cityState();
  assert.deepEqual(analyzeCity(state.city).coverage, { health: 0, security: 0, commerce: 0, comfort: 0 });
  let next = placeCityBuilding(state, 'road', 12, 11);
  next = placeCityBuilding(next, 'clinic', 12, 10);
  assert.ok(analyzeCity(next.city).coverage.health > 0);
  assert.equal(analyzeCity(next.city).coverage.security, 0);
});

test('time runs in days, months and years and the city ends after ten years with a verdict', () => {
  assert.equal(CITY_TOTAL_DAYS, 3600);
  assert.equal(CITY_DAYS_PER_YEAR, 360);
  assert.deepEqual(getCityDate({ day: 0 }), { total: 0, year: 1, month: 1, dayOfMonth: 1 });
  assert.deepEqual(getCityDate({ day: 365 }), { total: 365, year: 2, month: 1, dayOfMonth: 6 });
  let state = cityState();
  state = withCity(state, { day: CITY_TOTAL_DAYS - 1, population: 700, happiness: 90,
    stats: { ...state.city.stats, happinessSum: 80 * 3599, happinessDays: 3599, peakPopulation: 700, built: 60 } });
  state = advanceCityDay(state);
  assert.equal(state.city.day, CITY_TOTAL_DAYS);
  assert.equal(state.city.result.outcome, 'thrive');
  assert.ok(state.city.result.score >= 75);
  assert.equal(advanceCityDay(state), state, 'a finished city no longer advances');
  assert.equal(setCitySpeed(state, 2), state);
  const epilogue = getCityEpilogue(state);
  assert.equal(epilogue.title, 'A Cidade que Voltou a Sorrir');
  assert.match(epilogue.story, /Lia Moraes/, 'the epilogue carries the Vault ending');
  assert.equal(getCityEpilogue(cityState()), null);
});

test('a city can collapse when everyone leaves or revolt when happiness stays at the floor', () => {
  let empty = cityState();
  empty = withCity(empty, { population: 1, buildings: [], resources: { ...empty.city.resources, food: 0, water: 0 } });
  empty = advanceCityDay(empty);
  assert.equal(empty.city.result.outcome, 'collapse');
  let angry = cityState();
  angry = withCity(angry, { happiness: 0, stats: { ...angry.city.stats, lowHappinessDays: 44 } });
  angry = advanceCityDay(angry);
  assert.equal(angry.city.result.outcome, 'revolt');
  assert.equal(getCityEpilogue(angry).icon, '🔥');
});

test('the city survives saving and loading and rejects broken data', () => {
  let state = cityState('empire');
  state = placeCityBuilding(state, 'road', 9, 11);
  state = setCitySpeed(state, 2);
  for (let day = 0; day < 35; day++) state = advanceCityDay(state);
  const loaded = hydrateGameState(JSON.stringify({ ...state, version: createGameState().version }));
  assert.deepEqual(loaded.city, state.city);
  assert.equal(loaded.city.history.length, 1, 'one monthly snapshot');
  assert.equal(normalizeCity(null), null);
  assert.equal(normalizeCity({ origin: 'nowhere' }), null);
  const messy = normalizeCity({ ...state.city, ground: 'short', buildings: [{ type: 'house', x: 3, y: 3 }, { type: 'house', x: 3, y: 3 }, { type: 'bogus', x: 1, y: 1 },
    { type: 'house', x: CITY_GATE.x, y: CITY_GATE.y }, { type: 'house', x: 99, y: 1 }], population: -5, speed: 9, day: 99999, resources: { scrap: 'x' } });
  assert.equal(messy.ground.length, CITY_WIDTH * CITY_HEIGHT);
  assert.equal(messy.buildings.length, 1, 'duplicates, unknown types, the gate and out-of-map tiles are dropped');
  assert.equal(messy.population, 0);
  assert.equal(messy.speed, 0);
  assert.equal(messy.day, CITY_TOTAL_DAYS);
  assert.equal(messy.resources.scrap, 0);
  assert.equal(hydrateGameState(JSON.stringify({ ...createGameState(), version: createGameState().version })).city, null);
});

test('the city screen has the whole build palette, speed controls, clock and a map', async () => {
  const { cityClockText, cityEpilogueView, cityHudView, cityView } = await import('../src/ui/city_ui.js');
  const state = cityState();
  const html = cityView(state);
  for (const id of Object.keys(CITY_BUILDINGS)) assert.match(html, new RegExp(`data-city-tool="${id}"`), id);
  assert.match(html, /data-city-tool="demolish"/);
  assert.match(html, /data-action="city-story"/);
  for (const speed of [0, 1, 2, 3]) assert.match(html, new RegExp(`data-city-speed="${speed}"`));
  assert.match(html, /<canvas id="cityCanvas"/);
  assert.match(html, /data-city-objective/);
  assert.match(html, /city-objective-progress/);
  assert.match(html, /Nova República/);
  assert.equal(cityClockText(state.city), 'ANO 1 DE 10 · MÊS 1 · DIA 1');
  assert.equal(cityClockText({ day: 400 }), 'ANO 2 DE 10 · MÊS 2 · DIA 11');
  const hud = cityHudView(state.city, analyzeCity(state.city));
  assert.match(hud, /👥 \d+ \/ 72/);
  assert.match(hud, /vagas/);
  assert.match(hud, /\/dia/);
  const done = withCity(state, { result: { outcome: 'stable', score: 61, population: 320, peakPopulation: 410, averageHappiness: 58, buildings: 44, years: 10 } });
  const epilogue = cityEpilogueView(done);
  assert.match(epilogue, /A CIDADE QUE RESISTIU/);
  assert.match(epilogue, /<strong>61<\/strong>/);
  assert.match(epilogue, /data-action="ending-new-game"/);
  assert.equal(cityEpilogueView(state), '');
});

test('leaving the Vault: only the doors that open offer to rebuild, and the city takes over the screen', async () => {
  const { doorView } = await import('../src/ui/dashboard.js');
  assert.match(doorView(vaultEnding('republic')), /data-action="start-city"/);
  assert.match(doorView(vaultEnding('exile')), /data-action="start-city"/);
  assert.doesNotMatch(doorView(vaultEnding('sealed')), /start-city/);
  assert.match(doorView(vaultEnding('sealed')), /data-action="ending-new-game"/);
  assert.equal(doorView(cityState()), '', 'no epilogue over a running city');
  const done = withCity(cityState(), { result: { outcome: 'collapse', score: 12, population: 0, peakPopulation: 90, averageHappiness: 33, buildings: 20, years: 4 } });
  assert.match(doorView(done), /A CIDADE QUE MORREU/);
});
