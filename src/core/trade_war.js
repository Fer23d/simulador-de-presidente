// Guerra comercial: um grande parceiro impoe tarifas e o pais precisa escolher como reagir.
// Ha duas camadas: o dano mensal da guerra (PIB, emprego, inflacao e setores) e as respostas do jogador
// (retaliar, negociar, diversificar mercados, subsidiar setores, recorrer a ONU). A diversificacao de mercados
// e permanente e funciona como seguro: quem investe antes sofre menos quando a guerra comeca.
import { adjustFactions } from './factions.js';
import { getTitleModifier } from './identity.js';
import { SECTOR_IDS, normalizeSectors } from './sectors.js';

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export const TRADE_WAR_FIRST_MONTH = 8;
export const TRADE_WAR_COOLDOWN_MONTHS = 10;
export const TRADE_WAR_MAX_TARIFF = 50;
export const DIVERSIFY_COST_RATE = 0.004;
export const DIVERSIFY_STEP = 15;
export const DIVERSIFY_CAP = 80;
export const SUBSIDY_COST_RATE = 0.0012;
export const NEGOTIATE_COOLDOWN = 3;
export const APPEAL_COOLDOWN = 4;
export const CONCESSIONS = Object.freeze({
  market: Object.freeze({ id: 'market', label: 'Abrir o mercado', detail: 'Sem custo em caixa. A elite aprova e os trabalhadores reclamam.', bonus: 0.05 }),
  cash: Object.freeze({ id: 'cash', label: 'Pagar compensação', detail: 'Custa 0,6% do PIB. Chance maior de acordo.', bonus: 0.1 }),
});

export function createTradeWar() {
  return { active: null, lastEndMonth: -99, diversification: 0, totalLoss: 0, history: [] };
}

const OUTCOMES = Object.freeze(['acordo', 'cansaco', 'cancelada']);

function normalizeActive(value) {
  if (!value || typeof value.aggressorId !== 'string') return null;
  const num = (key, fallback) => (Number.isFinite(Number(value[key])) ? Number(value[key]) : fallback);
  const sectors = Array.isArray(value.hitSectors) ? value.hitSectors.filter((id) => SECTOR_IDS.includes(id)).slice(0, 2) : [];
  return {
    aggressorId: value.aggressorId,
    startMonth: Math.floor(num('startMonth', 0)),
    tariff: clamp(num('tariff', 15), 1, TRADE_WAR_MAX_TARIFF),
    weight: clamp(num('weight', 0.6), 0.4, 1),
    hitSectors: sectors.length ? sectors : ['industry', 'agro'],
    retaliated: Boolean(value.retaliated),
    subsidy: Boolean(value.subsidy),
    suspendedTreaty: Boolean(value.suspendedTreaty),
    lastNegotiateMonth: Math.floor(num('lastNegotiateMonth', -99)),
    lastAppealMonth: Math.floor(num('lastAppealMonth', -99)),
    lastDiversifyMonth: Math.floor(num('lastDiversifyMonth', -99)),
    loss: Math.max(0, num('loss', 0)),
  };
}

export function normalizeTradeWar(value) {
  const base = createTradeWar();
  if (!value || typeof value !== 'object') return base;
  const history = Array.isArray(value.history)
    ? value.history.filter((item) => typeof item?.aggressorId === 'string' && OUTCOMES.includes(item.outcome)).slice(-5)
      .map((item) => ({ aggressorId: item.aggressorId, startMonth: Math.floor(Number(item.startMonth) || 0), endMonth: Math.floor(Number(item.endMonth) || 0), outcome: item.outcome, loss: Math.max(0, Number(item.loss) || 0) }))
    : [];
  return {
    active: normalizeActive(value.active),
    lastEndMonth: Number.isFinite(Number(value.lastEndMonth)) ? Number(value.lastEndMonth) : base.lastEndMonth,
    diversification: clamp(Number(value.diversification) || 0, 0, DIVERSIFY_CAP),
    totalLoss: Math.max(0, Number(value.totalLoss) || 0),
    history,
  };
}

function isActiveGame(state) {
  return !state.regime?.gameOver && !state.is_wasteland && !state.city && Boolean(state.geopolitics?.contacts);
}

function hash(month, salt, state = null) {
  const extra = state ? [...String(state.country?.id ?? '')].reduce((sum, char) => sum + char.charCodeAt(0), 0) * 131 : 0;
  return ((Math.imul(month * 7919 + salt + extra, 2654435761) >>> 0) % 1000) / 1000;
}

