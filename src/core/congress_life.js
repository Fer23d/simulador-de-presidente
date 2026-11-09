// Congresso vivo: a lealdade de cada bancada oscila com o governo, bancadas cobram favores e a oposicao propoe projetos.
// Tudo isso so existe em democracia. Os projetos da oposicao nao travam o mes: se ignorados, viram lei por decurso de prazo.
import { adjustFactions, getFactionSupport } from './factions.js';

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const BLOC_IDS = Object.freeze(['left', 'center', 'right', 'nationalist']);

export const DEMAND_DEADLINE_MONTHS = 3;
export const BILL_DEADLINE_MONTHS = 2;

export const OPPOSITION_BILLS = Object.freeze({
  wealth_tax: Object.freeze({
    id: 'wealth_tax', title: 'Imposto sobre grandes fortunas', author: 'left',
    text: 'A esquerda quer taxar as maiores fortunas do país para financiar programas sociais.',
    sanction: 'Sancionar: entra caixa e os trabalhadores aplaudem, mas a elite reage.',
    veto: 'Vetar: a esquerda se revolta e os trabalhadores se frustram.',
  }),
  minimum_wage: Object.freeze({
    id: 'minimum_wage', title: 'Aumento do salário mínimo', author: 'left',
    text: 'Um reajuste acima da inflação para recompor o poder de compra dos trabalhadores.',
    sanction: 'Sancionar: mais renda, porém o desemprego e a inflação sobem um pouco.',
    veto: 'Vetar: a esquerda e os trabalhadores se queixam.',
  }),
  spending_cap: Object.freeze({
    id: 'spending_cap', title: 'Teto de gastos públicos', author: 'right',
    text: 'A direita quer travar o crescimento da despesa para conter a dívida.',
    sanction: 'Sancionar: o caixa respira e a elite gosta, mas as ruas esquentam.',
    veto: 'Vetar: a direita e a elite se irritam.',
  }),
  cpi: Object.freeze({
    id: 'cpi', title: 'CPI do Caixa 2', author: 'center',
    text: 'Os deputados querem investigar desvios e contas escondidas do governo.',
    sanction: 'Deixar investigar: o caixa 2 é confiscado e o rombo diminui, mas o escândalo desgasta.',
    veto: 'Barrar a CPI: todas as bancadas se ressentem e as ruas esquentam.',
  }),
});

export function createCongressLife() {
  return { demand: null, bill: null, lastBillMonth: -99 };
}

export function normalizeCongressLife(value) {
  const base = createCongressLife();
  if (!value || typeof value !== 'object') return base;
  const demand = value.demand && BLOC_IDS.includes(value.demand.blocId)
    ? { blocId: value.demand.blocId, cost: Math.max(0, Number(value.demand.cost) || 0), deadline: Math.floor(Number(value.demand.deadline) || 0) }
    : null;
  const bill = value.bill && OPPOSITION_BILLS[value.bill.id]
    ? { id: value.bill.id, deadline: Math.floor(Number(value.bill.deadline) || 0) }
    : null;
  return { demand, bill, lastBillMonth: Number.isFinite(Number(value.lastBillMonth)) ? Number(value.lastBillMonth) : base.lastBillMonth };
}

export function getBlocLoyalty(bloc) {
  return Number.isFinite(Number(bloc?.loyalty)) ? clamp(Number(bloc.loyalty), 0, 100) : 50;
}

function isDemocracy(state) {
  return state.regime?.type === 'democracy' && !state.regime?.gameOver && !state.is_wasteland && !state.city;
}

