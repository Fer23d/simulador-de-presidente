import { advanceCityDay, analyzeCity, canPlaceAt, CITY_BUILDINGS, CITY_GATE, CITY_ORIGINS, CITY_SPEED_INTERVAL_MS, CITY_TOTAL_DAYS, CITY_HEIGHT,
  CITY_WIDTH, CITY_YEARS, demolishCityBuilding, FOOD_PER_CITIZEN, getBuildingAt, getCityDate, getCityEpilogue, placeCityBuilding,
  SCAVENGE_PER_CITIZEN, setCitySpeed, UPKEEP_PER_BUILDING, WATER_PER_CITIZEN } from '../core/city.js';
import { CITY_CANVAS_HEIGHT, CITY_CANVAS_WIDTH, CITY_TILE, renderCity } from '../core/city_renderer.js';

const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const escapeText = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const PALETTE = Object.freeze(['road', 'house', 'farm', 'well', 'generator', 'solar', 'derrick', 'workshop', 'market', 'clinic', 'guard', 'plaza', 'purifier']);
const SPEED_LABELS = Object.freeze({ 0: '⏸', 1: '▶', 2: '▶▶', 3: '▶▶▶' });

export function cityClockText(city) {
  const date = getCityDate(city);
  return `ANO ${Math.min(CITY_YEARS, date.year)} DE ${CITY_YEARS} · MÊS ${date.month} · DIA ${date.dayOfMonth}`;
}

function paletteButton(id) {
  const def = CITY_BUILDINGS[id];
  return `<button type="button" class="city-tool" data-city-tool="${id}" aria-pressed="false" title="${escapeText(def.text)}"><span class="city-tool-icon" aria-hidden="true">${def.icon}</span><span class="city-tool-name">${escapeText(def.name)}</span><span class="city-tool-cost">${def.cost}</span></button>`;
}

// Casca estatica da tela; o controlador atualiza os numeros e desenha o mapa sem recriar nada.
export function cityView(state) {
  const city = state.city;
  const origin = CITY_ORIGINS[city.origin];
  return `<section class="panel city-panel" data-city>
    <div class="city-topbar">
      <div><p class="eyebrow">/// RECONSTRUÇÃO ///</p><h2>${escapeText(origin.title)}</h2></div>
      <div class="city-clock" data-city-clock>${cityClockText(city)}</div>
      <div class="city-speeds" role="group" aria-label="Velocidade do tempo">${[0, 1, 2, 3].map((speed) => `<button type="button" class="city-speed" data-city-speed="${speed}" aria-pressed="${city.speed === speed}" aria-label="${speed ? `Velocidade ${speed}` : 'Pausar'}">${SPEED_LABELS[speed]}</button>`).join('')}</div>
    </div>
    <div class="city-hud" data-city-hud role="status"></div>
    <div class="city-main">
      <div class="city-stage">
        <canvas id="cityCanvas" class="city-canvas" width="${CITY_CANVAS_WIDTH}" height="${CITY_CANVAS_HEIGHT}" tabindex="0" aria-label="Mapa da cidade. Escolha uma construção e clique num terreno livre."></canvas>
        <div class="city-tooltip" data-city-tip hidden></div>
      </div>
      <aside class="city-side">
        <p class="city-side-title">CONSTRUIR <small>(sucatas)</small></p>
        <div class="city-palette">${PALETTE.map(paletteButton).join('')}<button type="button" class="city-tool is-danger" data-city-tool="demolish" aria-pressed="false" title="Demolir e recuperar metade do custo"><span class="city-tool-icon" aria-hidden="true">🧨</span><span class="city-tool-name">Demolir</span><span class="city-tool-cost">50%</span></button></div>
        <div class="city-info" data-city-info></div>
        <p class="city-side-title">DIÁRIO</p>
        <ol class="city-log" data-city-log></ol>
      </aside>
    </div>
  </section>`;
}

export function cityEpilogueView(state) {
  const epilogue = getCityEpilogue(state);
  if (!epilogue) return '';
  const { result } = epilogue;
  const stat = (label, value) => `<div><span>${label}</span><strong>${value}</strong></div>`;
  return `<section class="door-dialog epilogue city-epilogue" role="dialog" aria-modal="true" aria-labelledby="city-ending-title"><p class="story-classification">/// ${escapeText(epilogue.origin.toUpperCase())} · ${result.years} ANOS DE RECONSTRUÇÃO ///</p><div class="ending-icon" aria-hidden="true">${epilogue.icon}</div><h2 id="city-ending-title">${escapeText(epilogue.title.toUpperCase())}</h2><p class="story-typewriter ending-story">${escapeText(epilogue.story)}</p><div class="city-score"><div class="city-score-main"><span>PONTUAÇÃO</span><strong>${result.score}</strong></div>${stat('População final', number.format(result.population))}${stat('Pico de população', number.format(result.peakPopulation))}${stat('Felicidade média', `${result.averageHappiness}%`)}${stat('Construções', number.format(result.buildings))}</div><div class="action-row"><button type="button" class="wasteland-command-button" data-action="ending-new-game">[ NOVA PARTIDA ]</button></div></section>`;
}

