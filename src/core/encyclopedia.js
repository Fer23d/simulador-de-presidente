import { createSurfaceSectors, getExplorationPercent, getSurfaceMap } from './surface_map.js';
import { getCriticalNeeds } from './needs.js';

export const ENCYCLOPEDIA_CATEGORIES = Object.freeze([
  ['weather', 'Clima'], ['sector', 'Setores da superfície'], ['room', 'Módulos do Vault'], ['vip', 'Especialistas'],
  ['event', 'Dilemas do Ermo'], ['loot', 'Achados'], ['condition', 'Condições'], ['rare', 'Raros'],
]);

const entry = (id, category, icon, name, text) => Object.freeze({ id, category, icon, name, text });

export const ENCYCLOPEDIA_ENTRIES = Object.freeze([
  entry('weather-dust', 'weather', '🌪', 'Tempestade de Poeira', 'Paredes de areia radioativa que engolem o horizonte. Nenhum explorador encontra o caminho de volta enquanto ela sopra.'),
  entry('weather-acid_rain', 'weather', '🌧', 'Chuva Ácida', 'A água que cai corrói metal e pele. As poças brilham num verde que ninguém quer tocar.'),
  entry('weather-radstorm', 'weather', '☢', 'Tempestade Radioativa', 'Relâmpagos verdes rasgam o céu. Os filtros de ar trabalham dobrado e o medo atravessa as paredes do Vault.'),

  entry('sector-ruins', 'sector', '⌂', 'Ruínas Residenciais', 'Bairros inteiros reduzidos a esqueletos de concreto. Sucata em cada esquina, memórias em cada parede.'),
  entry('sector-market', 'sector', '🥫', 'Mercado Saqueado', 'Prateleiras derrubadas e latas esquecidas sob os escombros. Comida, se você chegar antes dos ratos.'),
  entry('sector-hospital', 'sector', '✚', 'Hospital Abandonado', 'Corredores escuros com macas viradas. Ainda há curativos lacrados nos almoxarifados do subsolo.'),
  entry('sector-laboratory', 'sector', '⚗', 'Laboratório Universitário', 'Cadernos de pesquisa queimados pela metade. O que sobrou vale mais que ouro para os cientistas do Vault.'),
  entry('sector-power_plant', 'sector', '⚡', 'Usina Desativada', 'Turbinas paradas e baterias ainda carregadas. Energia para quem souber desmontar sem morrer eletrocutado.'),
  entry('sector-military', 'sector', '✪', 'Base Militar', 'Bunkers trancados, blindados queimados e projetos secretos. Perigosa, mas cheia de tecnologia.'),
  entry('sector-camp', 'sector', '⛺', 'Acampamento de Sobreviventes', 'Fogueiras e lonas remendadas. Gente que sobreviveu sem um Vault, e alguns deles são especialistas.'),
  entry('sector-crater', 'sector', '☢', 'Cratera de Impacto', 'O ponto zero. A radiação é brutal, mas o que a explosão expôs pode mudar o destino do Vault.'),

  entry('room-elevator', 'room', '⇕', 'Elevador', 'A espinha do Vault. Sem ele, cada andar é uma ilha.'),
  entry('room-dormitory', 'room', '🛏', 'Dormitório', 'Leitos modulares empilhados. Um habitante descansado trabalha melhor e conspira menos.'),
  entry('room-generator', 'room', '⚙', 'Sala do Gerador', 'O coração elétrico do abrigo. Três deles mantêm as luzes acesas a noite inteira.'),
  entry('room-greenhouse', 'room', '🌱', 'Estufa Hidropônica', 'Plantas sob luz ultravioleta. A diferença entre um Vault e uma tumba.'),
  entry('room-arsenal', 'room', '⚔', 'Arsenal Militar', 'Armas para os guardas e uma promessa silenciosa para quem pensa em se rebelar.'),
  entry('room-medical', 'room', '⚕', 'Centro Médico', 'Curativos, macas e a única cura conhecida para a radiação: tempo e sorte.'),
  entry('room-radio', 'room', '📻', 'Sala de Rádio', 'Uma antena apontada para o nada. Às vezes, o nada responde.'),
  entry('room-office', 'room', '🗄', 'Gabinete do Ditador', 'Mapas, ordens e batedores. Daqui o comandante governa o que restou.'),
  entry('room-detention', 'room', '⛓', 'Cela de Detenção', 'Barras enferrujadas e uma lâmpada que falha. Dissidentes aqui não sabotam ninguém.'),
  entry('room-laboratory', 'room', '🔬', 'Laboratório de Pesquisa', 'Ciência produzida a cada mês. Os especialistas rendem o dobro aqui dentro.'),
  entry('room-life_support', 'room', '🌀', 'Suporte de Vida', 'Ventiladores que nunca param. Cada respiração no Vault passa por estas hélices.'),
  entry('room-presidential_suite', 'room', '👑', 'Suíte Presidencial', 'O último luxo do fim do mundo, com guarda-roupa e tudo.'),

  entry('vip-dr-isaac', 'vip', '⭐', 'Dr. Isaac Lindqvist', 'Físico do antigo programa nuclear. Sabe quem assinou o lançamento e carrega essa culpa. Dobra a produção de qualquer laboratório.'),
  entry('vip-dra-amara', 'vip', '⭐', 'Dra. Amara Nkemelu', 'Bióloga que manteve uma estufa viva durante toda a guerra. Guarda sementes que podem reverdecer a superfície.'),
  entry('vip-coronel-silva', 'vip', '⭐', 'Coronel Rui Silva', 'Lutou em três guerras e perdeu todas. Leal a quem dá ordens claras, e o primeiro a pedir "medidas firmes".'),
  entry('vip-coronela-costa', 'vip', '⭐', 'Coronela Teresa Costa', 'Comandou a última defesa da capital. Rival de Silva, mais política e mais perigosa: numa revolta, escolhe um lado.'),

  entry('event-ration-emergency', 'event', '🍞', 'Emergência de Rações', 'Quando a comida acaba, alguém precisa decidir quem come primeiro.'),
  entry('event-generator-bearings', 'event', '🔩', 'Rolamentos do Gerador', 'Um rangido metálico que fica mais alto a cada noite.'),
  entry('event-air-filter-crisis', 'event', '😷', 'Crise dos Filtros de Ar', 'Os filtros entopem e o ar fica pesado. Improvisar ou sufocar.'),
  entry('event-radio-signal-unknown', 'event', '📡', 'Sinal Desconhecido', 'Uma transmissão sem origem chama o Vault pelo nome. Responder pode ser um erro.'),
  entry('event-greenhouse-fungus', 'event', '🍄', 'Fungo na Estufa', 'Uma praga cinzenta se espalha pelas folhas. Quarentena ou cura arriscada.'),

  entry('loot-scrap', 'loot', '🔧', 'Sucata Recuperada', 'Metal, fios e parafusos. A moeda real do mundo depois da bomba.'),
  entry('loot-food', 'loot', '🥫', 'Enlatados Intactos', 'Latas sem amassado e dentro da validade, um pequeno milagre.'),
  entry('loot-energy', 'loot', '🔋', 'Células de Energia', 'Baterias pesadas que ainda seguram carga depois de tudo.'),
  entry('loot-science', 'loot', '📚', 'Dados de Pesquisa', 'Discos e cadernos que os cientistas do Vault leem como relíquias.'),
  entry('loot-technology', 'loot', '💾', 'Projetos Militares', 'Plantas técnicas com carimbo de ultrassecreto. Agora pertencem a você.'),
  entry('loot-medkits', 'loot', '🩹', 'Kits Médicos', 'Gaze, antibióticos e iodo. Valem mais que armas.'),
  entry('loot-epic', 'loot', '💎', 'Recuperação Excepcional', 'Às vezes o Ermo devolve algo que ninguém esperava encontrar de novo.'),

  entry('condition-rebellion', 'condition', '!', 'Rebelião', 'Lealdade é finita. Quando acaba, a sabotagem começa pelas sombras.'),
  entry('condition-asphyxia', 'condition', '🫁', 'Asfixia', 'Sem suporte de vida, o ar do Vault vira veneno lento.'),
  entry('condition-famine', 'condition', '🍖', 'Fome', 'Estômagos vazios produzem pouco e reclamam muito.'),
  entry('condition-exhaustion', 'condition', '💤', 'Exaustão', 'Quem trabalha sem cama passa a se arrastar pelos corredores.'),

  entry('rare-radstorm-night', 'rare', '🌌', 'Noite Esmeralda', 'Uma tempestade radioativa durante a noite. O céu inteiro brilha verde e ninguém consegue dormir.'),
  entry('rare-full-map', 'rare', '🗺', 'Cartógrafo do Fim do Mundo', 'Cada setor ao redor do Vault foi pisado e mapeado. Não há mais névoa, só ruínas conhecidas.'),
  entry('rare-full-council', 'rare', '🎖', 'Conselho Completo', 'Os quatro grandes especialistas sob o mesmo teto. O Vault nunca esteve tão preparado.'),
]);

