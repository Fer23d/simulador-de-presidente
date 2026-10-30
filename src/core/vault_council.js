// Conselho do Vault: personagens recorrentes que transformam a sobrevivencia em campanha.
// Os vinculos sobrevivem ao save e sao usados por sistemas de producao, radiacao e seguranca.

export const COUNCIL_FIRST_TURN = 3;
export const COUNCIL_INTERVAL_TURNS = 6;

export const COUNCIL_LEADERS = Object.freeze({
  commander: Object.freeze({ name: 'Comandante Helena Voss', role: 'Segurança' }),
  medic: Object.freeze({ name: 'Dra. Ana Ribeiro', role: 'Ala Médica' }),
  engineer: Object.freeze({ name: 'Eng. Tomé Avelar', role: 'Infraestrutura' }),
});

export const COUNCIL_EVENTS = Object.freeze([
  Object.freeze({
    id: 'council-gate-protocol',
    kind: 'council',
    speaker: 'commander',
    title: 'O Preço da Porta Fechada',
    description: 'Helena Voss pousa três cartuchos vazios sobre a mesa. Ela quer armar cada vigia e fechar o acesso externo; a médica alerta que o gesto fará o Vault parecer uma prisão.',
    options: Object.freeze([
      Object.freeze({ id: 'council-arm-the-watch', label: '[ ARMAR A GUARDA ]', effects: Object.freeze({ weapons: 12, loyalty: -4 }), relationships: Object.freeze({ commander: 18, medic: -6 }) }),
      Object.freeze({ id: 'council-keep-the-door-human', label: '[ MANTER A PORTA HUMANA ]', effects: Object.freeze({ loyalty: 4 }), relationships: Object.freeze({ commander: -12, medic: 10 }) }),
    ]),
  }),
  Object.freeze({
    id: 'council-infirmary-triage',
    kind: 'council',
    speaker: 'medic',
    title: 'Nomes na Lista de Espera',
    description: 'A Dra. Ana Ribeiro mostra o quadro de triagem. Há curativos para poucos, não para todos. Ela pede prioridade aos doentes; Helena insiste que os guardas não podem baixar a guarda.',
    options: Object.freeze([
      Object.freeze({ id: 'council-open-the-infirmary', label: '[ ABRIR A ENFERMARIA: 2 CURATIVOS ]', cost: Object.freeze({ medkits: 2 }), effects: Object.freeze({ loyalty: 9 }), relationships: Object.freeze({ medic: 18, commander: -5 }) }),
      Object.freeze({ id: 'council-preserve-the-reserve', label: '[ PRESERVAR A RESERVA ]', effects: Object.freeze({ medkits: 1, loyalty: -5 }), relationships: Object.freeze({ medic: -14, commander: 7 }) }),
    ]),
  }),
  Object.freeze({
    id: 'council-power-grid',
    kind: 'council',
    speaker: 'engineer',
    title: 'A Rede que Não Dorme',
    description: 'Tomé Avelar encontrou um modo de estabilizar os geradores, mas pede sucata que poderia reforçar a porta. A luz do mapa pisca enquanto o Conselho aguarda sua ordem.',
    options: Object.freeze([
      Object.freeze({ id: 'council-rewire-grid', label: '[ REFAZER A REDE: 70 SUCATAS ]', cost: Object.freeze({ scrap: 70 }), effects: Object.freeze({ energy: 160 }), relationships: Object.freeze({ engineer: 18, commander: -5 }) }),
      Object.freeze({ id: 'council-ration-the-grid', label: '[ RACIONAR A ENERGIA ]', effects: Object.freeze({ energy: 45, loyalty: -7 }), relationships: Object.freeze({ engineer: -12, commander: 5 }) }),
    ]),
  }),
]);

const clampTrust = (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

export function createVaultCouncil(value = {}) {
  const relationships = value?.relationships ?? {};
  return {
    cursor: Math.max(0, Math.floor(Number(value?.cursor) || 0)) % COUNCIL_EVENTS.length,
    relationships: Object.fromEntries(Object.keys(COUNCIL_LEADERS).map((leader) => [leader, clampTrust(relationships[leader] ?? 50)])),
    lastEventId: typeof value?.lastEventId === 'string' ? value.lastEventId : null,
  };
}

export function isCouncilTurn(turn) {
  const month = Math.max(0, Math.floor(Number(turn) || 0));
  return month >= COUNCIL_FIRST_TURN && (month - COUNCIL_FIRST_TURN) % COUNCIL_INTERVAL_TURNS === 0;
}

export function getCouncilEvent(eventId) {
  return COUNCIL_EVENTS.find((event) => event.id === eventId) ?? null;
}

export function getNextCouncilEvent(council) {
  return COUNCIL_EVENTS[createVaultCouncil(council).cursor];
}

export function resolveCouncilChoice(council, event, option) {
  const current = createVaultCouncil(council);
  const relationships = { ...current.relationships };
  for (const [leader, delta] of Object.entries(option?.relationships ?? {})) {
    if (leader in relationships) relationships[leader] = clampTrust(relationships[leader] + Number(delta || 0));
  }
  return {
    cursor: (current.cursor + 1) % COUNCIL_EVENTS.length,
    relationships,
    lastEventId: event?.id ?? current.lastEventId,
  };
}

// Vinculos altos nao removem a dificuldade; so tornam a pessoa aliada mais util no seu proprio campo.
export function getCouncilModifiers(council) {
  const trust = createVaultCouncil(council).relationships;
  return {
    generatorMultiplier: trust.engineer >= 70 ? 1.1 : trust.engineer <= 25 ? .9 : 1,
    radiationReduction: trust.medic >= 70 ? 1 : 0,
    suppressionBonus: trust.commander >= 70 ? .08 : 0,
  };
}