const findContact = (state, id) => (state.geopolitics?.contacts ?? []).find((contact) => contact.id === id);
const setContact = (state, id, patch) => ({ ...state, geopolitics: { ...state.geopolitics, contacts: state.geopolitics.contacts.map((contact) => (contact.id === id ? { ...contact, ...(typeof patch === 'function' ? patch(contact) : patch) } : contact)) } });

function contactName(state, id) {
  return findContact(state, id)?.name ?? id;
}

// Parceiros capazes de impor tarifas: as 15 maiores economias vivas, fora de guerra e fora da alianca.
function candidates(state) {
  const alive = state.geopolitics.contacts.filter((contact) => !contact.destruido && !contact.anexado && !contact.wasteland && !contact.atWar && !contact.alliance && !contact.puppet);
  const top = [...alive].sort((a, b) => (Number(b.pib_base) || 0) - (Number(a.pib_base) || 0)).slice(0, 15);
  const maxPib = Math.max(1, Number(top[0]?.pib_base) || 1);
  return top.map((contact) => {
    const relation = Number(contact.relation) || 0;
    const base = clamp(1 - (relation / 150), 0.3, 1.7);
    return { contact, weight: clamp(0.4 + ((Number(contact.pib_base) || 0) / maxPib) * 0.6, 0.4, 1), pick: base * (contact.tradeTreaty ? 0.4 : 1) };
  });
}

// Chance mensal de um parceiro impor tarifas: sobe com sancoes, recusas a AIEA e a bomba, cai com diversificacao.
export function getTradeWarRisk(state) {
  const tw = normalizeTradeWar(state.tradeWar);
  const month = Number(state.monthCounter) || 0;
  if (tw.active || month < TRADE_WAR_FIRST_MONTH || month - tw.lastEndMonth < TRADE_WAR_COOLDOWN_MONTHS) return 0;
  let chance = 0.06;
  if (state.geopolitics?.internationalSanctions) chance += 0.04;
  chance += (Number(state.geopolitics?.sanctionSeverity) || 0) * 0.03;
  chance += (Number(state.diplomacyLife?.inspectionRefusals) || 0) * 0.02;
  if (state.military?.nuclear?.bombBuilt) chance += 0.03;
  if ((Number(state.geopolitics?.onuScore) || 50) < 30) chance += 0.02;
  chance *= 1 - (tw.diversification / 100) * 0.5;
  chance *= getTitleModifier(state, 'tradeWarRisk');
  return clamp(chance, 0, 0.16);
}

export function describeRisk(chance) {
  if (chance <= 0) return 'indisponível agora';
  if (chance < 0.04) return 'baixo';
  if (chance < 0.08) return 'médio';
  return 'alto';
}

// Quanto o PIB perde por mes: tarifa x peso do parceiro, abrandado por diversificacao, subsidio e retaliacao.
export function getTradeWarMitigation(state) {
  const tw = normalizeTradeWar(state.tradeWar);
  const active = tw.active;
  if (!active) return 1;
  let factor = 1 - ((tw.diversification / 100) * 0.55);
  if (active.subsidy) factor *= 0.7;
  if (active.retaliated) factor *= 0.88;
  return clamp(factor, 0.2, 1);
}

export function getMonthlyTradeWarLoss(state) {
  const active = normalizeTradeWar(state.tradeWar).active;
  if (!active) return 0;
  const gdp = Number(state.economy?.gdp) || 0;
  const hit = 0.004 * (active.tariff / 25) * active.weight * getTradeWarMitigation(state);
  return Math.round(gdp * hit);
}

function negotiationStanding(state) {
  const contacts = (state.geopolitics?.contacts ?? []).filter((contact) => !contact.destruido && !contact.anexado);
  const relation = contacts.length ? contacts.reduce((sum, contact) => sum + (Number(contact.relation) || 0), 0) / contacts.length : 0;
  return clamp(((Number(state.geopolitics?.onuScore) || 0) / 100) * 0.55 + (((relation + 100) / 200) * 0.45), 0, 1);
}

export function getNegotiationChance(state, concession = 'market') {
  const active = normalizeTradeWar(state.tradeWar).active;
  if (!active) return 0;
  const contact = findContact(state, active.aggressorId);
  const bonus = CONCESSIONS[concession]?.bonus ?? 0;
  return clamp(0.22 + negotiationStanding(state) * 0.45 + ((Number(contact?.relation) || 0) / 400) + bonus - (active.retaliated ? 0.15 : 0), 0.08, 0.88);
}

