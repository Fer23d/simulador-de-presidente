// Vida diplomatica: inspecoes da AIEA sobre o Plano Nuclear e cupulas internacionais.
// Os dois sistemas deixam um pedido pendente (com prazo) que o jogador responde na aba Diplomacia;
// se o prazo passa, vale a resposta mais fria (recusar a inspecao, faltar a cupula).
import { adjustFactions } from './factions.js';

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export const INSPECTION_DEADLINE_MONTHS = 3;
export const INSPECTION_COOLDOWN_MONTHS = 9;
export const SUMMIT_DEADLINE_MONTHS = 2;
export const SUMMIT_FIRST_MONTH = 9;
export const SUMMIT_INTERVAL_MONTHS = 10;
export const SUMMIT_BONUS_MONTHS = 6;

// Cada cupula tem uma pauta com tres posturas. "bias" sobe ou desce a chance de bom resultado;
// "bonus" e o efeito mensal que dura SUMMIT_BONUS_MONTHS quando a negociacao da certo.
export const SUMMITS = Object.freeze({
  g20: Object.freeze({
    id: 'g20', title: 'Cúpula do G20', theme: 'Economia mundial',
    text: 'As maiores economias discutem comércio, dívida e câmbio. Seu país tem voz na mesa.',
    options: Object.freeze({
      open: Object.freeze({ label: 'Abrir a economia', detail: 'Defende livre comércio. Bom resultado: +0,06% do PIB por mês durante 6 meses. A elite aprova e os trabalhadores torcem o nariz.', bias: 0.04, cost: 0, bonus: 'trade' }),
      cooperate: Object.freeze({ label: 'Cooperar com os vizinhos', detail: 'Propõe um pacote conjunto. Bom resultado: +1 de relação por mês com todos durante 6 meses.', bias: 0.0, cost: 0, bonus: 'goodwill' }),
      protect: Object.freeze({ label: 'Proteger a indústria', detail: 'Defende tarifas. Bom resultado: tensão social −1 por mês por 6 meses, mas a relação com todos cai um pouco agora.', bias: -0.05, cost: 0, bonus: 'calm' }),
    }),
  }),
  cop: Object.freeze({
    id: 'cop', title: 'Conferência do Clima (COP)', theme: 'Clima e energia',
    text: 'Os países negociam metas de emissões e financiamento verde. O mundo cobra posição.',
    options: Object.freeze({
      green: Object.freeze({ label: 'Meta ambiciosa', detail: 'Promete cortes fortes. Custa 0,4% do PIB agora. Bom resultado: a ONU enxerga seu país com bons olhos e entra +0,06% do PIB por mês.', bias: 0.06, cost: 0.004, bonus: 'trade' }),
      balanced: Object.freeze({ label: 'Meta gradual', detail: 'Promete cortes moderados. Sem custo. Bom resultado: +1 de relação por mês com todos durante 6 meses.', bias: 0.0, cost: 0, bonus: 'goodwill' }),
      deny: Object.freeze({ label: 'Rejeitar metas', detail: 'Recusa compromissos. Agrada à indústria, mas a imagem lá fora sofre agora.', bias: -0.12, cost: 0, bonus: 'calm' }),
    }),
  }),
  regional: Object.freeze({
    id: 'regional', title: 'Cúpula do Bloco Regional', theme: 'Comércio e fronteiras',
    text: 'Os vizinhos se reúnem para renovar tarifas, circulação de pessoas e segurança conjunta.',
    options: Object.freeze({
      lead: Object.freeze({ label: 'Liderar a integração', detail: 'Assume a liderança do bloco. Custa 0,3% do PIB. Bom resultado: +0,06% do PIB por mês e +1 de relação por mês.', bias: 0.05, cost: 0.003, bonus: 'trade' }),
      join: Object.freeze({ label: 'Acompanhar o bloco', detail: 'Assina o que a maioria decidir. Sem custo. Bom resultado: +1 de relação por mês com todos.', bias: 0.0, cost: 0, bonus: 'goodwill' }),
      veto: Object.freeze({ label: 'Vetar a pauta', detail: 'Barra a integração. Nacionalistas e militares gostam, mas os vizinhos se irritam agora.', bias: -0.1, cost: 0, bonus: 'calm' }),
    }),
  }),
  security: Object.freeze({
    id: 'security', title: 'Cúpula de Segurança', theme: 'Defesa e paz',
    text: 'Chefes de Estado discutem corrida armamentista, fronteiras e controle de armas.',
    options: Object.freeze({
      disarm: Object.freeze({ label: 'Propor desarmamento', detail: 'Defende cortes de arsenais. Bom resultado: a ONU entra +8 e os militares reclamam.', bias: 0.04, cost: 0, bonus: 'goodwill' }),
      deter: Object.freeze({ label: 'Defender a dissuasão', detail: 'Mostra força sem ameaçar. Bom resultado: tensão social −1 por mês por 6 meses e os militares aplaudem.', bias: 0.0, cost: 0, bonus: 'calm' }),
      threaten: Object.freeze({ label: 'Subir o tom', detail: 'Ameaça rivais para ganhar respeito. Agrada à linha dura, mas a ONU e as relações caem agora.', bias: -0.12, cost: 0, bonus: 'calm' }),
    }),
  }),
});

