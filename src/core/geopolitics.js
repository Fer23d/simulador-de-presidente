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
      tipo_governo: country.tipo_governo,
      relation: country.id === 'arg' ? 50 : country.id === 'chn' ? 5 : country.id === 'usa' ? -10 : ((country.id.charCodeAt(0) * 7 + country.id.charCodeAt(1)) % 61) - 20,
      militaryPower: country.id === 'usa' ? 92 : country.id === 'chn' ? 88 : country.id === 'rus' ? 86 : Math.max(8, Math.min(76, Math.round((Math.log10(country.populacao_base) * 3) + (Math.log10(country.pib_base) * 1.5) - 20))),
      population: country.populacao_base,
      area_km2: country.area_km2,
      pib_base: country.pib_base,
      cash: Math.max(1_000_000_000, Math.round(country.pib_base * 0.015)),
      uranium: country.uranium,
      steel: country.steel,
      rare_earths: country.rare_earths,
      cyber_defense: country.trait === 'tech_giant' ? 70 : country.trait === 'financial_hub' ? 55 : country.trait === 'military_tradition' ? 45 : 30,
      nuclearWeapons: ['chn', 'fra', 'gbr', 'ind', 'isr', 'pak', 'prk', 'rus', 'usa'].includes(country.id) ? 1 : 0,
      trait: country.trait,
      military: {
        exercito: { soldados: Math.max(2_000, Math.round(country.populacao_base * 0.00022)), blindados: Math.max(1, Math.floor(Math.log10(country.pib_base) - 6)) },
        marinha: { navios: Math.max(0, Math.floor(Math.log10(country.pib_base) - 9)) },
        aeronautica: { cacas: Math.max(1, Math.floor(Math.log10(country.pib_base) - 7)) },
      },
      tradeTreaty: false,
      alliance: false,
      atWar: false,
      atWarAgainst: null,
      warInitiator: null,
      defensiveWar: false,
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

const RESOURCE_PRICES = Object.freeze({ uranium: 15_000_000, steel: 500_000, rare_earths: 6_000_000 });

export function importarRecursos(geopolitics, economy, country, contactId, resource, amount) {
  const quantity = Math.max(1, Math.floor(Number(amount) || 0));
  const price = RESOURCE_PRICES[resource];
  const contact = geopolitics.contacts.find((item) => item.id === contactId && !item.destruido && !item.anexado);
  if (!price || !contact) return { ok: false, reason: 'Recurso ou pais fornecedor invalido.', geopolitics, economy, country };
  if (contact.atWar || contact.relation <= 20) return { ok: false, reason: 'Importacao exige paz e relacao diplomatica acima de 20.', geopolitics, economy, country };
  if ((Number(contact[resource]) || 0) < quantity) return { ok: false, reason: `${contact.name} nao possui estoque suficiente.`, geopolitics, economy, country };
  const cost = quantity * price;
  if ((Number(economy.cash) || 0) < cost) return { ok: false, reason: 'Caixa insuficiente para a importacao.', geopolitics, economy, country };
  return {
    ok: true,
    reason: `${quantity.toLocaleString('pt-BR')} unidades de ${resource} importadas de ${contact.name}.`,
    geopolitics: {
      ...geopolitics,
      contacts: geopolitics.contacts.map((item) => item.id === contactId ? { ...item, [resource]: item[resource] - quantity, cash: item.cash + cost, relation: clamp(item.relation + 1, -100, 100) } : item),
    },
    economy: { ...economy, cash: economy.cash - cost },
    country: { ...country, [resource]: (Number(country[resource]) || 0) + quantity },
  };
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
  if (!contact.tradeTreaty || contact.relation < 50) return rejected(geopolitics, 'Alianca exige acordo comercial e relacao de ao menos 50.');
  if (contact.alliance) return rejected(geopolitics, 'Alianca ja esta em vigor.');
  return {
    ok: true,
    reason: `Alianca defensiva firmada com ${contact.name}.`,
    geopolitics: updateContact(geopolitics, contactId, (item) => ({ ...item, alliance: true, relation: clamp(item.relation + 6, -100, 100) })),
  };
}

