// Catalogo de equipamentos militares por setor: custo (caixa + aco) e poder de fogo. Dados puros.
// "strategic": ativo estrategico (submarino nuclear, porta-avioes, bombardeiro furtivo): nao se doa a aliados,
//   so pode ser posicionado em territorio seu. "requires": tecnologia militar que precisa estar liberada.
// Navios so existem para quem tem saida para o mar: pais sem litoral nao compra nem recebe equipamento naval.
const B = 1_000_000_000;

const item = (id, branch, name, cost, steel, firepower, extra = {}) => Object.freeze({ id, branch, name, cost: cost * B, steel, firepower, ...extra });

export const EQUIPMENT_BRANCHES = Object.freeze({
  exercito: Object.freeze({ id: 'exercito', label: 'Exército', icon: '🪖' }),
  marinha: Object.freeze({ id: 'marinha', label: 'Marinha', icon: '⚓' }),
  aeronautica: Object.freeze({ id: 'aeronautica', label: 'Aeronáutica', icon: '✈️' }),
});

export const EQUIPMENT_LIST = Object.freeze([
  // Exército
  item('ifv', 'exercito', 'Blindado de infantaria (CV90)', 1.5, 800, 0.9),
  item('mbt_leopard', 'exercito', 'Carro de combate Leopard 2A7', 5, 2500, 2.2),
  item('mbt_abrams', 'exercito', 'Carro de combate M1A2 Abrams', 6, 3000, 2.8),
  item('artillery', 'exercito', 'Artilharia autopropulsada PzH 2000', 2, 1200, 1.2),
  item('himars', 'exercito', 'Lançador de foguetes HIMARS', 3, 900, 1.8),
  item('sam_patriot', 'exercito', 'Defesa antiaérea Patriot', 4, 1200, 2.0),
  item('apache', 'exercito', 'Helicóptero de ataque AH-64 Apache', 5, 800, 2.6),
  item('special_forces', 'exercito', 'Brigada de forças especiais', 3, 200, 1.5),
  item('tactical_missile', 'exercito', 'Míssil balístico tático Iskander', 6, 600, 3.0, { requires: 'missiles' }),
  // Marinha
  item('corvette', 'marinha', 'Corveta', 3, 4000, 1.4, { naval: true }),
  item('frigate', 'marinha', 'Fragata multimissão', 6, 7000, 2.6, { naval: true }),
  item('destroyer', 'marinha', 'Destróier Arleigh Burke', 10, 11000, 4.6, { naval: true }),
  item('diesel_sub', 'marinha', 'Submarino convencional', 7, 6000, 3.2, { naval: true }),
  item('cruiser', 'marinha', 'Cruzador de mísseis', 14, 14000, 6.0, { naval: true }),
  item('amphibious', 'marinha', 'Navio de assalto anfíbio', 9, 10000, 3.6, { naval: true }),
  item('nuclear_sub', 'marinha', 'Submarino nuclear Virginia', 22, 14000, 8.5, { naval: true, strategic: true, requires: 'nuke' }),
  item('carrier', 'marinha', 'Porta-aviões Gerald R. Ford', 60, 60000, 22, { naval: true, strategic: true }),
  // Aeronáutica
  item('drone', 'aeronautica', 'Drone de combate MQ-9 Reaper', 1.5, 200, 0.9),
  item('transport', 'aeronautica', 'Transporte tático C-130', 2, 500, 0.6),
  item('f16', 'aeronautica', 'Caça F-16 Fighting Falcon', 4, 1000, 2.4),
  item('eurofighter', 'aeronautica', 'Caça Eurofighter Typhoon', 6, 1200, 3.4),
  item('f35', 'aeronautica', 'Caça furtivo F-35 Lightning II', 9, 1500, 5.2),
  item('su57', 'aeronautica', 'Caça furtivo Su-57', 11, 1600, 7.0),
  item('f22', 'aeronautica', 'Caça de superioridade F-22 Raptor', 14, 1800, 8.2),
  item('awacs', 'aeronautica', 'Alerta aéreo antecipado E-3 AWACS', 8, 900, 3.0),
  item('b2', 'aeronautica', 'Bombardeiro furtivo B-2 Spirit', 35, 3000, 14, { strategic: true, requires: 'missiles' }),
]);

export const EQUIPMENT = Object.freeze(Object.fromEntries(EQUIPMENT_LIST.map((entry) => [entry.id, entry])));

// Fracao do custo gasta por mes para manter cada unidade.
export const EQUIPMENT_UPKEEP_RATE = 0.0015;

// Paises sem saida para o mar (os do Mar Cáspio, que tem marinha propria, ficam de fora da lista).
export const LANDLOCKED = Object.freeze(new Set([
  'afg', 'and', 'arm', 'aut', 'blr', 'btn', 'bol', 'bwa', 'bfa', 'bdi', 'caf', 'tcd', 'cze', 'eth', 'swz', 'hun', 'kgz', 'lao', 'lso',
  'lie', 'lux', 'mwi', 'mli', 'mda', 'mng', 'npl', 'mkd', 'ner', 'pry', 'rwa', 'smr', 'srb', 'svk', 'ssd', 'tjk', 'uga', 'uzb', 'vat', 'che',
  'zmb', 'zwe', 'xkx',
]));

export function isLandlocked(countryId) {
  return LANDLOCKED.has(countryId);
}

export function normalizeEquipmentMap(value) {
  const result = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  for (const [id, quantity] of Object.entries(value)) {
    const count = Math.max(0, Math.floor(Number(quantity) || 0));
    if (EQUIPMENT[id] && count > 0) result[id] = count;
  }
  return result;
}

export function normalizeEquipmentAbroad(value) {
  const result = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  for (const [contactId, map] of Object.entries(value)) {
    const clean = normalizeEquipmentMap(map);
    if (Object.keys(clean).length) result[contactId] = clean;
  }
  return result;
}

export function sumFirepower(map) {
  return Object.entries(map ?? {}).reduce((total, [id, count]) => total + ((EQUIPMENT[id]?.firepower ?? 0) * (Number(count) || 0)), 0);
}

export function sumUpkeep(map) {
  return Object.entries(map ?? {}).reduce((total, [id, count]) => total + ((EQUIPMENT[id]?.cost ?? 0) * EQUIPMENT_UPKEEP_RATE * (Number(count) || 0)), 0);
}
