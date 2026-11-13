// Identidade do jogador: o nome da organizacao (o pais pode virar "Uniao Sovietica", "Imperio X"...) e os titulos de
// reputacao (Pacificador, Conquistador, Proliferador...) que o mundo da a voce conforme o que voce faz.
// O nome vale para o jogo todo porque o jogo inteiro le o nome do pais em state.country.nome.
import { adjustFactions } from './factions.js';

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

// ---------- Nome da organizacao ----------
export const ORG_NAME_MIN = 3;
export const ORG_NAME_MAX = 40;
export const ORG_MIN_ANNEXED = 2;
export const ORG_RENAME_COOLDOWN = 24;

const SPECIAL_NAMES = Object.freeze({
  rus: ['União Soviética', 'Império Russo', 'Federação Eurasiana'],
  chn: ['Império do Meio', 'República Popular Unida', 'Grande Mandarinato'],
  bra: ['Império do Brasil', 'Estados Unidos da América do Sul', 'União Sul-Americana'],
  usa: ['Império Americano', 'Hegemonia do Novo Mundo', 'União das Américas'],
  gbr: ['Império Britânico', 'Commonwealth Unida', 'Reino Atlântico'],
  deu: ['Sacro Império Germânico', 'Confederação Germânica', 'União Centro-Europeia'],
  fra: ['Império Francês', 'União Mediterrânea', 'República Continental'],
  ita: ['Império Romano', 'União Mediterrânica', 'República Latina'],
  tur: ['Império Otomano', 'Califado Anatólio', 'União Turânica'],
  jpn: ['Império do Sol Nascente', 'Esfera de Coprosperidade', 'União do Pacífico'],
  esp: ['Império Espanhol', 'União Ibérica', 'Reino Atlântico Unido'],
  irn: ['Império Persa', 'Grande Pérsia', 'União Iraniana'],
  egy: ['Império Faraônico', 'União do Nilo', 'República Árabe Unida'],
  ind: ['Império Mogol', 'União Indiana', 'Grande Índia'],
  mex: ['Império Asteca', 'União Mesoamericana', 'Grande México'],
  arg: ['Vice-Reino do Prata', 'União Platina', 'Grande Argentina'],
});

export function getAnnexedCount(state) {
  return (state.geopolitics?.contacts ?? []).filter((contact) => contact.anexado).length;
}

