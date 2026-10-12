const TOTAL_SEATS = 300;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function seededOffset(seed, index) {
  return ((Math.imul(seed + 31, index + 17) >>> 0) % 13) - 6;
}

export function createCongress(seed = 1) {
  const leftSeats = 76 + seededOffset(seed, 1);
  const centerSeats = 88 + seededOffset(seed, 2);
  const rightSeats = 82 + seededOffset(seed, 3);
  const nationalistSeats = TOTAL_SEATS - leftSeats - centerSeats - rightSeats;

  return {
    totalSeats: TOTAL_SEATS,
    blocs: [
      { id: 'left', label: 'Esquerda', seats: leftSeats, support: 0, baseSupport: true, negotiated: false, negotiationCost: leftSeats * 8_000_000 },
      { id: 'center', label: 'Centro', seats: centerSeats, support: 0, baseSupport: true, negotiated: false, negotiationCost: centerSeats * 10_000_000 },
      { id: 'right', label: 'Direita', seats: rightSeats, support: 0, baseSupport: true, negotiated: false, negotiationCost: rightSeats * 12_000_000 },
      { id: 'nationalist', label: 'Nacionalistas', seats: nationalistSeats, support: 0, baseSupport: true, negotiated: false, negotiationCost: nationalistSeats * 11_000_000 },
    ],
  };
}

function publicSupport(value) {
  if (Number.isFinite(value)) return value;
  const values = Object.entries(value ?? {}).filter(([key, score]) => key !== 'elite' || Number(score) > 0).map(([, score]) => Number(score) || 0);
  return values.length ? values.reduce((total, score) => total + score, 0) / values.length : 50;
}

function blocVoteShare(bloc, supportScore) {
  const support = clamp(Number(bloc.support) || 0, 0, 1);
  const popularityEffect = support > 0 && support < 1 ? clamp((supportScore - 50) / 500, -0.1, 0.1) : 0;
  return clamp(support + popularityEffect, 0, 1);
}

export function getVoteForecast(congress, factions) {
  const supportScore = publicSupport(factions);
  const totalSeats = congress.totalSeats ?? congress.blocs.reduce((total, bloc) => total + bloc.seats, 0);
  const votesFor = congress.blocs.reduce(
    (total, bloc) => total + Math.round(bloc.seats * blocVoteShare(bloc, supportScore)),
    0,
  );

  return {
    totalSeats,
    votesFor,
    requiredVotes: Math.floor(totalSeats / 2) + 1,
  };
}

export function negotiateSupport(congress, economy, blocId, factions) {
  const bloc = congress.blocs.find((candidate) => candidate.id === blocId);
  if (!bloc || bloc.negotiated) {
    return { ok: false, reason: 'Bloco indisponivel para nova negociacao.', congress, economy };
  }
  if (economy.cash < bloc.negotiationCost) {
    return { ok: false, reason: 'Caixa insuficiente para a negociacao.', congress, economy };
  }

  const updatedBloc = {
    ...bloc,
    support: clamp(bloc.support + 0.22 + ((publicSupport(factions) - 50) / 1_000), 0, 0.95),
    negotiated: true,
  };
  return {
    ok: true,
    reason: `${bloc.label ?? bloc.id} aceitou apoiar a agenda.`,
    congress: { ...congress, blocs: congress.blocs.map((candidate) => candidate.id === blocId ? updatedBloc : candidate) },
    economy: { ...economy, cash: economy.cash - bloc.negotiationCost },
  };
}

export function voteOnLaw(congress, law, factions) {
  const adjustedCongress = {
    ...congress,
    blocs: congress.blocs.map((bloc) => ({
      ...bloc,
      support: bloc.baseSupport
        ? clamp((law.affinity[bloc.id] ?? 0) + bloc.support, 0, 1)
        : bloc.support,
    })),
  };
  const forecast = getVoteForecast(adjustedCongress, factions);

  return {
    ...forecast,
    approved: forecast.votesFor >= forecast.requiredVotes,
    lawId: law.id,
  };
}
