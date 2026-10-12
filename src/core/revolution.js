function socialistName(name) {
  return name.startsWith('Uniao Socialista do ') ? name : `Uniao Socialista do ${name}`;
}

function targetForAbsorption(state, targetId) {
  return state.geopolitics?.contacts?.find((contact) => contact.id === targetId && !contact.destruido && !contact.anexado) ?? null;
}

export function decretarRevolucaoSocialista(state) {
  const factions = state.factions ?? {};
  if (state.regime?.gameOver) return { ...state, notice: 'A partida foi encerrada.' };
  if (state.regime?.type === 'communist_dictatorship') return { ...state, notice: 'A revolucao socialista ja foi decretada.' };
  if (!(factions.trabalhadores > 80 && factions.militares > 60 && factions.elite < 40)) {
    return { ...state, notice: 'Revolucao exige trabalhadores acima de 80, militares acima de 60 e elite abaixo de 40.' };
  }
  return {
    ...state,
    country: { ...state.country, nome: socialistName(state.country.nome) },
    factions: { ...factions, elite: 0 },
    regime: { ...state.regime, type: 'communist_dictatorship', electionsSuspended: true, coupRisk: 0, revolutionRisk: 0 },
    notice: 'Revolucao Socialista decretada: a Uniao foi fundada.',
  };
}

export function absorverPaisParaUniao(state, targetId) {
  if (state.regime?.type !== 'communist_dictatorship') return { ...state, notice: 'Somente a Uniao Socialista pode absorver paises aliados.' };
  const target = targetForAbsorption(state, targetId);
  if (!target) return { ...state, notice: 'Pais nao encontrado ou indisponivel para absorcao.' };
  if (!(target.relation > 80 || target.puppet)) return { ...state, notice: 'Absorcao exige relacao acima de 80 ou um governo fantoche.' };
  const population = Number(target.population ?? target.populacao_base) || 0;
  const area = Number(target.area_km2) || 0;
  const gdp = Number(target.pib_base) || 0;
  const targetCash = Math.max(0, Number(target.cash) || 0);
  return {
    ...state,
    country: {
      ...state.country,
      area_km2: (Number(state.country.area_km2) || 0) + area,
      populacao: (Number(state.country.populacao ?? state.country.populacao_base) || 0) + population,
      populacao_base: (Number(state.country.populacao_base) || 0) + population,
      pib_base: (Number(state.country.pib_base) || 0) + gdp,
    },
    economy: { ...state.economy, gdp: state.economy.gdp + gdp, cash: state.economy.cash + targetCash },
    geopolitics: {
      ...state.geopolitics,
      annexedCountryIds: [...new Set([...(state.geopolitics.annexedCountryIds ?? []), target.id])],
      contacts: state.geopolitics.contacts.map((contact) => contact.id === target.id
        ? { ...contact, anexado: true, destruido: true, puppet: false, atWar: false, alliance: false, tradeTreaty: false, militaryPower: 0, population: 0, area_km2: 0, pib_base: 0, cash: 0 }
        : contact),
    },
    notice: `${target.name} foi absorvido pela Uniao Socialista.`,
  };
}