const ENTRY_IDS = new Set(ENCYCLOPEDIA_ENTRIES.map((item) => item.id));
const VIP_ENTRY_IDS = Object.freeze({
  'Dr. Isaac': 'vip-dr-isaac', 'Dra. Amara': 'vip-dra-amara', 'Coronel Silva': 'vip-coronel-silva', 'Coronela Costa': 'vip-coronela-costa',
  'Dr. Isaac Lindqvist': 'vip-dr-isaac', 'Dra. Amara Nkemelu': 'vip-dra-amara', 'Coronel Rui Silva': 'vip-coronel-silva', 'Coronela Teresa Costa': 'vip-coronela-costa',
});

export function createEncyclopedia(value = {}) {
  const entries = {};
  for (const [id, record] of Object.entries(value?.entries ?? {})) {
    if (!ENTRY_IDS.has(id)) continue;
    entries[id] = { day: Math.max(1, Math.floor(Number(record?.day) || 1)),
      discoveredAt: Math.max(0, Math.floor(Number(record?.discoveredAt) || 0)) };
  }
  return { version: 1, entries };
}

// Le o estado atual do Vault e devolve tudo o que o jogador esta vendo agora e merece entrada na enciclopedia.
export function detectDiscoveries(state) {
  if (!state?.is_wasteland) return [];
  const found = new Set();
  const weatherType = state.weather?.type;
  if (weatherType && weatherType !== 'clear') found.add(`weather-${weatherType}`);
  if (weatherType === 'radstorm' && state.isNight) found.add('rare-radstorm-night');
  if (state.surface_map) {
    const map = getSurfaceMap(state);
    const explored = new Set(map.explored);
    for (const sector of createSurfaceSectors(map.city)) {
      if (sector.type !== 'vault' && explored.has(sector.id)) found.add(`sector-${sector.type}`);
    }
    if (getExplorationPercent(map) >= 100) found.add('rare-full-map');
  }
  for (const room of (state.shelter_grid ?? []).flat()) if (room && room.type !== 'vault') found.add(`room-${room.type}`);
  const inhabitants = state.inhabitants ?? [];
  const vips = new Set(inhabitants.filter((npc) => npc.isVIP && VIP_ENTRY_IDS[npc.name]).map((npc) => VIP_ENTRY_IDS[npc.name]));
  vips.forEach((id) => found.add(id));
  if (vips.size === new Set(Object.values(VIP_ENTRY_IDS)).size) found.add('rare-full-council');
  if (state.pendingBunkerEvent?.id) found.add(`event-${state.pendingBunkerEvent.id}`);
  if (state.lootbox_revealed) {
    for (const item of state.currentLoot ?? []) {
      found.add(`loot-${item.resource}`);
      if (item.rarity === 'epic') found.add('loot-epic');
    }
  }
  const present = inhabitants.filter((npc) => !npc.is_on_expedition);
  if (present.some((npc) => npc.currentState === 'rebel')) found.add('condition-rebellion');
  if (state.oxygen_deprived) found.add('condition-asphyxia');
  if (present.some((npc) => getCriticalNeeds(npc.needs).includes('satiety'))) found.add('condition-famine');
  if (present.some((npc) => getCriticalNeeds(npc.needs).includes('rest'))) found.add('condition-exhaustion');
  return [...found].filter((id) => ENTRY_IDS.has(id));
}

export function recordDiscoveries(encyclopedia, ids, { day = 1, now = 0 } = {}) {
  const current = createEncyclopedia(encyclopedia);
  const added = [];
  for (const id of ids) {
    if (!ENTRY_IDS.has(id) || current.entries[id]) continue;
    current.entries[id] = { day: Math.max(1, Math.floor(Number(day) || 1)), discoveredAt: Math.max(0, Math.floor(Number(now) || 0)) };
    added.push(ENCYCLOPEDIA_ENTRIES.find((item) => item.id === id));
  }
  return { encyclopedia: current, added };
}

export function getEncyclopediaProgress(encyclopedia) {
  const discovered = Object.keys(createEncyclopedia(encyclopedia).entries).length;
  return { discovered, total: ENCYCLOPEDIA_ENTRIES.length };
}