export function getAppealChance(state) {
  const active = normalizeTradeWar(state.tradeWar).active;
  if (!active) return 0;
  return clamp(0.12 + ((Number(state.geopolitics?.onuScore) || 0) / 100) * 0.6 - (active.retaliated ? 0.15 : 0), 0.05, 0.8);
}

export function getTradeWarActionStatus(state, kind) {
  const tw = normalizeTradeWar(state.tradeWar);
  const month = Number(state.monthCounter) || 0;
  const gdp = Number(state.economy?.gdp) || 0;
  if (!isActiveGame(state)) return { available: false, reason: 'Indisponível.' };
  if (kind === 'diversify') {
    if (tw.diversification >= DIVERSIFY_CAP) return { available: false, reason: 'Mercados já bem diversificados.' };
    if (tw.active && month - tw.active.lastDiversifyMonth < 1) return { available: false, reason: 'Já investiu neste mês.' };
    return { available: true, reason: '', cost: Math.round(gdp * DIVERSIFY_COST_RATE) };
  }
  const active = tw.active;
  if (!active) return { available: false, reason: 'Não há guerra comercial em curso.' };
  if (kind === 'retaliate') return active.retaliated ? { available: false, reason: 'Já retaliou nesta guerra.' } : { available: true, reason: '' };
  if (kind === 'subsidy') return { available: true, reason: '', cost: Math.round(gdp * SUBSIDY_COST_RATE) };
  if (kind === 'negotiate') {
    const wait = NEGOTIATE_COOLDOWN - (month - active.lastNegotiateMonth);
    return wait > 0 ? { available: false, reason: `Nova rodada em ${wait} mês(es).` } : { available: true, reason: '' };
  }
  if (kind === 'appeal') {
    if ((Number(state.geopolitics?.onuScore) || 0) < 20) return { available: false, reason: 'Reputação na ONU abaixo de 20.' };
    const wait = APPEAL_COOLDOWN - (month - active.lastAppealMonth);
    return wait > 0 ? { available: false, reason: `Novo recurso em ${wait} mês(es).` } : { available: true, reason: '' };
  }
  return { available: false, reason: 'Ação desconhecida.' };
}

function endWar(state, outcome, message) {
  const tw = normalizeTradeWar(state.tradeWar);
  const active = tw.active;
  if (!active) return state;
  const month = Number(state.monthCounter) || 0;
  let next = state;
  const restore = active.suspendedTreaty && outcome !== 'cancelada' && findContact(state, active.aggressorId) && !findContact(state, active.aggressorId).destruido;
  if (restore) next = setContact(next, active.aggressorId, (contact) => ({ tradeTreaty: true, relation: clamp((Number(contact.relation) || 0) + 4, -100, 100) }));
  const entry = { aggressorId: active.aggressorId, startMonth: active.startMonth, endMonth: month, outcome, loss: active.loss };
  return {
    ...next,
    tradeWar: { ...tw, active: null, lastEndMonth: month, history: [...tw.history, entry].slice(-5) },
    notice: message,
  };
}

// Reduz a tarifa; se chega a zero, a guerra termina em acordo. Tambem usada pelas cupulas.
export function easeTradeWar(state, points, reason = 'Acordo') {
  const tw = normalizeTradeWar(state.tradeWar);
  if (!tw.active) return state;
  const tariff = tw.active.tariff - points;
  const name = contactName(state, tw.active.aggressorId);
  if (tariff <= 0) return endWar(state, 'acordo', `${reason}: ${name} retirou as tarifas e a guerra comercial acabou.`);
  return { ...state, tradeWar: { ...tw, active: { ...tw.active, tariff } }, notice: `${reason}: a tarifa de ${name} caiu para ${tariff}%.` };
}

export function startTradeWar(state, aggressorId, tariff, weight, hitSectors) {
  const month = Number(state.monthCounter) || 0;
  const contact = findContact(state, aggressorId);
  if (!contact) return state;
  const tw = normalizeTradeWar(state.tradeWar);
  let next = setContact(state, aggressorId, { tradeTreaty: false });
  next = {
    ...next,
    tradeWar: { ...tw, active: normalizeActive({ aggressorId, startMonth: month, tariff, weight, hitSectors, suspendedTreaty: Boolean(contact.tradeTreaty), lastNegotiateMonth: month - NEGOTIATE_COOLDOWN }) },
    notice: `${contact.name} impôs tarifas de ${tariff}% sobre suas exportações. Reaja na aba Diplomacia.`,
  };
  return next;
}