const SUMMIT_ORDER = Object.freeze(['g20', 'cop', 'regional', 'security']);

export function createDiplomacyLife() {
  return {
    inspection: null,
    lastInspectionMonth: -99,
    inspectionsAccepted: 0,
    inspectionRefusals: 0,
    summit: null,
    lastSummitMonth: -99,
    summitsHeld: 0,
    summitBonus: null,
  };
}

export function normalizeDiplomacyLife(value) {
  const base = createDiplomacyLife();
  if (!value || typeof value !== 'object') return base;
  const inspection = value.inspection && Number.isFinite(Number(value.inspection.deadline))
    ? { deadline: Math.floor(Number(value.inspection.deadline)), military: Boolean(value.inspection.military) }
    : null;
  const summit = value.summit && SUMMITS[value.summit.id] && Number.isFinite(Number(value.summit.deadline))
    ? { id: value.summit.id, deadline: Math.floor(Number(value.summit.deadline)) }
    : null;
  const bonus = value.summitBonus && ['trade', 'goodwill', 'calm'].includes(value.summitBonus.kind) && Number.isFinite(Number(value.summitBonus.until))
    ? { kind: value.summitBonus.kind, until: Math.floor(Number(value.summitBonus.until)), strength: clamp(Number(value.summitBonus.strength) || 1, 0.5, 1) }
    : null;
  const number = (key) => (Number.isFinite(Number(value[key])) ? Number(value[key]) : base[key]);
  return {
    inspection,
    lastInspectionMonth: number('lastInspectionMonth'),
    inspectionsAccepted: Math.max(0, Math.floor(number('inspectionsAccepted'))),
    inspectionRefusals: Math.max(0, Math.floor(number('inspectionRefusals'))),
    summit,
    lastSummitMonth: number('lastSummitMonth'),
    summitsHeld: Math.max(0, Math.floor(number('summitsHeld'))),
    summitBonus: bonus,
  };
}

function isActive(state) {
  return !state.regime?.gameOver && !state.is_wasteland && !state.city && Boolean(state.geopolitics?.contacts);
}

function hash(month, salt) {
  return ((Math.imul(month * 7919 + salt, 2654435761) >>> 0) % 1000) / 1000;
}

function shiftRelations(geopolitics, delta) {
  return { ...geopolitics, contacts: geopolitics.contacts.map((contact) => (contact.destruido || contact.anexado ? contact : { ...contact, relation: clamp((Number(contact.relation) || 0) + delta, -100, 100) })) };
}

function shiftOnu(geopolitics, delta) {
  return { ...geopolitics, onuScore: clamp((Number(geopolitics.onuScore) || 0) + delta, 0, 100) };
}

export function getInspectionPreview(state) {
  const nuclear = state.military?.nuclear ?? {};
  const military = (Number(nuclear.militaryProgress) || 0) > 0;
  return { military };
}

// Cada inspecao so faz sentido enquanto o programa existe e a bomba ainda nao saiu.
function inspectionDue(state, life, month) {
  const nuclear = state.military?.nuclear;
  if (!nuclear?.planStarted || nuclear.bombBuilt || life.inspection) return false;
  const progress = Math.max(Number(nuclear.civilProgress) || 0, Number(nuclear.militaryProgress) || 0);
  if (progress < 20) return false;
  if (month - life.lastInspectionMonth < INSPECTION_COOLDOWN_MONTHS) return false;
  const chance = (Number(nuclear.militaryProgress) || 0) > 0 ? 0.3 : 0.16;
  return hash(month, 97) < chance;
}

