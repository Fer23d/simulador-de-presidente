// Metas do ano e relatorio de fim de ano (modo Presidente): o gabinete fixa 4 metas em janeiro e, no ano seguinte,
// apresenta o balanco, a nota e uma recomendacao. Tudo e calculado a partir do estado: nenhum evento precisa ser registrado.
import { adjustFactions, getFactionSupport } from './factions.js';
import { getPublicDebt } from './economy.js';

export const YEAR_REPORT_LIMIT = 8;
export const GOAL_IDS = Object.freeze(['inflation', 'unemployment', 'fiscal', 'approval']);

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const pct = (value, digits = 1) => `${(value * 100).toFixed(digits).replace('.', ',')}%`;

function lawsApproved(state) {
  return Object.values(state.laws ?? {}).filter((law) => law?.approved === true).length;
}

function warsActive(state) {
  return (state.geopolitics?.contacts ?? []).filter((contact) => contact.atWar && !contact.destruido && !contact.anexado).length;
}

export function createYearSnapshot(state) {
  const gdp = Math.max(1, Number(state.economy?.gdp) || 1);
  return {
    year: Number(state.calendar?.year) || 2026,
    monthCounter: Number(state.monthCounter) || 0,
    gdp,
    inflation: Number(state.economy?.inflation) || 0,
    unemployment: Number(state.economy?.unemployment) || 0,
    cash: Number(state.economy?.cash) || 0,
    debtRatio: getPublicDebt(state.economy ?? {}) / gdp,
    approval: getFactionSupport(state.factions),
    unrest: Number(state.regime?.unrest) || 0,
    laws: lawsApproved(state),
    wars: warsActive(state),
  };
}

// As metas partem de onde o pais esta: quem tem inflacao alta precisa baixar, quem esta bem precisa manter.
export function createYearGoals(state) {
  const snapshot = createYearSnapshot(state);
  const inflationTarget = snapshot.inflation > 0.06 ? Math.max(0.04, snapshot.inflation * 0.85) : 0.05;
  const unemploymentTarget = snapshot.unemployment > 0.08 ? Math.max(0.06, snapshot.unemployment - 0.01) : 0.08;
  const fiscalTarget = snapshot.cash < 0 ? snapshot.debtRatio : 0;
  const approvalTarget = clamp(Math.max(50, snapshot.approval), 50, 85);
  return {
    year: snapshot.year,
    snapshot,
    items: [
      { id: 'inflation', label: `Inflação mensal abaixo de ${pct(inflationTarget)}`, target: inflationTarget },
      { id: 'unemployment', label: `Desemprego abaixo de ${pct(unemploymentTarget)}`, target: unemploymentTarget },
      { id: 'fiscal', label: snapshot.cash < 0 ? 'Não aumentar a dívida em relação ao PIB' : 'Fechar o ano com o caixa positivo', target: fiscalTarget },
      { id: 'approval', label: `Apoio interno de ${approvalTarget.toFixed(0)}% ou mais`, target: approvalTarget },
    ],
  };
}

export function normalizeYearGoals(value, state) {
  const fallback = createYearGoals(state);
  if (!value || typeof value !== 'object' || !value.snapshot || !Array.isArray(value.items)) return fallback;
  const items = GOAL_IDS.map((id) => {
    const found = value.items.find((item) => item?.id === id);
    const base = fallback.items.find((item) => item.id === id);
    return found && Number.isFinite(Number(found.target)) && typeof found.label === 'string'
      ? { id, label: found.label.slice(0, 120), target: Number(found.target) }
      : base;
  });
  return { year: Number(value.year) || fallback.year, snapshot: { ...fallback.snapshot, ...value.snapshot }, items };
}

