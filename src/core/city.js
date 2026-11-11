import { hash } from './art.js';
import { getLeaderName } from './player_profile.js';
import { DAYS_PER_MONTH } from './vault_time.js';

// Modo Cidade: depois que o jogador sai do Vault, ele reconstroi o mundo numa grade durante CITY_YEARS anos.
// Estradas ligam tudo a Porta do Vault; predios precisam de estrada, energia e gente; o terreno comeca contaminado.
export const CITY_WIDTH = 24;
export const CITY_HEIGHT = 16;
export const CITY_GATE = Object.freeze({ x: 12, y: 15 });
export const CITY_YEARS = 10;
export const CITY_DAYS_PER_YEAR = DAYS_PER_MONTH * 12;
export const CITY_TOTAL_DAYS = CITY_YEARS * CITY_DAYS_PER_YEAR;
// Intervalo real de um dia de jogo em cada velocidade (0 = pausado).
export const CITY_SPEEDS = Object.freeze([0, 1, 2, 3]);
export const CITY_SPEED_INTERVAL_MS = Object.freeze({ 0: null, 1: 1_000, 2: 450, 3: 180 });

export const RUBBLE_EXTRA_COST = 8;
export const FOOD_PER_CITIZEN = .5;
export const WATER_PER_CITIZEN = .5;
export const WORKER_SHARE = .6;
export const UPKEEP_PER_BUILDING = .25;
export const SCAVENGE_PER_CITIZEN = .08;
export const STORAGE_CAP = 4_000;
export const PURIFIER_RADIUS = 4;
export const PURIFIER_INTERVAL_DAYS = 4;
export const POPULATION_GOAL = 600;
export const REVOLT_HAPPINESS = 12;
export const REVOLT_DAYS = 45;

// A reconstrução agora tem uma linha narrativa própria. Cada objetivo exige
// uma decisão concreta do jogador e deixa um registro permanente no diário.
export const CITY_OBJECTIVES = Object.freeze([
  Object.freeze({
    id: 'corridor',
    title: 'Restabelecer o corredor',
    text: 'Ligue a Porta do Vault ao primeiro bairro. Uma cidade começa quando as pessoas conseguem chegar umas às outras.',
    check: (_city, analysis) => analysis.roads.size >= 10,
    progress: (_city, analysis) => Math.min(1, analysis.roads.size / 10),
    log: 'O corredor do Vault finalmente alcança o bairro. Pela primeira vez, ninguém precisa atravessar o Ermo para buscar água.',
  }),
  Object.freeze({
    id: 'shelter',
    title: 'Dar teto à próxima geração',
    text: 'Construa moradias suficientes para que a colônia deixe de ser um acampamento e possa chamar este lugar de casa.',
    check: (city, analysis) => analysis.capacity >= 96 && city.population >= 70,
    progress: (city, analysis) => Math.min(1, Math.min(analysis.capacity / 96, city.population / 70)),
    log: 'As últimas famílias deixaram os corredores do Vault. Há janelas acesas na superfície e crianças que nunca viram um bunker.',
  }),
  Object.freeze({
    id: 'services',
    title: 'Reacender os serviços vitais',
    text: 'Comida, água e energia precisam funcionar juntas. Uma cidade sem um desses três serviços apenas adia a próxima crise.',
    check: (city, analysis) => {
      const activeTypes = new Set(analysis.active.map((building) => building.type));
      return activeTypes.has('farm') && activeTypes.has('well') && activeTypes.has('generator')
        && analysis.powerRatio >= .9 && city.resources.food > 0 && city.resources.water > 0;
    },
    progress: (city, analysis) => {
      const activeTypes = new Set(analysis.active.map((building) => building.type));
      const modules = ['farm', 'well', 'generator'].filter((type) => activeTypes.has(type)).length / 3;
      return Math.min(1, modules * .7 + Math.min(1, analysis.powerRatio) * .3);
    },
    log: 'Os três sinais verdes acenderam ao mesmo tempo: comida, água e energia. O mundo antigo chamava isso de infraestrutura. Nós chamamos de milagre.',
  }),
  Object.freeze({
    id: 'community',
    title: 'Criar uma comunidade',
    text: 'Segurança e conforto valem tanto quanto produção. Faça as pessoas quererem permanecer quando a porta do Vault puder ser aberta.',
    check: (city) => city.happiness >= 70 && city.population >= 100,
    progress: (city) => Math.min(1, Math.min(city.happiness / 70, city.population / 100)),
    log: 'A praça encheu ao anoitecer. Ninguém falou em sobrevivência; falaram em amanhã. Foi assim que a colônia virou cidade.',
  }),
  Object.freeze({
    id: 'legacy',
    title: 'Deixar um legado',
    text: 'Resista tempo suficiente para que a reconstrução sobreviva ao seu governo. O objetivo final não é vencer um dia, é criar continuidade.',
    check: (city) => city.day >= CITY_DAYS_PER_YEAR * 3,
    progress: (city) => Math.min(1, city.day / (CITY_DAYS_PER_YEAR * 3)),
    log: 'Três anos se passaram. A cidade já possui histórias que não começaram comigo. Talvez esse seja o primeiro sinal de que ela é realmente livre.',
  }),
]);