export function respondToInspection(state, accept, expired = false) {
  const life = normalizeDiplomacyLife(state.diplomacyLife);
  if (!life.inspection) return { ...state, notice: 'Nenhuma inspeção da AIEA aguarda resposta.' };
  const month = Number(state.monthCounter) || 0;
  const hadMilitary = (Number(state.military?.nuclear?.militaryProgress) || 0) > 0;
  const cleared = { ...life, inspection: null, lastInspectionMonth: month };
  if (accept) {
    const nuclear = state.military.nuclear;
    const found = hadMilitary;
    return {
      ...state,
      diplomacyLife: { ...cleared, inspectionsAccepted: life.inspectionsAccepted + 1, inspectionRefusals: 0 },
      geopolitics: shiftRelations(shiftOnu(state.geopolitics, 6), 2),
      military: {
        ...state.military,
        nuclear: {
          ...nuclear,
          civilProgress: clamp((Number(nuclear.civilProgress) || 0) + 4, 0, 100),
          militaryProgress: clamp((Number(nuclear.militaryProgress) || 0) - (found ? 20 : 0), 0, 100),
        },
      },
      factions: found ? adjustFactions(state.factions, { militares: -4 }) : state.factions,
      notice: found
        ? 'Os inspetores da AIEA entraram. Eles barraram parte da frente militar e a imagem do país melhorou, mas os militares não gostaram.'
        : 'Os inspetores da AIEA aprovaram o programa civil. A ONU e os vizinhos reagiram bem.',
    };
  }
  const refusals = life.inspectionRefusals + 1;
  const sanctioned = refusals >= 2;
  const geopolitics = shiftRelations(shiftOnu(state.geopolitics, expired ? -6 : -8), expired ? -2 : -4);
  return {
    ...state,
    diplomacyLife: { ...cleared, inspectionRefusals: refusals },
    geopolitics: sanctioned ? { ...geopolitics, sanctionSeverity: clamp((Number(geopolitics.sanctionSeverity) || 0) + 0.25, 0, 1) } : geopolitics,
    factions: adjustFactions(state.factions, { militares: 2 }),
    notice: expired
      ? `O prazo da AIEA passou sem resposta e o mundo leu isso como recusa.${sanctioned ? ' Sanções foram impostas.' : ''}`
      : `Você recusou a inspeção da AIEA e a soberania foi preservada.${sanctioned ? ' É a segunda recusa seguida: sanções foram impostas.' : ' O mundo desconfia do seu programa.'}`,
  };
}

function summitFor(month, held) {
  const index = (held + Math.floor(hash(month, 31) * 2)) % SUMMIT_ORDER.length;
  return SUMMITS[SUMMIT_ORDER[index]];
}

// Quao bem o pais negocia: ONU, relacoes e o historico recente com a AIEA.
export function getSummitStanding(state) {
  const contacts = (state.geopolitics?.contacts ?? []).filter((contact) => !contact.destruido && !contact.anexado);
  const relation = contacts.length ? contacts.reduce((sum, contact) => sum + (Number(contact.relation) || 0), 0) / contacts.length : 0;
  const life = normalizeDiplomacyLife(state.diplomacyLife);
  const onu = (Number(state.geopolitics?.onuScore) || 0) / 100;
  const standing = (onu * 0.55) + (((relation + 100) / 200) * 0.45) - (life.inspectionRefusals * 0.08) - (state.geopolitics?.internationalSanctions ? 0.15 : 0);
  return clamp(standing, 0, 1);
}

export function getSummitChance(state, optionBias = 0) {
  return clamp(getSummitStanding(state) + optionBias + 0.1, 0.05, 0.95);
}