function statusLine(label, ok, detail) {
  return `<span class="city-chip ${ok ? 'is-ok' : 'is-bad'}">${label} ${detail}</span>`;
}

export function cityHudView(city, analysis) {
  const population = city.population;
  const foodNet = analysis.production.food - population * FOOD_PER_CITIZEN;
  const waterNet = analysis.production.water - population * WATER_PER_CITIZEN;
  const income = analysis.production.scrap + population * SCAVENGE_PER_CITIZEN - city.buildings.length * UPKEEP_PER_BUILDING;
  const sign = (value) => `${value >= 0 ? '+' : '−'}${number.format(Math.abs(value))}`;
  const happy = Math.round(city.happiness);
  return `<span class="city-chip">👥 ${number.format(population)} / ${number.format(analysis.capacity)}</span>
    <span class="city-chip ${happy >= 50 ? 'is-ok' : happy >= 25 ? 'is-warn' : 'is-bad'}">😊 ${happy}%<span class="city-meter"><span style="width:${happy}%"></span></span></span>
    ${statusLine('🌽', city.resources.food > 0 || foodNet >= 0, `${number.format(city.resources.food)} (${sign(foodNet)}/dia)`)}
    ${statusLine('💧', city.resources.water > 0 || waterNet >= 0, `${number.format(city.resources.water)} (${sign(waterNet)}/dia)`)}
    ${statusLine('⚡', analysis.powerRatio >= .95, `${number.format(analysis.powerSupply)}/${number.format(analysis.powerNeed)}`)}
    ${statusLine('🔩', city.resources.scrap > 0, `${number.format(city.resources.scrap)} (${sign(income)}/dia)`)}
    <span class="city-chip">🛢️ ${number.format(city.resources.oil)}</span>
    <span class="city-chip ${analysis.unemployment > .3 ? 'is-warn' : ''}">🧰 ${number.format(Math.min(analysis.jobs, analysis.workers))}/${number.format(analysis.jobs)} vagas</span>`;
}

function infoView(city, analysis, tool, tile) {
  const def = CITY_BUILDINGS[tool];
  if (def) {
    return `<h3>${def.icon} ${escapeText(def.name)}</h3><p>${escapeText(def.text)}</p><p class="city-info-cost">Custo: ${def.cost} sucatas</p>`;
  }
  if (tool === 'demolish') return '<h3>🧨 Demolir</h3><p>Clique num prédio para demoli-lo e recuperar metade do custo.</p>';
  const building = tile ? getBuildingAt(city, tile.x, tile.y) : null;
  if (building && building.type !== 'road') {
    const info = CITY_BUILDINGS[building.type];
    const status = analysis.status.get(building.id) ?? { connected: false, efficiency: 0 };
    const lines = [
      status.connected ? '✅ Ligado à estrada do Vault' : '❌ Sem estrada até a Porta do Vault',
      info.power ? (analysis.powerRatio >= .95 ? '⚡ Energia completa' : `⚡ Energia em ${Math.round(analysis.powerRatio * 100)}%`) : null,
      info.jobs ? `🧰 Equipe em ${Math.round(analysis.staffing * 100)}% (${info.jobs} vagas)` : null,
      info.kind ? `📍 Cobertura num raio de ${info.radius}` : null,
      status.connected ? `📈 Rendimento em ${Math.round(status.efficiency * 100)}%` : null,
    ].filter(Boolean);
    return `<h3>${info.icon} ${escapeText(info.name)}</h3><ul>${lines.map((line) => `<li>${line}</li>`).join('')}</ul>`;
  }
  return '<h3>Escolha uma construção</h3><p>Todo prédio precisa de estrada ligada à Porta do Vault, energia e gente para trabalhar. O terreno amarelo-esverdeado está contaminado: use um Descontaminador.</p>';
}