export function declareWar(geopolitics, contactId, attackerId = 'player') {
  const contact = geopolitics.contacts.find((item) => item.id === contactId);
  if (!contact) return rejected(geopolitics, 'Pais nao encontrado.');
  if (contact.anexado) return rejected(geopolitics, 'Este territorio ja foi anexado.');
  if (contact.atWar) return rejected(geopolitics, 'Conflito ja esta em curso.');
  return {
    ok: true,
    reason: `Guerra declarada contra ${contact.name}.`,
    geopolitics: updateContact(geopolitics, contactId, (item) => ({ ...item, atWar: true, atWarAgainst: attackerId, warInitiator: attackerId, defensiveWar: false, alliance: false, relation: -100 })),
  };
}

export function insultarNacao(geopolitics, contactId, seed) {
  const target = geopolitics.contacts.find((contact) => contact.id === contactId);
  if (!target || target.destruido || target.anexado || target.wasteland) {
    return { ok: false, reason: 'Nacao invalida para provocacao diplomatica.', geopolitics, seed };
  }
  if (target.atWar) return { ok: false, reason: 'Nao se insulta uma nacao ja em guerra; o conflito ja fala por si.', geopolitics, seed };
  const random = nextRandom(seed);
  const relation = clamp((Number(target.relation) || 0) - 30, -100, 100);
  const retaliation = relation < 15 && random.value < 0.5;
  const updated = updateContact(geopolitics, contactId, (item) => ({
    ...item,
    relation,
    atWar: retaliation,
    atWarAgainst: retaliation ? 'player' : item.atWarAgainst,
    warInitiator: retaliation ? item.id : item.warInitiator,
    defensiveWar: retaliation,
    alliance: retaliation ? false : item.alliance,
  }));
  return {
    ok: true,
    retaliation,
    target: { id: target.id, name: target.name },
    seed: random.seed,
    geopolitics: updated,
    reason: retaliation
      ? `${target.name} declarou guerra apos o insulto.`
      : `${target.name} recebeu o insulto e recuou por enquanto.`,
  };
}

export function processarAgressaoIA(state, probability = 0.03) {
  let random = nextRandom(state.randomSeed);
  let nuclearAttack = null;
  let firstAttack = null;
  const contacts = state.geopolitics.contacts.map((contact) => {
    if (contact.destruido || contact.anexado || contact.wasteland || contact.atWar) return contact;
    const hatesPlayer = (Number(contact.relation) || 0) < 20;
    if (!hatesPlayer) {
      random = nextRandom(random.seed);
      return contact;
    }
    if (state.global_defcon === 1 && Number(contact.nuclearWeapons) > 0 && (Number(contact.relation) || 0) < 0) {
      nuclearAttack = contact;
      return {
        ...contact,
        atWar: true,
        atWarAgainst: state.country.id,
        warInitiator: contact.id,
        defensiveWar: true,
        nuclearStrikeIncoming: true,
        relation: -100,
      };
    }
    const attacks = random.value < probability;
    random = nextRandom(random.seed);
    if (!attacks) return contact;
    if (!firstAttack) firstAttack = contact;
    return {
      ...contact,
      atWar: true,
      atWarAgainst: state.country.id,
      warInitiator: contact.id,
      defensiveWar: true,
      relation: -100,
    };
  });
  const alertTarget = nuclearAttack ?? firstAttack;
  return {
    ...state,
    geopolitics: { ...state.geopolitics, contacts },
    world: contacts,
    randomSeed: random.seed,
    pendingHostileAlert: alertTarget
      ? {
        type: nuclearAttack ? 'nuclear' : 'war',
        targetId: alertTarget.id,
        targetName: alertTarget.name,
        dismissed: false,
      }
      : state.pendingHostileAlert ?? null,
    notice: alertTarget
      ? (nuclearAttack ? `Ataque nuclear recebido de ${alertTarget.name}.` : `${alertTarget.name} declarou guerra contra nos.`)
      : state.notice,
    global_defcon: nuclearAttack ? 1 : state.global_defcon,
  };
}