// Para onde a lealdade de cada bancada tende, conforme o que o governo faz.
function loyaltyTarget(state, blocId) {
  const approval = getFactionSupport(state.factions);
  const budget = state.budget ?? {};
  const inflation = Number(state.economy?.inflation) || 0;
  const unemployment = Number(state.economy?.unemployment) || 0;
  const base = 50 + ((approval - 50) * 0.5);
  const economy = -(Math.max(0, inflation - 0.06) * 100 * 0.8) - (Math.max(0, unemployment - 0.09) * 100 * 0.6);
  const tax = (Number(budget.incomeTaxRate) || 0) + (Number(budget.vatRate) || 0);
  const bias = {
    left: ((Number(budget.socialSpend) || 0) - 0.05) * 160 - ((tax - 0.28) * 20),
    center: -Math.abs(tax - 0.28) * 20,
    right: -((tax - 0.28) * 90) + (((Number(budget.defenseSpend) || 0) - 0.035) * 40),
    nationalist: ((Number(budget.defenseSpend) || 0) - 0.035) * 160 + ((Number(budget.securitySpend) || 0) - 0.025) * 60,
  }[blocId] ?? 0;
  return clamp(base + economy + bias, 5, 95);
}

function hash(month, salt) {
  return ((Math.imul(month * 7919 + salt, 2654435761) >>> 0) % 1000) / 1000;
}

// Fim de mes: lealdade, prazo dos favores e projetos, e novos pedidos.
export function processCongressLife(state) {
  if (!isDemocracy(state) || !state.congress?.blocs) return state;
  const month = Number(state.monthCounter) || 0;
  const life = normalizeCongressLife(state.congressLife);
  let congress = {
    ...state.congress,
    blocs: state.congress.blocs.map((bloc) => {
      const loyalty = getBlocLoyalty(bloc);
      return { ...bloc, loyalty: clamp(loyalty + ((loyaltyTarget(state, bloc.id) - loyalty) * 0.18), 0, 100) };
    }),
  };
  let next = { ...state, congress, congressLife: life };
  // Prazo vencido: favor ignorado conta como recusa; projeto ignorado vira lei por decurso de prazo.
  if (life.demand && month >= life.demand.deadline) {
    next = respondToDemand(next, false, true);
  }
  if (next.congressLife.bill && month >= next.congressLife.bill.deadline) {
    next = respondToBill(next, 'sanction', true);
  }
  const current = normalizeCongressLife(next.congressLife);
  if (!current.demand && hash(month, 11) < 0.16) {
    const candidates = next.congress.blocs.filter((bloc) => getBlocLoyalty(bloc) < 60);
    if (candidates.length) {
      const bloc = candidates[Math.floor(hash(month, 29) * candidates.length) % candidates.length];
      const demand = { blocId: bloc.id, cost: Math.round(bloc.negotiationCost * 0.6), deadline: month + DEMAND_DEADLINE_MONTHS };
      next = {
        ...next,
        congressLife: { ...current, demand },
        notice: `A bancada ${bloc.label} cobra um favor do governo. Responda no Congresso.`,
      };
    }
  }
  const latest = normalizeCongressLife(next.congressLife);
  if (!latest.bill && month - latest.lastBillMonth >= 4 && hash(month, 53) < 0.12) {
    const eligible = Object.values(OPPOSITION_BILLS).filter((bill) => bill.id !== 'cpi' || (Number(next.slush_fund) > 0 || Number(next.economy?.fiscalHole) > 0));
    const bill = eligible[Math.floor(hash(month, 71) * eligible.length) % eligible.length];
    next = {
      ...next,
      congressLife: { ...latest, bill: { id: bill.id, deadline: month + BILL_DEADLINE_MONTHS }, lastBillMonth: month },
      notice: `A oposição apresentou um projeto: ${bill.title}. Sancione ou vete no Congresso.`,
    };
  }
  return next;
}

function setLoyalty(congress, blocId, delta) {
  return { ...congress, blocs: congress.blocs.map((bloc) => (bloc.id === blocId ? { ...bloc, loyalty: clamp(getBlocLoyalty(bloc) + delta, 0, 100) } : bloc)) };
}

function setAllLoyalty(congress, delta) {
  return { ...congress, blocs: congress.blocs.map((bloc) => ({ ...bloc, loyalty: clamp(getBlocLoyalty(bloc) + delta, 0, 100) })) };
}

