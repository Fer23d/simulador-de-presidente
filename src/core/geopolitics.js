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

export function createGeopolitics() {
  return {
    contacts: [
      { id: 'usa', name: 'Estados Unidos', relation: -10, militaryPower: 92, tradeTreaty: false, alliance: false, atWar: false },
      { id: 'chn', name: 'China', relation: 5, militaryPower: 88, tradeTreaty: false, alliance: false, atWar: false },
      { id: 'arg', name: 'Argentina', relation: 50, militaryPower: 24, tradeTreaty: false, alliance: false, atWar: false },
    ],
    sanctionSeverity: 0,
    onuScore: 50,
    internationalSanctions: false,
  };
}

export function alterarNotaONU(geopolitics, value) {
  const onuScore = clamp((Number(geopolitics.onuScore) || 50) + (Number(value) || 0), 0, 100);
  return { ...geopolitics, onuScore, internationalSanctions: onuScore < 25 };
}

export function sabotar(geopolitics, contactId, economy, seed) {
  const contact = geopolitics.contacts.find((item) => item.id === contactId);
  if (!contact) return { ok: false, reason: 'Pais nao encontrado.', geopolitics, economy, seed };
  const cost = Math.max(500_000_000, economy.gdp * 0.0005);
  if (economy.cash < cost) return { ok: false, reason: 'Caixa insuficiente para a operacao.', geopolitics, economy, seed };
  const random = nextRandom(seed);
  const discovered = random.value < 0.45;
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
  if (contact.relation <= 20) return rejected(geopolitics, 'Relacao diplomatica insuficiente para o acordo comercial.');
  if (contact.tradeTreaty) return rejected(geopolitics, 'Acordo comercial ja esta em vigor.');
  return {
    ok: true,
    reason: `Acordo comercial firmado com ${contact.name}.`,
    geopolitics: updateContact(geopolitics, contactId, (item) => ({ ...item, tradeTreaty: true, relation: clamp(item.relation + 4, -100, 100) })),
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
  if (contact.atWar) return rejected(geopolitics, 'Conflito ja esta em curso.');
  return {
    ok: true,
    reason: `Guerra declarada contra ${contact.name}.`,
    geopolitics: updateContact(geopolitics, contactId, (item) => ({ ...item, atWar: true, alliance: false, relation: -100 })),
  };
}

export function getGeopoliticalModifiers(geopolitics, military) {
  const treatyCount = geopolitics.contacts.filter((contact) => contact.tradeTreaty && !contact.atWar).length;
  const warCount = geopolitics.contacts.filter((contact) => contact.atWar).length;
  const nuclear = military?.nuclear ?? {};
  return {
    tradeRevenueRate: geopolitics.internationalSanctions ? 0 : treatyCount * 0.002,
    growthModifier: (treatyCount * 0.00035) + (nuclear.civilOnline ? 0.0007 : 0) - (geopolitics.sanctionSeverity * 0.0015) - (geopolitics.internationalSanctions ? 0.012 : 0),
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
    return won
      ? { ...contact, relation: -85, militaryPower: Math.max(1, contact.militaryPower - 2) }
      : { ...contact, relation: -100 };
  });

  return {
    geopolitics: {
      ...geopolitics,
      contacts,
      sanctionSeverity: Math.max(0, geopolitics.sanctionSeverity - 0.015),
    },
    economy: { ...economy, cash, popularity: clamp(economy.popularity + popularityDelta, 0, 100) },
    militaryDelta: { powerLoss: militaryPowerLoss, supportDelta: popularityDelta * 0.35 },
    seed: random.seed,
    events,
  };
}
