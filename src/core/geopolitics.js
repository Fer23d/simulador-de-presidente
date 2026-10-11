import { COUNTRIES, createCountryProfile, getCountryById } from '../data/countries.js';

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function updateContact(geopolitics, contactId, update) {
  let found = false;
  const contacts = geopolitics.contacts.map((contact) => {
    if (contact.id !== contactId) return contact;
    found = true;
    return update(contact);
  });
  return found ? { ...geopolitics, contacts } : null;
}

export function nextRandom(seed) {
  const nextSeed = (Math.imul(Number(seed) >>> 0, 1664525) + 1013904223) >>> 0;
  return { seed: nextSeed, value: nextSeed / 4_294_967_296 };
}

export function createGeopolitics(playerId = 'bra') {
  const contact = (country) => {
    return {
      id: country.id,
      name: country.nome,
      relation: country.id === 'arg' ? 50 : country.id === 'chn' ? 5 : country.id === 'usa' ? -10 : ((country.id.charCodeAt(0) * 7 + country.id.charCodeAt(1)) % 61) - 20,
      militaryPower: country.id === 'usa' ? 92 : country.id === 'chn' ? 88 : country.id === 'rus' ? 86 : Math.max(8, Math.min(76, Math.round((Math.log10(country.populacao_base) * 3) + (Math.log10(country.pib_base) * 1.5) - 20))),
      population: country.populacao_base,
      area_km2: country.area_km2,
      pib_base: country.pib_base,
      cash: Math.max(1_000_000_000, Math.round(country.pib_base * 0.015)),
      trait: country.trait,
      military: {
        exercito: { soldados: Math.max(2_000, Math.round(country.populacao_base * 0.00022)), blindados: Math.max(1, Math.floor(Math.log10(country.pib_base) - 6)) },
        marinha: { navios: Math.max(0, Math.floor(Math.log10(country.pib_base) - 9)) },
        aeronautica: { cacas: Math.max(1, Math.floor(Math.log10(country.pib_base) - 7)) },
      },
      tradeTreaty: false,
      alliance: false,
      atWar: false,
      sancionado_por_jogador: false,
    };
  };
  return {
    contacts: COUNTRIES.filter((country) => country.id !== playerId).map((country) => contact(createCountryProfile(country))),
    sanctionSeverity: 0,
    onuScore: 50,
    internationalSanctions: false,
    annexedCountryIds: [],
    peaceTreaty: null,
    league: null,
    tradeGrowthBonus: 0,
  };
}

export function alterarNotaONU(geopolitics, value) {
  const onuScore = clamp((Number(geopolitics.onuScore) || 50) + (Number(value) || 0), 0, 100);
  return { ...geopolitics, onuScore, internationalSanctions: onuScore < 25 };
}

export function sabotar(geopolitics, contactId, economy, seed, options = {}) {
  const contact = geopolitics.contacts.find((item) => item.id === contactId);
  if (!contact) return { ok: false, reason: 'Pais nao encontrado.', geopolitics, economy, seed };
  const cost = Math.max(500_000_000, economy.gdp * 0.0005);
  if (economy.cash < cost) return { ok: false, reason: 'Caixa insuficiente para a operacao.', geopolitics, economy, seed };
  const random = nextRandom(seed);
  const discovered = options.guaranteedSuccess ? false : random.value < 0.45;
  const updated = updateContact(geopolitics, contactId, (item) => discovered
    ? { ...item, relation: -100 }
    : { ...item, militaryPower: Math.max(1, item.militaryPower - 8) });
  return {
    ok: true,
    discovered,
    reason: discovered ? 'Sabotagem descoberta: crise diplomatica instalada.' : 'Sabotagem executada sem atribuicao publica.',
    geopolitics: alterarNotaONU(updated, discovered ? -22 : -4),
    economy: { ...economy, cash: economy.cash - cost },
    seed: random.seed,
  };
}

function rejected(geopolitics, reason) {
  return { ok: false, reason, geopolitics };
}