// kind: servico com raio de cobertura sobre as casas. jobs: vagas. power: consumo. powerOut: geracao.
export const CITY_BUILDINGS = Object.freeze({
  road: Object.freeze({ id: 'road', name: 'Estrada', icon: '▭', cost: 2, text: 'Liga os prédios à Porta do Vault.' }),
  house: Object.freeze({ id: 'house', name: 'Abrigo', icon: '🏠', cost: 40, capacity: 12, power: 1, text: 'Moradia para 12 cidadãos.' }),
  farm: Object.freeze({ id: 'farm', name: 'Horta Hidropônica', icon: '🌱', cost: 60, jobs: 6, power: 2, food: 40, text: 'Produz 40 de comida por dia. 6 vagas.' }),
  well: Object.freeze({ id: 'well', name: 'Purificador de Água', icon: '💧', cost: 55, jobs: 3, power: 2, water: 50, text: 'Produz 50 de água por dia. 3 vagas.' }),
  generator: Object.freeze({ id: 'generator', name: 'Gerador a Petróleo', icon: '⚡', cost: 80, jobs: 3, powerOut: 30, oilBurn: 1, text: 'Gera 30 de energia queimando 1 barril por dia. 3 vagas.' }),
  solar: Object.freeze({ id: 'solar', name: 'Painel Solar', icon: '☀️', cost: 120, powerOut: 8, text: 'Gera 8 de energia sem combustível.' }),
  derrick: Object.freeze({ id: 'derrick', name: 'Poço de Petróleo', icon: '🛢️', cost: 110, jobs: 4, oil: 4, text: 'Extrai 4 barris por dia. 4 vagas.' }),
  workshop: Object.freeze({ id: 'workshop', name: 'Oficina', icon: '🔧', cost: 70, jobs: 8, power: 3, scrap: 14, text: 'Produz 14 de sucata por dia. 8 vagas.' }),
  market: Object.freeze({ id: 'market', name: 'Mercado', icon: '🛒', cost: 65, jobs: 4, power: 2, scrap: 6, kind: 'commerce', radius: 6, text: 'Comércio: +6 de sucata e felicidade num raio de 6.' }),
  clinic: Object.freeze({ id: 'clinic', name: 'Clínica', icon: '✚', cost: 90, jobs: 4, power: 2, kind: 'health', radius: 7, text: 'Saúde: felicidade num raio de 7.' }),
  guard: Object.freeze({ id: 'guard', name: 'Posto de Guarda', icon: '🛡️', cost: 70, jobs: 4, power: 1, kind: 'security', radius: 7, text: 'Segurança: felicidade num raio de 7.' }),
  plaza: Object.freeze({ id: 'plaza', name: 'Praça', icon: '🌳', cost: 50, kind: 'comfort', radius: 6, text: 'Convivência: felicidade num raio de 6.' }),
  purifier: Object.freeze({ id: 'purifier', name: 'Descontaminador', icon: '☢️', cost: 100, jobs: 3, power: 3, text: `Limpa 1 terreno contaminado a cada ${PURIFIER_INTERVAL_DAYS} dias num raio de ${PURIFIER_RADIUS}.` }),
});