export function interceptArticle5(state) {
  if (state.pendingAllianceInvocation) return state;
  const alliedIds = new Set([
    ...(state.player_alliance ?? []),
    ...(state.liga_membros ?? []),
    ...((state.geopolitics?.contacts ?? []).filter((contact) => contact.alliance).map((contact) => contact.id)),
  ]);
  const attackedAlly = (state.geopolitics?.contacts ?? []).find((contact) => (
    alliedIds.has(contact.id)
      && contact.atWar
      && contact.atWarAgainst
  ));
  if (!attackedAlly) return state;
  const attacker = state.geopolitics.contacts.find((contact) => contact.id === attackedAlly.atWarAgainst);
  return {
    ...state,
    pendingAllianceInvocation: {
      allyId: attackedAlly.id,
      allyName: attackedAlly.name,
      attackerId: attackedAlly.atWarAgainst,
      attackerName: attacker?.name ?? attackedAlly.atWarAgainst,
    },
    notice: `Artigo 5 invocado: ${attackedAlly.name} foi atacado por ${attacker?.name ?? 'um agressor estrangeiro'}.`,
  };
}

export function respondArticle5(state, decision) {
  const pending = state.pendingAllianceInvocation;
  if (!pending) return { ...state, notice: 'Nao existe uma invocacao do Artigo 5 pendente.' };
  const ally = state.geopolitics.contacts.find((contact) => contact.id === pending.allyId);
  if (!ally) return { ...state, pendingAllianceInvocation: null, notice: 'O aliado nao esta mais disponivel.' };
  const attackerIsPlayer = pending.attackerId === state.country?.id || pending.attackerId === 'player';

  if (decision === 'verbal-condemnation') {
    const geopolitics = alterarNotaONU({
      ...state.geopolitics,
      contacts: state.geopolitics.contacts.map((contact) => contact.id === ally.id
        ? { ...contact, alliance: false, ...(attackerIsPlayer ? { atWar: false, atWarAgainst: null } : {}) }
        : contact),
    }, -30);
    return {
      ...state,
      geopolitics,
      player_alliance: (state.player_alliance ?? []).filter((id) => id !== ally.id),
      pendingAllianceInvocation: null,
      notice: `O governo abandonou ${ally.name}. A alianca foi rompida e a ONU registrou a traicao.`,
    };
  }

  if (decision !== 'send-troops' && decision !== 'fulfill-duty') {
    return { ...state, notice: 'Resposta do Artigo 5 invalida.' };
  }

  const troopCost = Math.max(1_000, Math.floor((Number(state.military?.exercito?.soldados) || 0) * 0.05));
  const cashCost = 5_000_000_000;
  if (decision === 'send-troops' && ((Number(state.military?.exercito?.soldados) || 0) < troopCost || (Number(state.economy?.cash) || 0) < cashCost)) {
    return { ...state, notice: 'Recursos insuficientes para enviar tropas ao front.' };
  }
  const geopolitics = {
    ...state.geopolitics,
    contacts: state.geopolitics.contacts.map((contact) => {
      if (attackerIsPlayer && contact.id === ally.id) return { ...contact, alliance: true, atWar: false, atWarAgainst: null, relation: decision === 'send-troops' ? 100 : contact.relation };
      if (!attackerIsPlayer && contact.id === pending.attackerId) return { ...contact, atWar: true, atWarAgainst: state.country.id, relation: -100 };
      if (contact.id === ally.id && decision === 'send-troops') return { ...contact, relation: 100 };
      return contact;
    }),
  };
  return {
    ...state,
    geopolitics,
    economy: decision === 'send-troops' ? { ...state.economy, cash: state.economy.cash - cashCost } : state.economy,
    military: decision === 'send-troops'
      ? { ...state.military, exercito: { ...state.military.exercito, soldados: state.military.exercito.soldados - troopCost } }
      : state.military,
    pendingAllianceInvocation: null,
    notice: attackerIsPlayer
      ? `A ordem de guerra contra ${ally.name} foi revertida pela alianca.`
      : decision === 'send-troops'
      ? `Tropas e caixa enviados para defender ${ally.name}. Guerra aberta contra ${pending.attackerName}.`
      : `${ally.name} foi defendido. O governo cumpre o dever sem mobilizacao adicional.`,
  };
}