export function applyTradeWarAction(state, kind, option) {
  const status = getTradeWarActionStatus(state, kind);
  if (!status.available) return { ...state, notice: status.reason || 'Ação indisponível.' };
  const tw = normalizeTradeWar(state.tradeWar);
  const month = Number(state.monthCounter) || 0;
  const gdp = Number(state.economy?.gdp) || 0;
  if (kind === 'diversify') {
    const cost = status.cost;
    return {
      ...state,
      economy: { ...state.economy, cash: state.economy.cash - cost },
      tradeWar: { ...tw, diversification: clamp(tw.diversification + DIVERSIFY_STEP, 0, DIVERSIFY_CAP), active: tw.active ? { ...tw.active, lastDiversifyMonth: month } : null },
      notice: 'Novos mercados abertos: o país depende menos de um único comprador.',
    };
  }
  const active = tw.active;
  const name = contactName(state, active.aggressorId);
  if (kind === 'retaliate') {
    const next = setContact(state, active.aggressorId, (contact) => ({ relation: clamp((Number(contact.relation) || 0) - 10, -100, 100) }));
    return {
      ...next,
      tradeWar: { ...tw, active: { ...active, retaliated: true } },
      factions: adjustFactions(next.factions, { militares: 1, elite: -1 }),
      notice: `Você retaliou contra ${name}. Entram receitas de tarifas, mas os preços sobem e a disputa tende a escalar a cada 3 meses.`,
    };
  }
  if (kind === 'subsidy') {
    const on = !active.subsidy;
    return {
      ...state,
      tradeWar: { ...tw, active: { ...active, subsidy: on } },
      notice: on ? 'Subsídio aos setores atingidos ligado: o dano cai 30%, e o caixa paga a conta todo mês.' : 'Subsídio aos setores atingidos desligado.',
    };
  }
  if (kind === 'negotiate') {
    const concession = CONCESSIONS[option] ? option : 'market';
    const chance = getNegotiationChance(state, concession);
    const cost = concession === 'cash' ? Math.round(gdp * 0.006) : 0;
    let next = {
      ...state,
      economy: { ...state.economy, cash: state.economy.cash - cost },
      factions: concession === 'market' ? adjustFactions(state.factions, { elite: 3, trabalhadores: -3 }) : state.factions,
    };
    const roll = hash(month, 313 + (active.startMonth % 17), state);
    const marked = { ...tw, active: { ...active, lastNegotiateMonth: month } };
    if (roll < chance) {
      return easeTradeWar({ ...next, tradeWar: marked }, 15, 'Negociação');
    }
    next = setContact({ ...next, tradeWar: { ...marked, active: { ...marked.active, tariff: clamp(active.tariff + 3, 1, TRADE_WAR_MAX_TARIFF) } } }, active.aggressorId, (contact) => ({ relation: clamp((Number(contact.relation) || 0) - 2, -100, 100) }));
    return { ...next, notice: `A rodada com ${name} fracassou e a tarifa subiu 3 pontos. Tente de novo em ${NEGOTIATE_COOLDOWN} meses.` };
  }
  // appeal
  const chance = getAppealChance(state);
  const marked = { ...tw, active: { ...active, lastAppealMonth: month } };
  if (hash(month, 521 + (active.startMonth % 13), state) < chance) {
    return easeTradeWar({ ...state, tradeWar: marked }, 10, 'Recurso na ONU');
  }
  return {
    ...state,
    tradeWar: marked,
    geopolitics: { ...state.geopolitics, onuScore: clamp((Number(state.geopolitics.onuScore) || 0) - 2, 0, 100) },
    notice: 'O recurso na ONU foi rejeitado e a reputação do país arranhou.',
  };
}