// Valor atual de cada meta e se ela esta cumprida neste momento.
export function evaluateGoals(state, goals) {
  const now = createYearSnapshot(state);
  const gdpDebt = now.debtRatio;
  return goals.items.map((item) => {
    let value;
    let met;
    if (item.id === 'inflation') { value = now.inflation; met = value <= item.target; }
    else if (item.id === 'unemployment') { value = now.unemployment; met = value <= item.target; }
    else if (item.id === 'fiscal') {
      // Meta de divida compara a razao divida/PIB; meta de caixa positivo compara o saldo em dinheiro.
      value = item.target > 0 ? gdpDebt : now.cash;
      met = item.target > 0 ? gdpDebt <= item.target + 1e-9 : now.cash >= 0;
    } else { value = now.approval; met = value >= item.target; }
    return { ...item, value, met };
  });
}

const GRADES = Object.freeze(['D', 'C', 'B', 'A', 'A+']);

export function getRecommendation(state) {
  const now = createYearSnapshot(state);
  if ((Number(state.regime?.unrest) || 0) >= 60) return 'A tensão social está perto do limite: use subsídio, diálogo ou, em último caso, repressão, antes que os quartéis se mexam.';
  if (now.inflation > 0.08) return 'A inflação está alta: suba a taxa básica de juros e segure o déficit antes que os trabalhadores se desgastem.';
  if (now.debtRatio > 1.2) return 'A dívida pesa mais que o PIB e o rating cai: corte despesas ou suba impostos para fechar o déficit.';
  if (now.unemployment > 0.1) return 'O desemprego está alto: invista em infraestrutura e educação e evite juros muito altos.';
  if (now.approval < 45) return 'O apoio interno está baixo: aproxime-se dos trabalhadores e cuide da base no Congresso antes da eleição.';
  return 'Os números estão sob controle: mantenha o rumo e guarde folga fiscal para as crises.';
}

export function buildYearReport(state) {
  const goals = normalizeYearGoals(state.yearGoals, state);
  const evaluated = evaluateGoals(state, goals);
  const now = createYearSnapshot(state);
  const start = goals.snapshot;
  const met = evaluated.filter((item) => item.met).length;
  const months = Math.max(1, now.monthCounter - start.monthCounter);
  return {
    year: goals.year,
    months,
    grade: GRADES[clamp(met, 0, 4)],
    met,
    total: evaluated.length,
    goals: evaluated.map(({ id, label, target, value, met: ok }) => ({ id, label, target, value, met: ok })),
    figures: {
      gdpGrowth: now.gdp / Math.max(1, start.gdp) - 1,
      inflation: now.inflation,
      unemployment: now.unemployment,
      cashChange: now.cash - start.cash,
      approvalChange: now.approval - start.approval,
      unrest: now.unrest,
      lawsPassed: Math.max(0, now.laws - start.laws),
      newWars: Math.max(0, now.wars - start.wars),
    },
    recommendation: getRecommendation(state),
  };
}

export function normalizeYearReports(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((report) => report && Number.isFinite(Number(report.year)) && typeof report.grade === 'string' && Array.isArray(report.goals) && report.figures)
    .slice(-YEAR_REPORT_LIMIT);
}

// Chamado no fim de cada mes: em janeiro fecha o ano que passou, aplica o efeito politico das metas e abre o proximo ano.
export function processYearEnd(state) {
  if (state.is_wasteland || state.city || state.regime?.gameOver) return state;
  if (Number(state.calendar?.month) !== 1 || (Number(state.monthCounter) || 0) < 1) return state;
  const goals = normalizeYearGoals(state.yearGoals, state);
  if (goals.year === Number(state.calendar.year)) return state;
  const report = buildYearReport(state);
  const effect = report.met >= 3 ? 2 : report.met <= 1 ? -2 : 0;
  const factions = effect ? adjustFactions(state.factions, { trabalhadores: effect, elite: effect }) : state.factions;
  const text = `Relatório de ${report.year}: nota ${report.grade}, ${report.met} de ${report.total} metas cumpridas.`;
  return {
    ...state,
    factions,
    yearReports: [...normalizeYearReports(state.yearReports), report].slice(-YEAR_REPORT_LIMIT),
    yearGoals: createYearGoals({ ...state, factions }),
    news: [{ text, calendar: { ...state.calendar } }, ...(state.news ?? [])].slice(0, 5),
    notice: `${text} Veja os detalhes na Visão geral.`,
  };
}
