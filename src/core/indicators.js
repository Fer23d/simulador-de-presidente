// Historico mensal dos indicadores do pais (ultimos 60 meses) para os graficos da aba Indicadores.
export const INDICATOR_HISTORY_LIMIT = 60;
export const INDICATOR_KEYS = Object.freeze(['gdp', 'unemployment', 'cash', 'approval']);

function numbers(list) {
  return Array.isArray(list) ? list.map(Number).filter(Number.isFinite) : [];
}

export function normalizeIndicatorHistory(value, fallback = {}) {
  const result = {};
  for (const key of INDICATOR_KEYS) {
    const points = numbers(value?.[key]);
    if (!points.length && Number.isFinite(Number(fallback[key]))) points.push(Number(fallback[key]));
    result[key] = points.slice(-INDICATOR_HISTORY_LIMIT);
  }
  return result;
}

export function snapshotIndicators(economy, approval) {
  return {
    gdp: Number(economy?.gdp) || 0,
    unemployment: Number(economy?.unemployment) || 0,
    cash: Number(economy?.cash) || 0,
    approval: Number.isFinite(Number(approval)) ? Number(approval) : 50,
  };
}

export function recordIndicators(history, economy, approval) {
  const point = snapshotIndicators(economy, approval);
  const current = normalizeIndicatorHistory(history, point);
  return Object.fromEntries(INDICATOR_KEYS.map((key) => [key, [...current[key], point[key]].slice(-INDICATOR_HISTORY_LIMIT)]));
}