function applyDamage(state, active, month) {
  const gdp = Number(state.economy?.gdp) || 0;
  const mitigation = getTradeWarMitigation(state);
  const hit = 0.004 * (active.tariff / 25) * active.weight * mitigation;
  const loss = Math.round(gdp * hit);
  const monthly = gdp / 12;
  let cash = state.economy.cash - Math.round(monthly * 0.004 * (active.tariff / 25) * active.weight * mitigation);
  if (active.subsidy) cash -= Math.round(gdp * SUBSIDY_COST_RATE);
  if (active.retaliated) cash += Math.round(monthly * 0.003 * (active.tariff / 25));
  const economy = {
    ...state.economy,
    gdp: gdp - loss,
    cash,
    unemployment: clamp((Number(state.economy.unemployment) || 0) + (0.0007 * (active.tariff / 25) * mitigation), 0.02, 0.45),
    inflation: clamp((Number(state.economy.inflation) || 0) + (0.0004 * (active.tariff / 25) + (active.retaliated ? 0.0004 : 0)), 0, 0.8),
  };
  // Os dois setores mais expostos encolhem um pouco a cada mes (as fatias sempre voltam a somar 100%).
  const sectors = normalizeSectors(state.economy.sectors);
  const shrunk = Object.fromEntries(SECTOR_IDS.map((id) => [id, { ...sectors[id], share: sectors[id].share * (active.hitSectors.includes(id) ? 1 - (0.006 * (active.tariff / 25) * mitigation) : 1) }]));
  economy.sectors = normalizeSectors(shrunk);
  return { state: { ...state, economy }, loss };
}

// Fim de mes: possivel inicio de guerra, dano, escalada, cansaco e fim.
export function processTradeWar(state) {
  if (!isActiveGame(state)) return state;
  const month = Number(state.monthCounter) || 0;
  let tw = normalizeTradeWar(state.tradeWar);
  let next = { ...state, tradeWar: { ...tw, diversification: Math.max(0, tw.diversification - 0.4) } };
  tw = next.tradeWar;
  if (!tw.active) {
    const chance = getTradeWarRisk(next);
    if (chance > 0 && hash(month, 419, next) < chance) {
      const pool = candidates(next);
      if (pool.length) {
        const total = pool.reduce((sum, item) => sum + item.pick, 0);
        let roll = hash(month, 733, next) * total;
        const chosen = pool.find((item) => { roll -= item.pick; return roll <= 0; }) ?? pool[pool.length - 1];
        const relation = Number(chosen.contact.relation) || 0;
        const tariff = Math.round(15 + (hash(month, 811, next) * 15) + (relation < -20 ? 5 : 0));
        const order = [...SECTOR_IDS].sort((a, b) => hash(month + SECTOR_IDS.indexOf(a), 907, next) - hash(month + SECTOR_IDS.indexOf(b), 907, next));
        const heavy = order.filter((id) => id === 'industry' || id === 'agro');
        const hit = [heavy[0] ?? order[0], order.find((id) => id !== (heavy[0] ?? order[0]))];
        return startTradeWar(next, chosen.contact.id, tariff, chosen.weight, hit);
      }
    }
    return next;
  }
  const active = tw.active;
  const aggressor = findContact(next, active.aggressorId);
  if (!aggressor || aggressor.destruido || aggressor.anexado || aggressor.atWar) {
    return endWar(next, 'cancelada', 'A guerra comercial perdeu o sentido e foi encerrada.');
  }
  const damaged = applyDamage(next, active, month);
  next = damaged.state;
  let current = { ...active, loss: active.loss + damaged.loss };
  next = { ...next, tradeWar: { ...next.tradeWar, totalLoss: next.tradeWar.totalLoss + damaged.loss, active: current } };
  const age = month - active.startMonth;
  // Escalada: quem retalia ve a tarifa subir a cada 3 meses.
  if (active.retaliated && age > 0 && age % 3 === 0 && current.tariff < TRADE_WAR_MAX_TARIFF) {
    current = { ...current, tariff: Math.min(TRADE_WAR_MAX_TARIFF, current.tariff + 5) };
    next = { ...next, tradeWar: { ...next.tradeWar, active: current }, notice: `A disputa com ${aggressor.name} escalou: a tarifa subiu para ${current.tariff}%.` };
  } else if (!active.retaliated && age >= 4 && current.tariff > 1) {
    // Cansaco: sem retaliacao, a tarifa vai cedendo devagar.
    current = { ...current, tariff: current.tariff - 1 };
    next = { ...next, tradeWar: { ...next.tradeWar, active: current } };
  }
  if (current.tariff <= 1 && age >= 4) return endWar(next, 'cansaco', `${aggressor.name} cansou da disputa e levantou as tarifas.`);
  if (age >= 18) return endWar(next, 'cansaco', `Depois de ${age} meses, ${aggressor.name} aceitou encerrar a guerra comercial.`);
  return next;
}