export function proposeTradeTreaty(geopolitics, contactId) {
  const contact = geopolitics.contacts.find((item) => item.id === contactId);
  if (!contact) return rejected(geopolitics, 'Pais nao encontrado.');
  if (contact.atWar) return rejected(geopolitics, 'Nao e possivel negociar durante uma guerra.');
  if (contact.relation <= 30) return rejected(geopolitics, 'Relacao diplomatica insuficiente para o acordo comercial.');
  if (contact.tradeTreaty) return rejected(geopolitics, 'Acordo comercial ja esta em vigor.');
  return {
    ok: true,
    reason: `Acordo comercial firmado com ${contact.name}.`,
    geopolitics: alterarNotaONU({
      ...updateContact(geopolitics, contactId, (item) => ({ ...item, tradeTreaty: true, relation: clamp(item.relation + 6, -100, 100) })),
      tradeGrowthBonus: (Number(geopolitics.tradeGrowthBonus) || 0) + 0.005,
    }, 1),
  };
}

export function proposeAlliance(geopolitics, contactId) {
  const contact = geopolitics.contacts.find((item) => item.id === contactId);
  if (!contact) return rejected(geopolitics, 'Pais nao encontrado.');
  if (contact.atWar) return rejected(geopolitics, 'Nao e possivel formar alianca durante uma guerra.');
  if (!contact.tradeTreaty || contact.relation <= 45) return rejected(geopolitics, 'Alianca exige acordo comercial e relacao acima de 45.');
  if (contact.alliance) return rejected(geopolitics, 'Alianca ja esta em vigor.');
  return {
    ok: true,
    reason: `Alianca defensiva firmada com ${contact.name}.`,
    geopolitics: updateContact(geopolitics, contactId, (item) => ({ ...item, alliance: true, relation: clamp(item.relation + 6, -100, 100) })),
  };
}

export function declareWar(geopolitics, contactId) {
  const contact = geopolitics.contacts.find((item) => item.id === contactId);
  if (!contact) return rejected(geopolitics, 'Pais nao encontrado.');
  if (contact.anexado) return rejected(geopolitics, 'Este territorio ja foi anexado.');
  if (contact.atWar) return rejected(geopolitics, 'Conflito ja esta em curso.');
  return {
    ok: true,
    reason: `Guerra declarada contra ${contact.name}.`,
    geopolitics: updateContact(geopolitics, contactId, (item) => ({ ...item, atWar: true, alliance: false, relation: -100 })),
  };
}

export function exigirAnexacao(geopolitics, contactId, playerPower, seed) {
  const contact = geopolitics.contacts.find((item) => item.id === contactId);
  if (!contact || contact.anexado) return { ok: false, accepted: false, reason: 'Pais nao encontrado ou ja anexado.', geopolitics, seed };
  const ratio = Number(playerPower) / Math.max(1, Number(contact.militaryPower) || 1);
  if (ratio < 5) return { ok: false, accepted: false, reason: 'Ultimato exige poder militar cinco vezes superior ao alvo.', geopolitics, seed };
  const random = nextRandom(seed);
  const chance = clamp(0.55 + ((ratio - 5) * 0.05), 0.55, 0.9);
  if (random.value < chance) {
    return {
      ok: true,
      accepted: true,
      reason: `${contact.name} aceitou a anexacao sob ultimato.`,
      geopolitics: updateContact(geopolitics, contactId, (item) => ({ ...item, militaryPower: 0 })),
      seed: random.seed,
    };
  }
  const war = declareWar(geopolitics, contactId);
  return { ok: war.ok, accepted: false, reason: `${contact.name} recusou o ultimato; guerra declarada.`, geopolitics: war.geopolitics, seed: random.seed };
}

export function imporSancao(geopolitics, contactId, playerGdp) {
  if (Number(playerGdp) < 1_000_000_000_000) return rejected(geopolitics, 'Sancoes exigem um PIB de ao menos R$ 1 tri.');
  const contact = geopolitics.contacts.find((item) => item.id === contactId);
  if (!contact || contact.anexado) return rejected(geopolitics, 'Pais nao encontrado ou ja anexado.');
  if (contact.sancionado_por_jogador) return rejected(geopolitics, 'Sancoes ja estao ativas contra este alvo.');
  return {
    ok: true,
    reason: `Sancoes impostas a ${contact.name}; seu crescimento economico foi comprometido.`,
    geopolitics: updateContact(geopolitics, contactId, (item) => ({ ...item, sancionado_por_jogador: true, growthModifier: -0.03, relation: -100 })),
  };
}