// Cada final do Vault comeca a cidade de um jeito.
export const CITY_ORIGINS = Object.freeze({
  republic: Object.freeze({ title: 'Nova República', population: 1, resources: 1, happiness: 74,
    intro: 'Lia Moraes pediu que a primeira rua fosse larga o bastante para duas filas de votantes.' }),
  empire: Object.freeze({ title: 'Império das Cinzas', population: 1, resources: 1.2, happiness: 50,
    intro: 'Os muros subiram antes das casas. O Coronel Rui Silva garantiu que ninguém passaria fome ou sairia sem ordem.' }),
  encounter: Object.freeze({ title: 'Cidade dos Dois Presidentes', population: .8, resources: 1.4, happiness: 66,
    intro: 'Os mapas do Vault 0 apontavam um lençol de petróleo intacto e três poços prontos para voltar a bombear.' }),
  last_office: Object.freeze({ title: 'Cidade do Último Gabinete', population: .9, resources: .9, happiness: 72,
    intro: 'Ninguém sabia o nome de quem devolveu a chave, mas todo mundo parecia confiar em quem ficou.' }),
  exile: Object.freeze({ title: 'Acampamento do Exílio', population: .25, resources: .5, happiness: 40,
    intro: 'Eram poucos, desconfiados, e olhavam para o exilado como se ele ainda devesse alguma coisa.' }),
});