export function createCityController(root, { getState, onChange, onSound = () => {} }) {
  const canvas = root.querySelector('#cityCanvas');
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  const hud = root.querySelector('[data-city-hud]');
  const info = root.querySelector('[data-city-info]');
  const logList = root.querySelector('[data-city-log]');
  const tip = root.querySelector('[data-city-tip]');
  const clock = root.querySelector('[data-city-clock]');
  let tool = null;
  let hover = null;
  let selected = null;
  let analysis = analyzeCity(getState().city);
  let timer = null;
  let frameId = null;
  let destroyed = false;
  let lastSave = 0;
  let lastMessage = '';

  const city = () => getState().city;

  function refresh() {
    const current = city();
    analysis = analyzeCity(current);
    hud.innerHTML = cityHudView(current, analysis);
    clock.textContent = cityClockText(current);
    logList.innerHTML = [...current.log].reverse().map((entry) => `<li><small>Dia ${entry.day}</small> ${escapeText(entry.text)}</li>`).join('');
    const message = current.message && current.message !== lastMessage ? current.message : '';
    if (message) lastMessage = current.message;
    info.innerHTML = `${message ? `<p class="city-message">${escapeText(message)}</p>` : ''}${infoView(current, analysis, tool, selected)}`;
    root.querySelectorAll('[data-city-speed]').forEach((button) => button.setAttribute('aria-pressed', String(Number(button.dataset.citySpeed) === current.speed)));
    root.querySelectorAll('[data-city-tool]').forEach((button) => {
      const def = CITY_BUILDINGS[button.dataset.cityTool];
      button.setAttribute('aria-pressed', String(button.dataset.cityTool === tool));
      button.disabled = Boolean(def) && current.resources.scrap < def.cost;
    });
  }

  function commit(next, { persist = false, rerender = false } = {}) {
    const now = Date.now();
    const shouldSave = persist || now - lastSave > 2_500;
    if (shouldSave) lastSave = now;
    onChange(next, { persist: shouldSave, rerender });
    if (!rerender) refresh();
  }

  function schedule() {
    if (timer !== null) { window.clearInterval(timer); timer = null; }
    const interval = CITY_SPEED_INTERVAL_MS[city().speed];
    if (!interval || destroyed) return;
    timer = window.setInterval(() => {
      const before = city();
      const next = advanceCityDay(getState());
      const finished = Boolean(next.city.result);
      commit(next, { persist: finished || next.city.day % 30 === 0, rerender: finished });
      if (finished) return;
      if (next.city.speed !== before.speed) schedule();
    }, interval);
  }

  function setSpeed(speed) {
    commit(setCitySpeed(getState(), speed), { persist: true });
    schedule();
  }

  function tileAt(event) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) * canvas.width / rect.width / CITY_TILE);
    const y = Math.floor((event.clientY - rect.top) * canvas.height / rect.height / CITY_TILE);
    return x >= 0 && y >= 0 && x < CITY_WIDTH && y < CITY_HEIGHT ? { x, y } : null;
  }

  function onMove(event) {
    hover = tileAt(event);
    const current = city();
    const building = hover ? getBuildingAt(current, hover.x, hover.y) : null;
    if (!hover) { tip.hidden = true; return; }
    const ground = current.ground[hover.y * CITY_WIDTH + hover.x];
    const text = building ? CITY_BUILDINGS[building.type].name : hover.x === CITY_GATE.x && hover.y === CITY_GATE.y ? 'Porta do Vault'
      : ground === 'x' ? 'Terreno contaminado' : ground === 'r' ? 'Entulho (+8 para construir)' : '';
    tip.hidden = !text;
    tip.textContent = text;
    const rect = canvas.getBoundingClientRect();
    tip.style.left = `${event.clientX - rect.left + 14}px`;
    tip.style.top = `${event.clientY - rect.top + 14}px`;
  }

  function onClick(event) {
    const tile = tileAt(event);
    if (!tile || city().result) return;
    selected = tile;
    const state = getState();
    if (tool === 'demolish') {
      const next = demolishCityBuilding(state, tile.x, tile.y);
      if (next.city.buildings.length !== state.city.buildings.length) onSound('click');
      commit(next, { persist: true });
    } else if (tool) {
      const next = placeCityBuilding(state, tool, tile.x, tile.y);
      if (next.city.buildings.length !== state.city.buildings.length) onSound('build');
      commit(next, { persist: true });
    } else refresh();
  }

  function onPanelClick(event) {
    const toolButton = event.target.closest('[data-city-tool]');
    if (toolButton) {
      tool = tool === toolButton.dataset.cityTool ? null : toolButton.dataset.cityTool;
      refresh();
      return;
    }
    const speedButton = event.target.closest('[data-city-speed]');
    if (speedButton) setSpeed(Number(speedButton.dataset.citySpeed));
  }

  function onKey(event) {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    if (event.key === 'Escape') { tool = null; refresh(); }
    else if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      setSpeed(city().speed === 0 ? 1 : 0);
    } else if (['1', '2', '3'].includes(event.key)) setSpeed(Number(event.key));
  }

  function frame(time) {
    if (destroyed) return;
    const current = city();
    const canPlace = hover && tool && tool !== 'demolish' ? canPlaceAt(current, tool, hover.x, hover.y).ok : true;
    renderCity(ctx, current, analysis, { time, hover, tool, canPlace });
    frameId = requestAnimationFrame(frame);
  }

  root.querySelector('[data-city]').addEventListener('click', onPanelClick);
  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mouseleave', () => { hover = null; tip.hidden = true; });
  canvas.addEventListener('click', onClick);
  window.addEventListener('keydown', onKey);
  refresh();
  schedule();
  if (typeof requestAnimationFrame === 'function') frameId = requestAnimationFrame(frame);
  return {
    destroy() {
      destroyed = true;
      if (timer !== null) window.clearInterval(timer);
      if (frameId !== null) cancelAnimationFrame(frameId);
      window.removeEventListener('keydown', onKey);
    },
    getSnapshot: () => ({ tool, speed: city().speed, totalDays: CITY_TOTAL_DAYS }),
  };
}