export function respondToSummit(state, optionId, expired = false) {
  const life = normalizeDiplomacyLife(state.diplomacyLife);
  const summit = life.summit ? SUMMITS[life.summit.id] : null;
  if (!summit) return { ...state, notice: 'Nenhuma cúpula aguarda sua posição.' };
  const month = Number(state.monthCounter) || 0;
  const cleared = { ...life, summit: null, lastSummitMonth: month };
  if (expired || !summit.options[optionId]) {
    return {
      ...state,
      diplomacyLife: cleared,
      geopolitics: shiftOnu(state.geopolitics, -2),
      notice: `Seu país faltou à ${summit.title}. A cadeira vazia foi notada.`,
    };
  }
  const option = summit.options[optionId];
  const gdp = Number(state.economy?.gdp) || 0;
  const cost = Math.round(gdp * option.cost);
  const hostile = option.bias <= -0.05;
  const good = !hostile && hash(month, 211) < getSummitChance(state, option.bias);
  let next = {
    ...state,
    economy: { ...state.economy, cash: state.economy.cash - cost },
    diplomacyLife: { ...cleared, summitsHeld: life.summitsHeld + 1 },
  };
  if (hostile) {
    // Posturas duras rendem aplauso interno e custam imagem lá fora na hora.
    next = {
      ...next,
      geopolitics: shiftRelations(shiftOnu(next.geopolitics, summit.id === 'security' ? -8 : -5), summit.id === 'security' ? -3 : -2),
      factions: adjustFactions(next.factions, summit.id === 'security' ? { militares: 4 } : { elite: 3, militares: 2 }),
      regime: { ...next.regime, unrest: clamp((Number(next.regime?.unrest) || 0) - 3, 0, 100) },
      notice: `${summit.title}: você escolheu "${option.label}". Aplauso em casa, cara feia lá fora.`,
    };
    return next;
  }
  const strength = good ? 1 : 0.5;
  next = {
    ...next,
    diplomacyLife: { ...next.diplomacyLife, summitBonus: { kind: option.bonus, until: month + SUMMIT_BONUS_MONTHS, strength } },
    geopolitics: shiftOnu(next.geopolitics, summit.id === 'security' && optionId === 'disarm' ? (good ? 8 : 3) : (good ? 3 : 1)),
    factions: summit.id === 'g20' && optionId === 'open'
      ? adjustFactions(next.factions, { elite: good ? 3 : 1, trabalhadores: -1 })
      : (summit.id === 'security' && optionId === 'disarm' ? adjustFactions(next.factions, { militares: -3 }) : (summit.id === 'security' ? adjustFactions(next.factions, { militares: 3 }) : next.factions)),
  };
  if (summit.id === 'g20' && optionId === 'protect') next = { ...next, geopolitics: shiftRelations(next.geopolitics, -2) };
  return {
    ...next,
    notice: good
      ? `${summit.title}: "${option.label}" foi bem recebida. O acordo vale por ${SUMMIT_BONUS_MONTHS} meses.`
      : `${summit.title}: "${option.label}" teve resultado morno. O acordo rende metade do esperado.`,
  };
}

// Efeito mensal do ultimo acordo fechado numa cupula.
function applySummitBonus(state, month) {
  const life = normalizeDiplomacyLife(state.diplomacyLife);
  const bonus = life.summitBonus;
  if (!bonus) return state;
  if (month >= bonus.until) return { ...state, diplomacyLife: { ...life, summitBonus: null } };
  if (bonus.kind === 'trade') {
    const gain = Math.round((Number(state.economy?.gdp) || 0) * 0.0006 * bonus.strength);
    return { ...state, economy: { ...state.economy, cash: state.economy.cash + gain } };
  }
  if (bonus.kind === 'goodwill') return { ...state, geopolitics: shiftRelations(state.geopolitics, bonus.strength) };
  return { ...state, regime: { ...state.regime, unrest: clamp((Number(state.regime?.unrest) || 0) - bonus.strength, 0, 100) } };
}

// Fim de mes: prazos, bonus de cupula e novos pedidos.
export function processDiplomacyLife(state) {
  if (!isActive(state)) return state;
  const month = Number(state.monthCounter) || 0;
  let next = { ...state, diplomacyLife: normalizeDiplomacyLife(state.diplomacyLife) };
  next = applySummitBonus(next, month);
  if (next.diplomacyLife.inspection && month >= next.diplomacyLife.inspection.deadline) next = respondToInspection(next, false, true);
  if (next.diplomacyLife.summit && month >= next.diplomacyLife.summit.deadline) next = respondToSummit(next, null, true);
  let life = next.diplomacyLife;
  if (inspectionDue(next, life, month)) {
    const military = (Number(next.military?.nuclear?.militaryProgress) || 0) > 0;
    next = {
      ...next,
      diplomacyLife: { ...life, inspection: { deadline: month + INSPECTION_DEADLINE_MONTHS, military } },
      notice: 'A AIEA pede para inspecionar o Plano Nuclear. Responda na aba Diplomacia.',
    };
    life = next.diplomacyLife;
  }
  const gap = month - life.lastSummitMonth;
  const first = life.lastSummitMonth < 0 && month >= SUMMIT_FIRST_MONTH;
  if (!life.summit && (first || (life.lastSummitMonth >= 0 && gap >= SUMMIT_INTERVAL_MONTHS))) {
    // Quem ja detonou a bomba nao e convidado: o mundo fecha a porta por um ciclo.
    if (next.military?.nuclear?.bombBuilt) {
      next = { ...next, diplomacyLife: { ...life, lastSummitMonth: month }, notice: 'Seu país não foi convidado para a cúpula deste ciclo por causa do arsenal nuclear.' };
    } else {
      const summit = summitFor(month, life.summitsHeld);
      next = {
        ...next,
        diplomacyLife: { ...life, summit: { id: summit.id, deadline: month + SUMMIT_DEADLINE_MONTHS } },
        notice: `Convite recebido: ${summit.title}. Escolha a posição do país na aba Diplomacia.`,
      };
    }
  }
  return next;
}