export function isLegitimateDefenseTarget(state, targetId) {
  return Boolean(state?.just_war_target && state.just_war_target === targetId);
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
  const defensiveVictory = Boolean(state.geopolitics.peaceTreaty?.defensiveVictory || target.defensiveWar || target.warInitiator === target.id);
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
      ? { ...contact, anexado: true, destruido: true, atWar: false, alliance: false, tradeTreaty: false, militaryPower: 0, population: 0, populacao_base: 0, area_km2: 0, pib_base: 0, cash: 0, uranium: 0, steel: 0, rare_earths: 0 }
      : contact),
  }, isLegitimateDefenseTarget(state, target.id) || defensiveVictory ? 0 : -45);
  return {
    ...state,
    country: { ...state.country, area_km2: area, populacao: population, populacao_base: population, pib_base: gdp, uranium: (Number(state.country.uranium) || 0) + (Number(target.uranium) || 0), steel: (Number(state.country.steel) || 0) + (Number(target.steel) || 0), rare_earths: (Number(state.country.rare_earths) || 0) + (Number(target.rare_earths) || 0) },
    economy: { ...state.economy, gdp: state.economy.gdp + (Number(target.pib_base) || 0), cash: state.economy.cash + cash },
    military,
    geopolitics,
    notice: isLegitimateDefenseTarget(state, target.id) || defensiveVictory
      ? `${target.name} foi anexado sob alegacao de legitima defesa.`
      : `${target.name} foi anexado; a ONU condenou a medida.`,
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

export function estabelecerFantoche(state) {
  const target = treatyTarget(state);
  if (!target || Number(target.militaryPower) > 0) return { ...state, notice: 'Um governo fantoche exige um tratado de paz pendente.' };
  const defensiveVictory = Boolean(state.geopolitics.peaceTreaty?.defensiveVictory || target.defensiveWar || target.warInitiator === target.id);
  const geopolitics = alterarNotaONU({
    ...state.geopolitics,
    peaceTreaty: null,
    contacts: state.geopolitics.contacts.map((contact) => contact.id === target.id
      ? { ...contact, puppet: true, is_puppet_of: 'jogador', atWar: false, alliance: false, relation: 35, militaryPower: Math.max(1, Number(contact.militaryPower) || 1) }
      : contact),
  }, defensiveVictory ? 0 : -12);
  return {
    ...state,
    geopolitics,
    notice: `${target.name} aceitou um governo fantoche sob tutela presidencial.`,
  };
}

export function desmilitarizarPais(state) {
  const target = treatyTarget(state);
  if (!target || Number(target.militaryPower) > 0) return { ...state, notice: 'Desmilitarizacao exige tratado pendente com alvo derrotado.' };
  return {
    ...state,
    geopolitics: {
      ...state.geopolitics,
      peaceTreaty: null,
      contacts: state.geopolitics.contacts.map((contact) => contact.id === target.id
        ? { ...contact, atWar: false, militaryPower: 0, military: { exercito: { soldados: 0, blindados: 0 }, marinha: { navios: 0 }, aeronautica: { cacas: 0 } }, demilitarizedMonths: 120 }
        : contact),
    },
    notice: `${target.name} foi desmilitarizado por 120 meses.`,
  };
}

export function aplicarReparacoes(state) {
  const target = treatyTarget(state);
  if (!target || Number(target.militaryPower) > 0) return { ...state, notice: 'Reparacoes exigem tratado pendente com alvo derrotado.' };
  return {
    ...state,
    geopolitics: {
      ...state.geopolitics,
      peaceTreaty: null,
      contacts: state.geopolitics.contacts.map((contact) => contact.id === target.id
        ? { ...contact, atWar: false, relation: -100, warReparations: { rate: 0.15, remainingMonths: 120 } }
        : contact),
    },
    notice: `${target.name} pagara 15% da arrecadacao estimada por 120 meses.`,
  };
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
    factionModifier: (treatyCount * 0.03) - (warCount * 0.35),
  };
}

