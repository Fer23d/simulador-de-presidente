// Pocos de petroleo na superficie, no estilo coletor: produzem em tempo real ate encher o tanque
// e o jogador toca no poco para recolher. Construir e melhorar leva tempo, e o poco para de bombear durante a obra.
export const OIL_DERRICK_SLOTS = 3;
export const OIL_MAX_LEVEL = 5;

// Por nivel: producao por minuto, tanque, tempo de obra e custo para chegar a este nivel.
export const OIL_LEVELS = Object.freeze([
  null,
  Object.freeze({ ratePerMinute: 2, capacity: 60, buildMs: 20_000, scrap: 0, oil: 0 }),
  Object.freeze({ ratePerMinute: 3, capacity: 120, buildMs: 60_000, scrap: 120, oil: 0 }),
  Object.freeze({ ratePerMinute: 5, capacity: 240, buildMs: 3 * 60_000, scrap: 250, oil: 100 }),
  Object.freeze({ ratePerMinute: 8, capacity: 400, buildMs: 8 * 60_000, scrap: 400, oil: 250 }),
  Object.freeze({ ratePerMinute: 12, capacity: 600, buildMs: 15 * 60_000, scrap: 600, oil: 500 }),
]);

// O primeiro poco e barato para o jogador sentir o ciclo; os seguintes custam mais.
export const OIL_BUILD_COSTS = Object.freeze([150, 250, 400]);
// So vale mostrar a gota de "pronto para recolher" quando ha uma quantia que compense o toque.
export const OIL_COLLECT_THRESHOLD = 5;

function normalizeDerrick(value) {
  const level = Math.floor(Number(value?.level));
  if (!Number.isInteger(level) || level < 1) return null;
  const collectedAt = Number(value.collectedAt);
  const upgradeUntil = Number(value.upgradeUntil);
  return {
    level: Math.min(OIL_MAX_LEVEL, level),
    collectedAt: Number.isFinite(collectedAt) ? collectedAt : 0,
    upgradeUntil: Number.isFinite(upgradeUntil) && upgradeUntil > 0 ? upgradeUntil : 0,
  };
}

export function normalizeOilField(value) {
  const list = Array.isArray(value) ? value : [];
  return Array.from({ length: OIL_DERRICK_SLOTS }, (_, slot) => normalizeDerrick(list[slot]));
}

export function getDerrickStatus(derrick, now = Date.now()) {
  const current = normalizeDerrick(derrick);
  if (!current) return null;
  const spec = OIL_LEVELS[current.level];
  const upgrading = current.upgradeUntil > now;
  const producingSince = Math.max(current.collectedAt, current.upgradeUntil);
  const stored = upgrading ? 0 : Math.min(spec.capacity, Math.floor(Math.max(0, now - producingSince) / 60_000 * spec.ratePerMinute));
  const next = OIL_LEVELS[current.level + 1] ?? null;
  return {
    level: current.level,
    // Durante a obra o poco ja guarda o nivel novo, mas so passa a bombear quando ela termina.
    activeLevel: upgrading ? current.level - 1 : current.level,
    upgrading,
    building: upgrading && current.level === 1,
    upgradeRemainingMs: upgrading ? current.upgradeUntil - now : 0,
    upgradeProgress: upgrading ? 1 - (current.upgradeUntil - now) / spec.buildMs : 1,
    ratePerMinute: spec.ratePerMinute,
    capacity: spec.capacity,
    stored,
    full: stored >= spec.capacity,
    ready: stored >= OIL_COLLECT_THRESHOLD,
    next: !upgrading && next ? { level: current.level + 1, ...next } : null,
  };
}

function withField(state, field, extra) {
  return { ...state, oil_derricks: field, ...extra };
}

export function getDerrickBuildCost(state) {
  const built = normalizeOilField(state?.oil_derricks).filter(Boolean).length;
  return OIL_BUILD_COSTS[built] ?? null;
}

export function buildOilDerrick(state, slot, now = Date.now()) {
  const field = normalizeOilField(state?.oil_derricks);
  const cost = getDerrickBuildCost(state);
  if (!state?.is_wasteland || !Number.isInteger(slot) || slot < 0 || slot >= OIL_DERRICK_SLOTS || field[slot]) {
    return { ...state, notice: 'Local de perfuração indisponível.' };
  }
  if (cost === null || (Number(state.scrap) || 0) < cost) return { ...state, notice: `Sucata insuficiente: o poço custa ${cost ?? '—'} sucatas.` };
  field[slot] = { level: 1, collectedAt: now, upgradeUntil: now + OIL_LEVELS[1].buildMs };
  return withField(state, field, { scrap: state.scrap - cost, notice: 'Sonda de petróleo em montagem na superfície.' });
}

export function collectOil(state, slot, now = Date.now()) {
  const field = normalizeOilField(state?.oil_derricks);
  const status = getDerrickStatus(field[slot], now);
  if (!status || status.stored <= 0) return state;
  field[slot] = { ...field[slot], collectedAt: now };
  return withField(state, field, { oil: (Number(state.oil) || 0) + status.stored, notice: `+${status.stored} barris de petróleo recolhidos.` });
}

export function upgradeOilDerrick(state, slot, now = Date.now()) {
  const field = normalizeOilField(state?.oil_derricks);
  const status = getDerrickStatus(field[slot], now);
  if (!status?.next) return { ...state, notice: status?.upgrading ? 'O poço já está em obras.' : 'O poço já está no nível máximo.' };
  const { scrap, oil, level, buildMs } = status.next;
  // O que ja estava no tanque e recolhido antes de a obra comecar, como no Clash.
  const collected = status.stored;
  const oilAvailable = (Number(state.oil) || 0) + collected;
  if ((Number(state.scrap) || 0) < scrap || oilAvailable < oil) {
    return { ...state, notice: `Recursos insuficientes: nível ${level} pede ${scrap} sucatas${oil ? ` e ${oil} barris` : ''}.` };
  }
  field[slot] = { level, collectedAt: now, upgradeUntil: now + buildMs };
  return withField(state, field, { scrap: state.scrap - scrap, oil: oilAvailable - oil,
    notice: `Poço de petróleo subindo para o nível ${level}.` });
}

export function formatDuration(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return seconds % 60 ? `${minutes}min ${seconds % 60}s` : `${minutes}min`;
}