export function createLeague(geopolitics, playerId, economy, name) {
  const cost = 25_000_000_000;
  if (geopolitics.league) return { ok: false, reason: 'Uma liga global ja existe.', geopolitics, economy };
  if (geopolitics.onuScore < 40) return { ok: false, reason: 'A criacao da liga exige reputacao ONU de ao menos 40.', geopolitics, economy };
  if ((Number(economy.cash) || 0) < cost) return { ok: false, reason: 'Caixa insuficiente para criar a liga.', geopolitics, economy };
  return {
    ok: true,
    reason: `${name} foi fundada.`,
    geopolitics: { ...geopolitics, league: { name, leaderId: playerId, memberIds: [] } },
    economy: { ...economy, cash: economy.cash - cost },
  };
}

function treatyTarget(state) {
  const treaty = state.geopolitics?.peaceTreaty;
  if (!treaty || treaty.status !== 'pending') return null;
  return state.geopolitics.contacts.find((contact) => contact.id === treaty.targetId && !contact.destruido) ?? null;
}

export function checarFimDeGuerra(state, alvoId) {
  const target = state.geopolitics?.contacts.find((contact) => contact.id === alvoId);
  if (!target || target.destruido || Number(target.militaryPower) > 0) return state;
  return {
    ...state,
    geopolitics: {
      ...state.geopolitics,
      peaceTreaty: state.geopolitics.peaceTreaty ?? { targetId: alvoId, status: 'pending' },
      contacts: state.geopolitics.contacts.map((contact) => contact.id === alvoId ? { ...contact, atWar: false, militaryPower: 0 } : contact),
    },
  };
}

export function anexarPais(state) {
  const target = treatyTarget(state);
  if (!target || Number(target.militaryPower) > 0) return { ...state, notice: 'Anexacao exige um tratado de paz pendente com alvo derrotado.' };
  const population = (Number(state.country.populacao) || Number(state.country.populacao_base) || 0) + (Number(target.populacao_base) || Number(target.population) || 0);
  const area = (Number(state.country.area_km2) || 0) + (Number(target.area_km2) || 0);
  const gdp = (Number(state.country.pib_base) || 0) + (Number(target.pib_base) || 0);
  const cash = Math.max(0, Number(target.cash) || 0);
  const playerMilitary = state.military ?? {};
  const targetMilitary = target.military ?? {};
  const military = {
    ...playerMilitary,
    exercito: {
      ...(playerMilitary.exercito ?? {}),
      soldados: (Number(playerMilitary.exercito?.soldados) || 0) + (Number(targetMilitary.exercito?.soldados) || 0),
      blindados: (Number(playerMilitary.exercito?.blindados) || 0) + (Number(targetMilitary.exercito?.blindados) || 0),
    },
    marinha: { ...(playerMilitary.marinha ?? {}), navios: (Number(playerMilitary.marinha?.navios) || 0) + (Number(targetMilitary.marinha?.navios) || 0) },
    aeronautica: { ...(playerMilitary.aeronautica ?? {}), cacas: (Number(playerMilitary.aeronautica?.cacas) || 0) + (Number(targetMilitary.aeronautica?.cacas) || 0) },
  };
  const geopolitics = alterarNotaONU({
    ...state.geopolitics,
    annexedCountryIds: [...new Set([...(state.geopolitics.annexedCountryIds ?? []), target.id])],
    peaceTreaty: null,
    contacts: state.geopolitics.contacts.map((contact) => contact.id === target.id
      ? { ...contact, anexado: true, destruido: true, atWar: false, alliance: false, tradeTreaty: false, militaryPower: 0, population: 0, populacao_base: 0, area_km2: 0, pib_base: 0, cash: 0 }
      : contact),
  }, -45);
  return {
    ...state,
    country: { ...state.country, area_km2: area, populacao: population, populacao_base: population, pib_base: gdp },
    economy: { ...state.economy, gdp: state.economy.gdp + (Number(target.pib_base) || 0), cash: state.economy.cash + cash },
    military,
    geopolitics,
    notice: `${target.name} foi anexado; a ONU condenou a medida.`,
  };
}

export function saquearTesouro(state) {
  const target = treatyTarget(state);
  if (!target || Number(target.militaryPower) > 0) return { ...state, notice: 'Saque exige um tratado de paz pendente com alvo derrotado.' };
  const loot = Math.round(Math.max(0, Number(target.cash) || 0) * 0.8);
  const geopolitics = alterarNotaONU({
    ...state.geopolitics,
    peaceTreaty: null,
    contacts: state.geopolitics.contacts.map((contact) => contact.id === target.id ? { ...contact, cash: Math.max(0, contact.cash - loot), relation: -100, atWar: false } : contact),
  }, -8);
  return { ...state, economy: { ...state.economy, cash: state.economy.cash + loot }, geopolitics, notice: `${target.name} foi saqueado; recursos foram transferidos ao Tesouro.` };
}