export function advanceGeopolitics(geopolitics, military, economy, seed) {
  let random = nextRandom(seed);
  let militaryPowerLoss = 0;
  let factionDelta = 0;
  const events = [];
  const cashCost = economy.gdp / 12 * 0.006;
  let cash = economy.cash;
  let peaceTreaty = geopolitics.peaceTreaty ?? null;

  const contacts = geopolitics.contacts.map((contact) => {
    let updated = contact;
    if (updated.warReparations?.remainingMonths > 0) {
      const estimatedRevenue = Math.max(0, Number(updated.pib_base) || 0) * 0.12 / 12;
      const payment = Math.min(Math.max(0, Number(updated.cash) || 0), estimatedRevenue * updated.warReparations.rate);
      cash += payment;
      updated = { ...updated, cash: updated.cash - payment, warReparations: { ...updated.warReparations, remainingMonths: updated.warReparations.remainingMonths - 1 } };
      if (updated.warReparations.remainingMonths <= 0) updated = { ...updated, warReparations: null };
    }
    if (updated.demilitarizedMonths > 0) updated = { ...updated, demilitarizedMonths: updated.demilitarizedMonths - 1 };
    if (!updated.atWar) return updated;
    cash -= cashCost;
    const alliedPower = geopolitics.contacts
      .filter((candidate) => candidate.alliance && !candidate.atWar)
      .reduce((total, candidate) => total + (candidate.militaryPower * 0.08), 0);
    const playerScore = (military.power * (military.equipmentMultiplier ?? 1)) + alliedPower + ((random.value - 0.5) * 12);
    random = nextRandom(random.seed);
    const won = playerScore >= updated.militaryPower;
    militaryPowerLoss += won ? 0.8 : 2.4;
    factionDelta += won ? 0.45 : -0.8;
    events.push(won ? `Vitoria taticas contra ${updated.name}.` : `Reves militar contra ${updated.name}.`);
    if (!won) return { ...updated, relation: -100 };
    const damage = Math.max(2, Math.round((playerScore / Math.max(1, updated.militaryPower)) * 4));
    const militaryPower = Math.max(0, updated.militaryPower - damage);
    if (militaryPower === 0 && !peaceTreaty) {
      peaceTreaty = {
        targetId: updated.id,
        status: 'pending',
        ...(updated.defensiveWar || updated.warInitiator === updated.id ? { defensiveVictory: true } : {}),
      };
      events.push(`${updated.name} foi derrotado; tratado de paz pendente.`);
    }
    return { ...updated, relation: -85, atWar: militaryPower > 0, militaryPower };
  });

  return {
    geopolitics: {
      ...geopolitics,
      contacts,
      peaceTreaty,
      sanctionSeverity: Math.max(0, geopolitics.sanctionSeverity - 0.015),
    },
    economy: { ...economy, cash },
    militaryDelta: { powerLoss: militaryPowerLoss, supportDelta: factionDelta * 0.35 },
    factionDelta,
    seed: random.seed,
    events,
  };
}
