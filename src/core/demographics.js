import { getFactionSupport } from './factions.js';

function isAtWarPlayer(state) {
  return Boolean(state.geopolitics.playerAtWar);
}

function refugeeDestination(state, source) {
  if (!isAtWarPlayer(state) && Number(source.relation) >= 20) return { type: 'player' };
  const contacts = state.geopolitics.contacts
    .filter((contact) => contact.id !== source.id && !contact.destruido && !contact.anexado && !contact.atWar)
    .sort((left, right) => (Number(right.relation) || 0) - (Number(left.relation) || 0));
  return contacts.length ? { type: 'contact', id: contacts[0].id } : null;
}

function unstablePlayer(state) {
  return ['dictatorship', 'communist_dictatorship'].includes(state.regime?.type) || getFactionSupport(state.factions) < 20;
}

function unstableContact(contact) {
  return ['dictatorship', 'communist_dictatorship'].includes(contact.regime) || Number(contact.stability) < 20;
}

export function processarMigracoes(state) {
  let country = { ...state.country };
  let economy = { ...state.economy };
  let factions = { ...state.factions };
  let contacts = state.geopolitics.contacts.map((contact) => ({ ...contact }));
  for (const source of [...contacts]) {
    if (!source.atWar && !source.civilWar && !source.warReparations && !source.reparations_to) continue;
    const population = Number(source.population ?? source.populacao_base) || 0;
    const refugees = Math.floor(population * 0.0005);
    if (!refugees) continue;
    const destination = refugeeDestination({ ...state, geopolitics: { ...state.geopolitics, contacts } }, source);
    contacts = contacts.map((contact) => contact.id === source.id
      ? { ...contact, population: Math.max(0, population - refugees), populacao_base: Math.max(0, (Number(contact.populacao_base) || population) - refugees) }
      : contact);
    if (destination?.type === 'player') {
      country = { ...country, populacao: (Number(country.populacao) || 0) + refugees, populacao_base: (Number(country.populacao_base) || 0) + refugees };
      economy = { ...economy, gdp: Math.max(1, Math.round(economy.gdp * 0.999)) };
      factions = { ...factions, trabalhadores: Math.max(0, factions.trabalhadores - 0.4), religiosos: Math.max(0, factions.religiosos - 0.2) };
    } else if (destination) {
      contacts = contacts.map((contact) => contact.id === destination.id
        ? { ...contact, population: (Number(contact.population) || 0) + refugees, populacao_base: (Number(contact.populacao_base) || 0) + refugees, pib_base: Math.max(1, Math.round(contact.pib_base * 0.999)), migrationStrain: (Number(contact.migrationStrain) || 0) + refugees }
        : contact);
    }
  }
  const receivers = contacts.filter((contact) => !contact.destruido && ['tech_giant', 'financial_hub'].includes(contact.trait));
  const transferBrainDrain = (amount, sourceId = null) => {
    if (!amount || !receivers.length) return;
    const receiver = receivers.find((contact) => contact.id !== sourceId) ?? receivers[0];
    contacts = contacts.map((contact) => contact.id === receiver.id ? { ...contact, pib_base: contact.pib_base + amount } : contact);
  };
  if (unstablePlayer(state)) {
    const loss = Math.floor((Number(country.pib_base) || 0) * 0.0002);
    country = { ...country, pib_base: Math.max(1, country.pib_base - loss) };
    economy = { ...economy, gdp: Math.max(1, economy.gdp - loss) };
    transferBrainDrain(loss);
  }
  for (const contact of [...contacts]) {
    if (!unstableContact(contact)) continue;
    const loss = Math.floor((Number(contact.pib_base) || 0) * 0.0002);
    contacts = contacts.map((candidate) => candidate.id === contact.id ? { ...candidate, pib_base: Math.max(1, candidate.pib_base - loss) } : candidate);
    transferBrainDrain(loss, contact.id);
  }
  return { ...state, country, economy, factions, geopolitics: { ...state.geopolitics, contacts } };
}
