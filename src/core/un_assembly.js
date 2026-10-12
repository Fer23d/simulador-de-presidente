import { nextRandom } from './geopolitics.js';

export const RESOLUTIONS = Object.freeze([
  Object.freeze({ id: 'nuclear-disarmament', title: 'Resolucao de Desarmamento', description: 'Penaliza economias que sustentam gastos militares elevados.', kind: 'disarmament' }),
  Object.freeze({ id: 'carbon-tax', title: 'Taxa Global de Carbono', description: 'Reduz a expansao de economias dependentes de petroleo.', kind: 'carbon' }),
  Object.freeze({ id: 'humanitarian-aid', title: 'Fundo de Ajuda Humanitaria', description: 'Redireciona parte da riqueza global para os paises vulneraveis.', kind: 'aid' }),
]);

function getResolution(id) {
  return RESOLUTIONS.find((resolution) => resolution.id === id) ?? null;
}

function elapsedMonths(calendar) {
  return ((Number(calendar?.year) || 2026) - 2026) * 12 + ((Number(calendar?.month) || 1) - 1);
}

function npcVote(contact, resolution) {
  if (resolution.kind === 'carbon') return contact.trait === 'oil_rich' ? 'no' : 'yes';
  if (resolution.kind === 'disarmament') return Number(contact.militaryPower) >= 65 || contact.trait === 'military_tradition' ? 'no' : 'yes';
  if (resolution.kind === 'aid') return Number(contact.pib_base) >= 1_000_000_000_000 || Number(contact.cash) >= 100_000_000_000 ? 'no' : 'yes';
  return 'abstain';
}

function tallyVotes(contacts, resolution) {
  return contacts.reduce((votes, contact) => {
    if (contact.destruido || contact.anexado) return votes;
    const vote = npcVote(contact, resolution);
    return { ...votes, [vote]: votes[vote] + 1 };
  }, { yes: 0, no: 0, abstain: 0 });
}

export function verificarAssembleia(state) {
  if (state.pendingUnVote || elapsedMonths(state.calendar) === 0 || elapsedMonths(state.calendar) % 60 !== 0) return state;
  const random = nextRandom(state.randomSeed);
  const resolution = RESOLUTIONS[Math.floor(random.value * RESOLUTIONS.length)];
  return {
    ...state,
    randomSeed: random.seed,
    pendingUnVote: { resolutionId: resolution.id, npcVotes: tallyVotes(state.geopolitics.contacts, resolution) },
    notice: `A Assembleia Geral da ONU convocou votacao: ${resolution.title}.`,
  };
}

export function registrarVotoONU(state, vote) {
  const pending = state.pendingUnVote;
  const resolution = getResolution(pending?.resolutionId);
  if (!resolution || !['yes', 'no', 'abstain'].includes(vote)) return { ...state, notice: 'Voto da ONU invalido.' };
  const puppetVotes = state.geopolitics?.contacts?.filter((contact) => contact.is_puppet_of === 'jogador' && !contact.destruido && !contact.anexado).length ?? 0;
  const votes = { ...pending.npcVotes, [vote]: (pending.npcVotes?.[vote] ?? 0) + 1 + puppetVotes };
  const total = votes.yes + votes.no + votes.abstain;
  const approved = votes.yes > Math.floor(total / 2);
  return {
    ...state,
    pendingUnVote: null,
    activeGlobalResolutions: approved && !state.activeGlobalResolutions.includes(resolution.id)
      ? [...state.activeGlobalResolutions, resolution.id]
      : state.activeGlobalResolutions,
    notice: approved ? `${resolution.title} foi aprovada na ONU.` : `${resolution.title} foi rejeitada na ONU.`,
  };
}

function applyCountryResolution(country, resolution, isPlayer) {
  if (resolution.kind === 'carbon' && (country.trait === 'oil_rich' || country.trait === 'generic_industry')) {
    return { ...country, pib_base: Math.max(1, Math.round(country.pib_base * 0.997)) };
  }
  if (resolution.kind === 'disarmament') {
    const militaryHigh = isPlayer ? country.defenseSpend >= 0.07 : Number(country.militaryPower) >= 65;
    return militaryHigh ? { ...country, pib_base: Math.max(1, Math.round(country.pib_base * 0.995)) } : country;
  }
  return country;
}

export function aplicarResolucoes(state) {
  const active = (state.activeGlobalResolutions ?? []).map(getResolution).filter(Boolean);
  if (!active.length) return state;
  let country = { ...state.country, defenseSpend: state.budget?.defenseSpend ?? 0 };
  let contacts = state.geopolitics.contacts.map((contact) => ({ ...contact }));
  for (const resolution of active) {
    country = applyCountryResolution(country, resolution, true);
    contacts = contacts.map((contact) => applyCountryResolution(contact, resolution, false));
    if (resolution.kind === 'aid') {
      const richPlayer = country.pib_base >= 1_000_000_000_000;
      const richContacts = contacts.filter((contact) => contact.pib_base >= 1_000_000_000_000 && !contact.destruido);
      const playerContribution = richPlayer ? Math.min(state.economy.cash, 500_000_000) : 0;
      const contactContribution = richContacts.reduce((total, contact) => total + Math.min(contact.cash, 500_000_000), 0);
      const recipients = contacts.filter((contact) => contact.pib_base < 250_000_000_000 && !contact.destruido);
      const playerReceives = country.pib_base < 250_000_000_000;
      const recipientCount = recipients.length + (playerReceives ? 1 : 0);
      const grant = recipientCount ? Math.floor((playerContribution + contactContribution) / recipientCount) : 0;
      country = { ...country, humanitarianGrant: (playerReceives ? grant : 0) };
      contacts = contacts.map((contact) => ({
        ...contact,
        cash: contact.cash - (contact.pib_base >= 1_000_000_000_000 ? Math.min(contact.cash, 500_000_000) : 0) + (contact.pib_base < 250_000_000_000 ? grant : 0),
      }));
      state = { ...state, economy: { ...state.economy, cash: state.economy.cash - playerContribution + (playerReceives ? grant : 0) } };
    }
  }
  const { defenseSpend: _defenseSpend, humanitarianGrant: _grant, ...cleanCountry } = country;
  return { ...state, country: cleanCountry, geopolitics: { ...state.geopolitics, contacts } };
}