export function sanitizeOrgName(raw) {
  return String(raw ?? '').replace(/[<>&"`\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, ORG_NAME_MAX);
}

export function getOriginalName(state) {
  return typeof state.country?.originalName === 'string' && state.country.originalName ? state.country.originalName : state.country?.nome;
}

export function getOrgNameSuggestions(state) {
  const original = getOriginalName(state);
  const special = SPECIAL_NAMES[state.country?.id] ?? [];
  const generic = [`União ${original}`, `Império ${original}`, `Federação ${original}`, `República Unida de ${original}`];
  return [...new Set([...special, ...generic])].filter((name) => name !== state.country?.nome).slice(0, 6);
}

export function getRenameStatus(state, rawName = null) {
  if (state.regime?.gameOver || state.is_wasteland || state.city) return { available: false, reason: 'Indisponível.' };
  const annexed = getAnnexedCount(state);
  if (annexed < ORG_MIN_ANNEXED) return { available: false, reason: `Anexe ${ORG_MIN_ANNEXED} países para rebatizar a organização (hoje ${annexed}).` };
  const month = Number(state.monthCounter) || 0;
  const wait = ORG_RENAME_COOLDOWN - (month - (Number(state.orgRenameMonth) || -99));
  if (wait > 0) return { available: false, reason: `Novo nome em ${wait} mês(es).` };
  if (rawName !== null) {
    const name = sanitizeOrgName(rawName);
    if (name.length < ORG_NAME_MIN) return { available: false, reason: `O nome precisa ter pelo menos ${ORG_NAME_MIN} letras.` };
    if (name === state.country?.nome) return { available: false, reason: 'Esse já é o nome da organização.' };
  }
  return { available: true, reason: '' };
}

function applyName(state, name, notice) {
  const month = Number(state.monthCounter) || 0;
  return {
    ...state,
    country: { ...state.country, nome: name, originalName: getOriginalName(state) },
    orgRenameMonth: month,
    factions: adjustFactions(state.factions, { militares: 2, elite: -1 }),
    notice,
  };
}

export function renameOrganization(state, rawName) {
  const status = getRenameStatus(state, rawName);
  if (!status.available) return { ...state, notice: status.reason };
  const name = sanitizeOrgName(rawName);
  return applyName(state, name, `${state.country.nome} agora se chama ${name}. O novo nome vale em todo o jogo, e os militares gostaram da grandeza.`);
}

export function restoreOrganizationName(state) {
  const original = getOriginalName(state);
  if (!original || original === state.country?.nome) return { ...state, notice: 'A organização já usa o nome original.' };
  const month = Number(state.monthCounter) || 0;
  const wait = ORG_RENAME_COOLDOWN - (month - (Number(state.orgRenameMonth) || -99));
  if (wait > 0) return { ...state, notice: `Novo nome em ${wait} mês(es).` };
  return applyName(state, original, `A organização voltou ao nome original: ${original}.`);
}

// ---------- Titulos de reputacao ----------
export function createReputation() {
  return { stats: { warsDeclared: 0, ntpSigned: 0, territoriesLost: 0 }, active: [], current: null };
}

export function normalizeReputation(value) {
  const base = createReputation();
  if (!value || typeof value !== 'object') return base;
  const count = (key) => Math.max(0, Math.floor(Number(value.stats?.[key]) || 0));
  const active = Array.isArray(value.active) ? value.active.filter((id) => TITLES[id]) : [];
  return {
    stats: { warsDeclared: count('warsDeclared'), ntpSigned: count('ntpSigned'), territoriesLost: count('territoriesLost') },
    active,
    current: TITLES[value.current] && active.includes(value.current) ? value.current : (active[0] ?? null),
  };
}

export function bumpReputationStat(state, key, amount = 1) {
  const reputation = normalizeReputation(state.reputation);
  if (!(key in reputation.stats)) return state;
  return { ...state, reputation: { ...reputation, stats: { ...reputation.stats, [key]: reputation.stats[key] + amount } } };
}

const months = (state) => Number(state.monthCounter) || 0;
const contactsOf = (state) => state.geopolitics?.contacts ?? [];

// Ordem = prioridade para o titulo "atual". `effects` documenta o que cada titulo faz no jogo.
export const TITLES = Object.freeze({
  emperor: Object.freeze({
    id: 'emperor', label: 'Imperador', icon: '👑',
    story: 'Seu nome já não cabe num só país: o mundo fala de um império.',
    requirement: 'Ter 4 países anexados ao mesmo tempo.',
    effects: 'Ataques a seus territórios 15% menos prováveis; reputação na ONU cai 0,1 por mês.',
    check: (state) => getAnnexedCount(state) >= 4,
    modifiers: { territoryAttack: 0.85, onuDrift: -0.1 },
  }),
  conqueror: Object.freeze({
    id: 'conqueror', label: 'Conquistador', icon: '⚔️',
    story: 'Onde suas tropas pisaram, a bandeira mudou. Os vizinhos o respeitam por medo.',
    requirement: 'Ter 2 países anexados ao mesmo tempo.',
    effects: 'Ataques a seus territórios 20% menos prováveis; relação com não aliados cai 0,15 por mês.',
    check: (state) => getAnnexedCount(state) >= 2,
    modifiers: { territoryAttack: 0.8, relationDrift: -0.15 },
  }),
  warmonger: Object.freeze({
    id: 'warmonger', label: 'Belicista', icon: '🔥',
    story: 'A imprensa estrangeira já o chama de provocador: três guerras declaradas.',
    requirement: 'Declarar 3 guerras.',
    effects: 'Relação com não aliados cai 0,2 por mês; reputação na ONU cai 0,15 por mês.',
    check: (state) => normalizeReputation(state.reputation).stats.warsDeclared >= 3,
    modifiers: { relationDrift: -0.2, onuDrift: -0.15 },
  }),
  proliferator: Object.freeze({
    id: 'proliferator', label: 'Proliferador', icon: '☢️',
    story: 'Sua bomba abriu a caixa de Pandora: outros países seguiram o caminho que você abriu.',
    requirement: 'Construir a bomba e ver ao menos um país fazer a sua na corrida nuclear.',
    effects: 'Relação com não aliados cai 0,2 por mês.',
    check: (state) => Boolean(state.military?.nuclear?.bombBuilt) && (state.nuclearRace?.completed?.length ?? 0) >= 1,
    modifiers: { relationDrift: -0.2 },
  }),
  wanderer: Object.freeze({
    id: 'wanderer', label: 'Soberano Itinerante', icon: '🧭',
    story: 'O poder agora mora longe de casa: o governo despacha de um território conquistado.',
    requirement: 'Manter a sede do governo num território anexado.',
    effects: 'Sem efeito mecânico; marca a sua trajetória.',
    check: (state) => Boolean(state.capitalId),
    modifiers: {},
  }),
  guardian: Object.freeze({
    id: 'guardian', label: 'Guardião da Não Proliferação', icon: '🛡️',
    story: 'Você segurou o dedo de vários países no botão. A história o lembrará por isso.',
    requirement: 'Fechar 2 tratados de não proliferação sem ter bomba.',
    effects: 'Tratados de não proliferação aceitam relação 10 pontos menor; reputação na ONU sobe 0,1 por mês.',
    check: (state) => normalizeReputation(state.reputation).stats.ntpSigned >= 2 && !state.military?.nuclear?.bombBuilt,
    modifiers: { nptRelation: -10, onuDrift: 0.1 },
  }),
  pacifier: Object.freeze({
    id: 'pacifier', label: 'Pacificador', icon: '🕊️',
    story: 'Nenhuma guerra declarada e a ONU o ouve: o mundo o vê como fiador da paz.',
    requirement: 'Reputação na ONU de 65+, sem declarar guerras, depois de 12 meses.',
    effects: 'Relação com não aliados sobe 0,3 por mês; reputação na ONU sobe 0,1 por mês.',
    check: (state) => months(state) >= 12 && (Number(state.geopolitics?.onuScore) || 0) >= 65 && normalizeReputation(state.reputation).stats.warsDeclared === 0,
    modifiers: { relationDrift: 0.3, onuDrift: 0.1 },
  }),
  diplomat: Object.freeze({
    id: 'diplomat', label: 'Diplomata', icon: '🤝',
    story: 'Cúpulas e inspeções abriram portas que a força nunca abriria.',
    requirement: 'Participar de 3 cúpulas e aceitar 1 inspeção da AIEA.',
    effects: 'Relação com não aliados sobe 0,2 por mês.',
    check: (state) => (state.diplomacyLife?.summitsHeld ?? 0) >= 3 && (state.diplomacyLife?.inspectionsAccepted ?? 0) >= 1,
    modifiers: { relationDrift: 0.2 },
  }),
  merchant: Object.freeze({
    id: 'merchant', label: 'Mestre do Comércio', icon: '🚢',
    story: 'Você venceu uma guerra de tarifas e costurou uma rede de parceiros.',
    requirement: 'Encerrar uma guerra comercial com acordo e ter 10 acordos comerciais.',
    effects: 'Chance de guerra comercial 30% menor.',
    check: (state) => (state.tradeWar?.history ?? []).some((item) => item.outcome === 'acordo') && contactsOf(state).filter((contact) => contact.tradeTreaty).length >= 10,
    modifiers: { tradeWarRisk: 0.7 },
  }),
});

export const TITLE_ORDER = Object.freeze(['emperor', 'conqueror', 'warmonger', 'proliferator', 'wanderer', 'guardian', 'pacifier', 'diplomat', 'merchant']);

export function getActiveTitles(state) {
  return TITLE_ORDER.filter((id) => TITLES[id].check(state));
}

export function getCurrentTitle(state) {
  const active = getActiveTitles(state);
  return active.length ? TITLES[active[0]] : null;
}

// Multiplicador (ou soma, para "drift") combinado dos titulos ativos para uma chave de efeito.
export function getTitleModifier(state, key) {
  const active = getActiveTitles(state);
  const additive = key.endsWith('Drift') || key === 'nptRelation';
  return active.reduce((total, id) => {
    const value = TITLES[id]?.modifiers?.[key];
    if (value === undefined) return total;
    return additive ? total + value : total * value;
  }, additive ? 0 : 1);
}

// Fim de mes: reavalia os titulos, avisa de novos/perdidos e aplica a deriva de relacao e ONU.
export function processReputation(state) {
  if (state.regime?.gameOver || state.is_wasteland || state.city || !state.geopolitics?.contacts) return state;
  const previous = normalizeReputation(state.reputation);
  const active = getActiveTitles(state);
  const gained = active.filter((id) => !previous.active.includes(id));
  const lost = previous.active.filter((id) => !active.includes(id));
  let next = { ...state, reputation: { ...previous, active, current: active[0] ?? null } };
  const relationDrift = clamp(getTitleModifier(next, 'relationDrift'), -0.4, 0.5);
  const onuDrift = clamp(getTitleModifier(next, 'onuDrift'), -0.3, 0.3);
  if (relationDrift !== 0) {
    next = {
      ...next,
      geopolitics: {
        ...next.geopolitics,
        contacts: next.geopolitics.contacts.map((contact) => {
          if (contact.destruido || contact.anexado || contact.wasteland || contact.atWar || contact.alliance) return contact;
          const relation = Number(contact.relation) || 0;
          if (relationDrift > 0 && relation >= 75) return contact;
          if (relationDrift < 0 && relation <= -80) return contact;
          return { ...contact, relation: clamp(relation + relationDrift, -100, 100) };
        }),
      },
    };
  }
  if (onuDrift !== 0) next = { ...next, geopolitics: { ...next.geopolitics, onuScore: clamp((Number(next.geopolitics.onuScore) || 0) + onuDrift, 0, 100) } };
  const notes = [
    ...gained.map((id) => `Novo título: ${TITLES[id].label}. ${TITLES[id].story}`),
    ...lost.map((id) => `Você perdeu o título de ${TITLES[id].label}.`),
  ];
  return notes.length ? { ...next, notice: notes.join(' ') } : next;
}