export function respondToDemand(state, accept, expired = false) {
  const life = normalizeCongressLife(state.congressLife);
  if (!life.demand) return { ...state, notice: 'Nenhuma bancada cobra favores agora.' };
  const { blocId, cost } = life.demand;
  const label = state.congress.blocs.find((bloc) => bloc.id === blocId)?.label ?? blocId;
  const cleared = { ...life, demand: null };
  if (accept) {
    if ((Number(state.economy.cash) || 0) < cost && !expired) {
      // Sem caixa o favor ainda pode ser concedido, mas vira divida (caixa negativo).
    }
    return {
      ...state,
      congressLife: cleared,
      congress: setLoyalty(state.congress, blocId, 15),
      economy: { ...state.economy, cash: state.economy.cash - cost },
      notice: `O favor foi concedido: a bancada ${label} ficou mais leal ao governo.`,
    };
  }
  return {
    ...state,
    congressLife: cleared,
    congress: setLoyalty(state.congress, blocId, expired ? -17 : -12),
    notice: expired
      ? `O pedido da bancada ${label} ficou sem resposta e ela se sentiu desprezada.`
      : `O pedido foi recusado: a bancada ${label} ficou mais distante.`,
  };
}

export function respondToBill(state, action, expired = false) {
  const life = normalizeCongressLife(state.congressLife);
  const bill = life.bill ? OPPOSITION_BILLS[life.bill.id] : null;
  if (!bill) return { ...state, notice: 'Nenhum projeto da oposição aguarda decisão.' };
  const sanction = action === 'sanction';
  const cleared = { ...life, bill: null };
  const gdp = Number(state.economy.gdp) || 0;
  let next = { ...state, congressLife: cleared };
  if (bill.id === 'wealth_tax') {
    next = sanction
      ? { ...next, economy: { ...next.economy, cash: next.economy.cash + Math.round(gdp * 0.012) }, factions: adjustFactions(next.factions, { trabalhadores: 5, elite: -6 }) }
      : { ...next, congress: setLoyalty(next.congress, 'left', -10), factions: adjustFactions(next.factions, { trabalhadores: -3 }) };
  } else if (bill.id === 'minimum_wage') {
    next = sanction
      ? { ...next, economy: { ...next.economy, inflation: clamp(next.economy.inflation + 0.003, 0, 0.8), unemployment: clamp(next.economy.unemployment + 0.004, 0.02, 0.45) }, factions: adjustFactions(next.factions, { trabalhadores: 6 }) }
      : { ...next, congress: setLoyalty(next.congress, 'left', -10), factions: adjustFactions(next.factions, { trabalhadores: -4 }) };
  } else if (bill.id === 'spending_cap') {
    next = sanction
      ? { ...next, economy: { ...next.economy, cash: next.economy.cash + Math.round(gdp * 0.01) }, factions: adjustFactions(next.factions, { elite: 4 }), regime: { ...next.regime, unrest: clamp((Number(next.regime?.unrest) || 0) + 4, 0, 100) } }
      : { ...next, congress: setLoyalty(next.congress, 'right', -10), factions: adjustFactions(next.factions, { elite: -3 }) };
  } else {
    next = sanction
      ? { ...next, slush_fund: 0, economy: { ...next.economy, fiscalHole: Math.round((Number(next.economy.fiscalHole) || 0) * 0.5) }, factions: adjustFactions(next.factions, { trabalhadores: -3, elite: -3, militares: -2, religiosos: -3 }) }
      : { ...next, congress: setAllLoyalty(next.congress, -8), regime: { ...next.regime, unrest: clamp((Number(next.regime?.unrest) || 0) + 6, 0, 100) } };
  }
  const prefix = expired ? 'O prazo passou e o projeto virou lei sem veto' : (sanction ? 'Projeto sancionado' : 'Projeto vetado');
  return { ...next, notice: `${prefix}: ${bill.title}.` };
}