export function criarLiga(state, nome = 'Liga Global') {
  const result = createLeague(state.geopolitics, state.country.id, state.economy, nome);
  return { ...state, geopolitics: result.geopolitics, economy: result.economy, notice: result.reason };
}

export function inviteToLeague(geopolitics, contactId) {
  const contact = geopolitics.contacts.find((item) => item.id === contactId);
  const league = geopolitics.league;
  if (!league || !contact || contact.destruido) return rejected(geopolitics, 'Liga ou pais convidado invalido.');
  if (contact.relation <= 80) return rejected(geopolitics, 'Convite exige relacao diplomatica acima de 80.');
  if (league.memberIds.includes(contactId)) return rejected(geopolitics, 'Pais ja participa da liga.');
  return { ok: true, reason: `${contact.name} entrou na ${league.name}.`, geopolitics: { ...geopolitics, league: { ...league, memberIds: [...league.memberIds, contactId] } } };
}

export function getGeopoliticalModifiers(geopolitics, military) {
  const treatyCount = geopolitics.contacts.filter((contact) => contact.tradeTreaty && !contact.atWar).length;
  const warCount = geopolitics.contacts.filter((contact) => contact.atWar).length;
  const nuclear = military?.nuclear ?? {};
  return {
    tradeRevenueRate: geopolitics.internationalSanctions ? 0 : treatyCount * 0.002,
    growthModifier: (Number(geopolitics.tradeGrowthBonus) || 0) + (treatyCount * 0.00035) + (nuclear.civilOnline ? 0.0007 : 0) - (geopolitics.sanctionSeverity * 0.0015) - (geopolitics.internationalSanctions ? 0.012 : 0),
    infrastructureCostModifier: nuclear.civilOnline ? -0.1 : 0,
    popularityModifier: (treatyCount * 0.03) - (warCount * 0.35),
  };
}

export function advanceGeopolitics(geopolitics, military, economy, seed) {
  let random = nextRandom(seed);
  let militaryPowerLoss = 0;
  let popularityDelta = 0;
  const events = [];
  const cashCost = economy.gdp / 12 * 0.006;
  let cash = economy.cash;
  let peaceTreaty = geopolitics.peaceTreaty ?? null;

  const contacts = geopolitics.contacts.map((contact) => {
    if (!contact.atWar) return contact;
    cash -= cashCost;
    const alliedPower = geopolitics.contacts
      .filter((candidate) => candidate.alliance && !candidate.atWar)
      .reduce((total, candidate) => total + (candidate.militaryPower * 0.08), 0);
    const playerScore = (military.power * (military.equipmentMultiplier ?? 1)) + alliedPower + ((random.value - 0.5) * 12);
    random = nextRandom(random.seed);
    const won = playerScore >= contact.militaryPower;
    militaryPowerLoss += won ? 0.8 : 2.4;
    popularityDelta += won ? 0.45 : -0.8;
    events.push(won ? `Vitoria taticas contra ${contact.name}.` : `Reves militar contra ${contact.name}.`);
    if (!won) return { ...contact, relation: -100 };
    const damage = Math.max(2, Math.round((playerScore / Math.max(1, contact.militaryPower)) * 4));
    const militaryPower = Math.max(0, contact.militaryPower - damage);
    if (militaryPower === 0 && !peaceTreaty) {
      peaceTreaty = { targetId: contact.id, status: 'pending' };
      events.push(`${contact.name} foi derrotado; tratado de paz pendente.`);
    }
    return { ...contact, relation: -85, atWar: militaryPower > 0, militaryPower };
  });

  return {
    geopolitics: {
      ...geopolitics,
      contacts,
      peaceTreaty,
      sanctionSeverity: Math.max(0, geopolitics.sanctionSeverity - 0.015),
    },
    economy: { ...economy, cash, popularity: clamp(economy.popularity + popularityDelta, 0, 100) },
    militaryDelta: { powerLoss: militaryPowerLoss, supportDelta: popularityDelta * 0.35 },
    seed: random.seed,
    events,
  };
}