const OUTCOMES = Object.freeze({
  thrive: Object.freeze({ title: 'A Cidade que Voltou a Sorrir', icon: '🌆',
    text: 'Dez anos depois, a Porta do Vault virou ponto turístico dos filhos de quem saiu dela. Há luz nas ruas, feira aos sábados e uma escola que ensina o que foi a Bomba como quem conta uma história antiga.' }),
  stable: Object.freeze({ title: 'A Cidade que Resistiu', icon: '🏘️',
    text: 'A cidade não é bonita nem fácil, mas está de pé. O inverno chega e ninguém passa fome. As crianças sabem quem as trouxe até aqui e ainda discutem se foi um herói ou um culpado.' }),
  struggle: Object.freeze({ title: 'A Cidade que Sobrou', icon: '🏚️',
    text: 'Dez anos de remendos. A água falta no verão, a energia falha no inverno, e metade das casas está vazia. Quem ficou jura que é teimosia. Quem partiu diz que era a única saída sensata.' }),
  collapse: Object.freeze({ title: 'A Cidade que Morreu', icon: '🥀',
    text: 'Os últimos moradores deixaram o bairro sem fazer barulho. O vento levou os papéis das mesas, e as torres de vigia ficaram apontando para uma cidade que já não existia.' }),
  revolt: Object.freeze({ title: 'A Cidade que Se Rebelou', icon: '🔥',
    text: 'A praça encheu antes do amanhecer. Ninguém gritou o seu nome, e isso foi pior. A cidade seguiu em frente sem você, e os livros contam a história de outro jeito.' }),
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const indexOf = (x, y) => y * CITY_WIDTH + x;
const inBounds = (x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < CITY_WIDTH && y < CITY_HEIGHT;
const NEIGHBORS = Object.freeze([[1, 0], [-1, 0], [0, 1], [0, -1]]);

export function isCityGate(x, y) {
  return x === CITY_GATE.x && y === CITY_GATE.y;
}

// Terreno: c = limpo, x = contaminado, r = entulho (limpa ao construir, por um custo extra).
export function generateCityGround(seed = 1) {
  let ground = '';
  for (let y = 0; y < CITY_HEIGHT; y++) {
    for (let x = 0; x < CITY_WIDTH; x++) {
      const near = Math.hypot(x - CITY_GATE.x, (y - CITY_GATE.y) * 1.5);
      const noise = hash(x, y, seed);
      if (x >= 8 && x <= 16 && y >= 10) ground += 'c';
      else if (near < 8 && noise < .3) ground += 'r';
      else if (noise > .9) ground += 'c';
      else ground += 'x';
    }
  }
  return ground;
}

const CAMP = Object.freeze([
  ['road', 12, 14], ['road', 12, 13], ['road', 12, 12], ['road', 11, 12], ['road', 10, 12], ['road', 13, 12], ['road', 14, 12],
  ['house', 11, 13], ['house', 13, 13], ['house', 11, 11], ['house', 13, 11], ['house', 10, 13], ['house', 15, 12],
  ['farm', 10, 11], ['farm', 14, 11], ['well', 14, 13], ['generator', 9, 12],
]);

const makeBuilding = (type, x, y) => ({ id: `${type}-${x}-${y}`, type, x, y });

export function createCity(state, originId) {
  const origin = CITY_ORIGINS[originId];
  const vaultPopulation = Math.max(0, Number(state?.country?.populacao_base) || (state?.inhabitants ?? []).length || 0);
  const seed = Math.max(1, Math.floor(Number(state?.randomSeed) || 1));
  const resources = origin.resources;
  return {
    version: 1,
    origin: originId,
    seed,
    day: 0,
    speed: 0,
    ground: generateCityGround(seed),
    buildings: CAMP.map(([type, x, y]) => makeBuilding(type, x, y)),
    resources: {
      scrap: Math.round(clamp((Number(state?.scrap) || 0) * .5, 150, 800) * resources + 120),
      food: Math.round(clamp((Number(state?.shelter_supplies?.food) || 0) * 3, 150, 600) * resources),
      water: Math.round(300 * resources),
      oil: Math.round(clamp(Number(state?.oil) || 0, 0, 400) * resources + 70),
    },
    population: Math.max(8, Math.round(clamp(vaultPopulation / 40, 40, 64) * origin.population)),
    happiness: origin.happiness,
    stats: { peakPopulation: 0, happinessSum: 0, happinessDays: 0, lowHappinessDays: 0, built: CAMP.length },
    objectiveId: CITY_OBJECTIVES[0].id,
    completedObjectives: [],
    history: [],
    flags: { food: false, water: false, power: false, broke: false },
    log: [{ day: 0, text: `${origin.title}: ${origin.intro}` }],
    message: '',
    result: null,
  };
}

export function startCity(state) {
  const id = state?.ending?.id;
  if (!state?.is_wasteland || !id || state.city || !CITY_ORIGINS[id]) return state;
  const city = createCity(state, id);
  city.stats.peakPopulation = city.population;
  return { ...state, city, notice: `${CITY_ORIGINS[id].title}: a reconstrução começou.` };
}

// ---------- Leitura da cidade ----------

export function getCityDate(city) {
  const day = Math.max(0, Math.floor(Number(city?.day) || 0));
  return { total: day, year: Math.floor(day / CITY_DAYS_PER_YEAR) + 1, month: Math.floor((day % CITY_DAYS_PER_YEAR) / DAYS_PER_MONTH) + 1,
    dayOfMonth: day % DAYS_PER_MONTH + 1 };
}

export function getBuildingAt(city, x, y) {
  return city?.buildings?.find((building) => building.x === x && building.y === y) ?? null;
}

export function getCityObjective(city, analysis = analyzeCity(city)) {
  const completed = new Set(Array.isArray(city?.completedObjectives) ? city.completedObjectives : []);
  const current = CITY_OBJECTIVES.find((objective) => !completed.has(objective.id));
  if (!current) return { ...CITY_OBJECTIVES[CITY_OBJECTIVES.length - 1], completed: true, progress: 1 };
  return {
    ...current,
    completed: false,
    progress: clamp(Number(current.progress(city, analysis)) || 0, 0, 1),
  };
}

function advanceCityObjectives(city) {
  const analysis = analyzeCity(city);
  const completed = new Set(Array.isArray(city.completedObjectives) ? city.completedObjectives : []);
  let next = city;
  for (const objective of CITY_OBJECTIVES) {
    if (completed.has(objective.id) || !objective.check(next, analysis)) continue;
    completed.add(objective.id);
    next = withLog(next, objective.log);
  }
  const nextObjective = CITY_OBJECTIVES.find((objective) => !completed.has(objective.id));
  return { ...next, completedObjectives: [...completed], objectiveId: nextObjective?.id ?? null };
}

// Tudo que depende de estradas, energia, vagas e cobertura, calculado a partir do estado atual.
export function analyzeCity(city) {
  const byIndex = new Map(city.buildings.map((building) => [indexOf(building.x, building.y), building]));
  const gateIndex = indexOf(CITY_GATE.x, CITY_GATE.y);
  const roads = new Set();
  const queue = [];
  const visit = (x, y) => {
    if (!inBounds(x, y)) return;
    const index = indexOf(x, y);
    if (!roads.has(index) && byIndex.get(index)?.type === 'road') { roads.add(index); queue.push([x, y]); }
  };
  NEIGHBORS.forEach(([dx, dy]) => visit(CITY_GATE.x + dx, CITY_GATE.y + dy));
  while (queue.length) {
    const [x, y] = queue.shift();
    NEIGHBORS.forEach(([dx, dy]) => visit(x + dx, y + dy));
  }
  const touchesNetwork = (building) => NEIGHBORS.some(([dx, dy]) => {
    const x = building.x + dx;
    const y = building.y + dy;
    return inBounds(x, y) && (indexOf(x, y) === gateIndex || roads.has(indexOf(x, y)));
  });
  const buildings = city.buildings.filter((building) => building.type !== 'road');
  const active = buildings.filter(touchesNetwork);
  const oil = Math.max(0, Number(city.resources?.oil) || 0);
  const generators = active.filter((building) => building.type === 'generator');
  const runningGenerators = Math.min(generators.length, Math.floor(oil / CITY_BUILDINGS.generator.oilBurn));
  const powerSupply = runningGenerators * CITY_BUILDINGS.generator.powerOut
    + active.filter((building) => building.type === 'solar').length * CITY_BUILDINGS.solar.powerOut;
  const powerNeed = active.reduce((total, building) => total + (CITY_BUILDINGS[building.type].power ?? 0), 0);
  const powerRatio = powerNeed > 0 ? Math.min(1, powerSupply / powerNeed) : 1;
  const jobs = active.reduce((total, building) => total + (CITY_BUILDINGS[building.type].jobs ?? 0), 0);
  const workers = Math.floor((Number(city.population) || 0) * WORKER_SHARE);
  const staffing = jobs > 0 ? Math.min(1, workers / jobs) : 1;
  const unemployment = workers > 0 ? Math.max(0, workers - jobs) / workers : 0;
  const status = new Map();
  const production = { food: 0, water: 0, scrap: 0, oil: 0 };
  for (const building of buildings) {
    const def = CITY_BUILDINGS[building.type];
    const connected = touchesNetwork(building);
    const efficiency = connected ? (def.jobs ? staffing : 1) * (def.power ? powerRatio : 1) : 0;
    status.set(building.id, { connected, efficiency, powered: !def.power || powerRatio >= .5 });
    for (const key of Object.keys(production)) production[key] += (def[key] ?? 0) * efficiency;
  }
  const houses = active.filter((building) => building.type === 'house');
  const capacity = houses.length * CITY_BUILDINGS.house.capacity;
  const coverage = {};
  for (const kind of ['health', 'security', 'commerce', 'comfort']) {
    const services = active.filter((building) => CITY_BUILDINGS[building.type].kind === kind);
    const covered = houses.filter((house) => services.some((service) =>
      Math.abs(service.x - house.x) + Math.abs(service.y - house.y) <= CITY_BUILDINGS[service.type].radius));
    coverage[kind] = houses.length ? covered.length / houses.length : 0;
  }
  const exposed = houses.filter((house) => {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (inBounds(house.x + dx, house.y + dy) && city.ground[indexOf(house.x + dx, house.y + dy)] === 'x') return true;
    }
    return false;
  }).length;
  return { roads, active, status, powerSupply, powerNeed, powerRatio, runningGenerators, jobs, workers, staffing, unemployment,
    production, capacity, houses: houses.length, coverage, exposure: houses.length ? exposed / houses.length : 0 };
}

function targetHappiness(city, analysis, foodRatio, waterRatio, broke) {
  const { coverage } = analysis;
  const value = 40
    + (foodRatio >= .95 ? 12 : -35 * (1 - foodRatio))
    + (waterRatio >= .95 ? 10 : -30 * (1 - waterRatio))
    + (analysis.powerRatio >= .95 ? 8 : -20 * (1 - analysis.powerRatio))
    + 8 * coverage.health + 8 * coverage.security + 7 * coverage.commerce + 7 * coverage.comfort
    + 8 * (1 - analysis.unemployment)
    - 12 * analysis.exposure
    - (broke ? 5 : 0);
  return clamp(value, 0, 100);
}

function withLog(city, text) {
  return { ...city, log: [...city.log, { day: city.day, text }].slice(-8) };
}

// ---------- Resultado ----------

export function evaluateCity(city, forcedOutcome = null) {
  const days = city.stats.happinessDays;
  const averageHappiness = days ? city.stats.happinessSum / days : city.happiness;
  const yearsSurvived = Math.min(CITY_YEARS, city.day / CITY_DAYS_PER_YEAR);
  const score = clamp(Math.round(
    Math.min(1, city.population / POPULATION_GOAL) * 45 + averageHappiness * .35
    + Math.min(1, city.stats.built / 40) * 10 + yearsSurvived / CITY_YEARS * 10), 0, 100);
  const outcome = forcedOutcome ?? (score >= 75 ? 'thrive' : score >= 50 ? 'stable' : 'struggle');
  return { outcome, score, population: city.population, peakPopulation: city.stats.peakPopulation,
    averageHappiness: Math.round(averageHappiness), buildings: city.buildings.length, years: Math.round(yearsSurvived * 10) / 10 };
}

export function getCityEpilogue(state) {
  const city = state?.city;
  if (!city?.result) return null;
  const outcome = OUTCOMES[city.result.outcome] ?? OUTCOMES.struggle;
  const origin = CITY_ORIGINS[city.origin];
  const leader = getLeaderName(state);
  return { ...outcome, origin: origin?.title ?? '', story: `${origin?.intro ?? ''} ${outcome.text}`.trim().replaceAll('{leader}', leader), result: city.result };
}

function finish(city, forcedOutcome = null, reason = '') {
  const closed = reason ? withLog(city, reason) : city;
  return { ...closed, speed: 0, result: evaluateCity(closed, forcedOutcome) };
}

// ---------- Um dia ----------

export function advanceCityDay(state) {
  const source = state?.city;
  if (!source || source.result) return state;
  let city = { ...source, resources: { ...source.resources }, stats: { ...source.stats }, flags: { ...source.flags } };
  const analysis = analyzeCity(city);
  const population = city.population;
  const resources = city.resources;

  const foodNeed = population * FOOD_PER_CITIZEN;
  const waterNeed = population * WATER_PER_CITIZEN;
  const foodAvailable = resources.food + analysis.production.food;
  const waterAvailable = resources.water + analysis.production.water;
  const foodRatio = foodNeed > 0 ? Math.min(1, foodAvailable / foodNeed) : 1;
  const waterRatio = waterNeed > 0 ? Math.min(1, waterAvailable / waterNeed) : 1;
  resources.food = clamp(Math.round(foodAvailable - foodNeed), 0, STORAGE_CAP);
  resources.water = clamp(Math.round(waterAvailable - waterNeed), 0, STORAGE_CAP);
  resources.oil = clamp(Math.round(resources.oil - analysis.runningGenerators * CITY_BUILDINGS.generator.oilBurn + analysis.production.oil), 0, STORAGE_CAP);
  const income = analysis.production.scrap + population * SCAVENGE_PER_CITIZEN - city.buildings.length * UPKEEP_PER_BUILDING;
  const scrapAfter = resources.scrap + income;
  const broke = scrapAfter < 0;
  resources.scrap = clamp(Math.round(scrapAfter), 0, STORAGE_CAP);

  // Descontaminadores limpam o terreno ao redor, um terreno por vez.
  if ((city.day + 1) % PURIFIER_INTERVAL_DAYS === 0) {
    let ground = city.ground;
    for (const building of analysis.active.filter((candidate) => candidate.type === 'purifier')) {
      if ((analysis.status.get(building.id)?.efficiency ?? 0) < .5) continue;
      let best = null;
      for (let y = building.y - PURIFIER_RADIUS; y <= building.y + PURIFIER_RADIUS; y++) {
        for (let x = building.x - PURIFIER_RADIUS; x <= building.x + PURIFIER_RADIUS; x++) {
          if (!inBounds(x, y) || ground[indexOf(x, y)] !== 'x') continue;
          const distance = Math.abs(x - building.x) + Math.abs(y - building.y);
          if (distance <= PURIFIER_RADIUS && (!best || distance < best.distance)) best = { x, y, distance };
        }
      }
      if (best) ground = `${ground.slice(0, indexOf(best.x, best.y))}c${ground.slice(indexOf(best.x, best.y) + 1)}`;
    }
    city.ground = ground;
  }

  // Populacao: cresce com moradia e conforto; encolhe com fome, sede, superlotacao e infelicidade.
  let nextPopulation = population;
  if (foodRatio < .6 || waterRatio < .6) nextPopulation -= Math.ceil(population * .01);
  else if (population < analysis.capacity && city.happiness >= 35) nextPopulation = Math.min(analysis.capacity, population + Math.max(1, Math.round(population * .005)));
  else if (population > analysis.capacity) nextPopulation -= Math.max(1, Math.ceil((population - analysis.capacity) * .05));
  if (city.happiness < 20) nextPopulation -= Math.ceil(population * .004);
  city.population = Math.max(0, nextPopulation);

  const target = targetHappiness(city, analysis, foodRatio, waterRatio, broke);
  city.happiness = clamp(Math.round((city.happiness + clamp(target - city.happiness, -2, 2)) * 10) / 10, 0, 100);
  city.stats.peakPopulation = Math.max(city.stats.peakPopulation, city.population);
  city.stats.happinessSum += city.happiness;
  city.stats.happinessDays += 1;
  city.stats.lowHappinessDays = city.happiness < REVOLT_HAPPINESS ? city.stats.lowHappinessDays + 1 : 0;
  city.day += 1;

  const flags = { food: foodRatio < .6, water: waterRatio < .6, power: analysis.powerRatio < .6, broke };
  const warnings = [
    flags.food && !city.flags.food ? 'Faltou comida: a população começou a passar fome.' : null,
    flags.water && !city.flags.water ? 'Faltou água potável na cidade.' : null,
    flags.power && !city.flags.power ? 'Apagão: falta energia para os prédios.' : null,
    flags.broke && !city.flags.broke ? 'A cidade está sem sucata para a manutenção.' : null,
  ].filter(Boolean);
  city.flags = flags;
  for (const warning of warnings) city = withLog(city, warning);
  if (city.day % DAYS_PER_MONTH === 0) {
    const entry = { day: city.day, population: city.population, happiness: Math.round(city.happiness) };
    city.history = [...city.history, entry].slice(-CITY_YEARS * 12);
  }
  if (city.day % CITY_DAYS_PER_YEAR === 0 && city.day < CITY_TOTAL_DAYS) {
    city = withLog(city, `Ano ${getCityDate(city).year}: ${city.population} cidadãos, felicidade ${Math.round(city.happiness)}%.`);
  }

  city = advanceCityObjectives(city);

  if (city.population <= 0) city = finish(city, 'collapse', 'Os últimos cidadãos foram embora.');
  else if (city.stats.lowHappinessDays >= REVOLT_DAYS) city = finish(city, 'revolt', 'A cidade se levantou contra o governo.');
  else if (city.day >= CITY_TOTAL_DAYS) city = finish(city, null, `Fim do ano ${CITY_YEARS}: a reconstrução chegou ao fim.`);
  return { ...state, city };
}

// ---------- Acoes do jogador ----------

function say(state, message) {
  return { ...state, city: { ...state.city, message } };
}

export function canPlaceAt(city, type, x, y) {
  const def = CITY_BUILDINGS[type];
  if (!def) return { ok: false, reason: 'Construção desconhecida.' };
  if (!inBounds(x, y)) return { ok: false, reason: 'Fora do mapa.' };
  if (isCityGate(x, y)) return { ok: false, reason: 'A Porta do Vault não pode ser ocupada.' };
  if (getBuildingAt(city, x, y)) return { ok: false, reason: 'Já existe uma construção aqui.' };
  const ground = city.ground[indexOf(x, y)];
  if (ground === 'x') return { ok: false, reason: 'Terreno contaminado: use um Descontaminador por perto.' };
  const cost = def.cost + (ground === 'r' ? RUBBLE_EXTRA_COST : 0);
  if ((city.resources.scrap ?? 0) < cost) return { ok: false, reason: `Sucata insuficiente: custa ${cost}.`, cost };
  return { ok: true, cost, rubble: ground === 'r' };
}

export function placeCityBuilding(state, type, x, y) {
  const city = state?.city;
  if (!city || city.result) return state;
  const check = canPlaceAt(city, type, x, y);
  if (!check.ok) return say(state, check.reason);
  const ground = city.ground;
  const cleared = check.rubble ? `${ground.slice(0, indexOf(x, y))}c${ground.slice(indexOf(x, y) + 1)}` : ground;
  return { ...state, city: { ...city, ground: cleared, buildings: [...city.buildings, makeBuilding(type, x, y)],
    resources: { ...city.resources, scrap: city.resources.scrap - check.cost },
    stats: { ...city.stats, built: city.stats.built + 1 }, message: `${CITY_BUILDINGS[type].name} construído.` } };
}

export function demolishCityBuilding(state, x, y) {
  const city = state?.city;
  if (!city || city.result) return state;
  const building = getBuildingAt(city, x, y);
  if (!building) return say(state, 'Nada para demolir aqui.');
  const refund = Math.floor(CITY_BUILDINGS[building.type].cost / 2);
  return { ...state, city: { ...city, buildings: city.buildings.filter((candidate) => candidate !== building),
    resources: { ...city.resources, scrap: Math.min(STORAGE_CAP, city.resources.scrap + refund) },
    message: `${CITY_BUILDINGS[building.type].name} demolido: +${refund} sucatas.` } };
}

export function setCitySpeed(state, speed) {
  const city = state?.city;
  if (!city || city.result || !CITY_SPEEDS.includes(speed)) return state;
  return { ...state, city: { ...city, speed } };
}

// ---------- Save ----------

export function normalizeCity(value) {
  if (!value || typeof value !== 'object' || !CITY_ORIGINS[value.origin]) return null;
  const number = (raw, fallback, min = 0, max = Infinity) => (Number.isFinite(Number(raw)) ? clamp(Number(raw), min, max) : fallback);
  const ground = typeof value.ground === 'string' && value.ground.length === CITY_WIDTH * CITY_HEIGHT && /^[cxr]+$/.test(value.ground)
    ? value.ground : generateCityGround(number(value.seed, 1, 1));
  const seen = new Set();
  const buildings = (Array.isArray(value.buildings) ? value.buildings : []).filter((building) => {
    const key = `${building?.x},${building?.y}`;
    if (!CITY_BUILDINGS[building?.type] || !inBounds(building.x, building.y) || isCityGate(building.x, building.y) || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((building) => makeBuilding(building.type, building.x, building.y));
  const stats = value.stats ?? {};
  const resources = value.resources ?? {};
  const flags = value.flags ?? {};
  const result = value.result && typeof value.result === 'object' && OUTCOMES[value.result.outcome]
    ? { outcome: value.result.outcome, score: number(value.result.score, 0, 0, 100), population: number(value.result.population, 0),
      peakPopulation: number(value.result.peakPopulation, 0), averageHappiness: number(value.result.averageHappiness, 0, 0, 100),
      buildings: number(value.result.buildings, 0), years: number(value.result.years, 0, 0, CITY_YEARS) } : null;
  return {
    version: 1,
    origin: value.origin,
    seed: number(value.seed, 1, 1),
    day: Math.floor(number(value.day, 0, 0, CITY_TOTAL_DAYS)),
    speed: CITY_SPEEDS.includes(value.speed) && !result ? value.speed : 0,
    ground,
    buildings,
    resources: { scrap: Math.floor(number(resources.scrap, 0, 0, STORAGE_CAP)), food: Math.floor(number(resources.food, 0, 0, STORAGE_CAP)),
      water: Math.floor(number(resources.water, 0, 0, STORAGE_CAP)), oil: Math.floor(number(resources.oil, 0, 0, STORAGE_CAP)) },
    population: Math.floor(number(value.population, 0, 0, 100_000)),
    happiness: number(value.happiness, 50, 0, 100),
    stats: { peakPopulation: Math.floor(number(stats.peakPopulation, 0)), happinessSum: number(stats.happinessSum, 0),
      happinessDays: Math.floor(number(stats.happinessDays, 0)), lowHappinessDays: Math.floor(number(stats.lowHappinessDays, 0)),
      built: Math.floor(number(stats.built, buildings.length)) },
    objectiveId: CITY_OBJECTIVES.some((objective) => objective.id === value.objectiveId) ? value.objectiveId : null,
    completedObjectives: [...new Set((Array.isArray(value.completedObjectives) ? value.completedObjectives : [])
      .filter((id) => CITY_OBJECTIVES.some((objective) => objective.id === id)))],
    history: (Array.isArray(value.history) ? value.history : []).slice(-CITY_YEARS * 12).map((entry) => ({
      day: Math.floor(number(entry?.day, 0)), population: Math.floor(number(entry?.population, 0)), happiness: Math.floor(number(entry?.happiness, 0, 0, 100)) })),
    flags: { food: flags.food === true, water: flags.water === true, power: flags.power === true, broke: flags.broke === true },
    log: (Array.isArray(value.log) ? value.log : []).filter((entry) => typeof entry?.text === 'string').slice(-8)
      .map((entry) => ({ day: Math.floor(number(entry.day, 0)), text: entry.text.slice(0, 240) })),
    message: typeof value.message === 'string' ? value.message.slice(0, 160) : '',
    result,
  };
}
