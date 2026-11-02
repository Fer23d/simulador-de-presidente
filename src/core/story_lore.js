const STORY_NOTICE = '[ NOVO CAPÍTULO ADICIONADO AO MODO HISTÓRIA ]';

export const LORE_CHAPTERS = Object.freeze({
  cap_1_origem: Object.freeze({
    id: 'cap_1_origem',
    title: 'CAPÍTULO I: A Herança das Cinzas',
    text: 'O governo eleito fugiu de madrugada, levando o que restava do tesouro. Sobrou o meu nome na linha de sucessão. Helena Vargas, chefe de gabinete há trinta e cinco anos, entregou-me o dossiê do país e, por último, uma chave de latão sem etiqueta. "O seu antecessor nunca a usou. Espero que o senhor também não precise." No canto do gabinete, um rádio velho chiou sozinho. Ninguém mais pareceu ouvir.',
  }),
  cap_2_corrupcao: Object.freeze({
    id: 'cap_2_corrupcao',
    title: 'CAPÍTULO II: O Preço do Poder',
    text: 'Otávio Brandt chegou perfumado e saiu com a minha assinatura. Uma conta numa ilha distante, um número sem nome. "Todo presidente tem uma saída, Excelência. Os espertos constroem a deles cedo." O povo aplaude as estradas que inauguro. Não sabe que cada bloco de asfalto foi pago com o que lhe tiro. À noite, o rádio repetiu uma palavra: "ladrão". Desliguei a tomada. Ele continuou.',
  }),
  cap_3_guerra: Object.freeze({
    id: 'cap_3_guerra',
    title: 'CAPÍTULO III: O Gosto do Sangue',
    text: 'O General Hélio Rocha pediu a ordem com a voz de quem já a tinha dado. Assinei. Quando a primeira capital caiu, o mundo parou de rir. Na manhã seguinte, encontrei sobre a mesa uma carta de Helena: "Sirvo ao cargo, não a isto." Guardei a carta na gaveta, ao lado da chave de latão.',
  }),
  cap_4_imperio: Object.freeze({
    id: 'cap_4_imperio',
    title: 'CAPÍTULO IV: A Coroa de Ferro',
    text: 'Dissolvi o Congresso numa terça-feira, entre o almoço e o café. O título de Presidente ficou pequeno. Na mesma noite, os engenheiros desceram duzentos metros sob o Palácio e reabriram o Último Gabinete, "por precaução". Pela primeira vez, a Voz do rádio falou com clareza: "Também tenho um bunker. Também fui presidente. Vamos ver quem sai primeiro."',
  }),
  cap_5_wasteland: Object.freeze({
    id: 'cap_5_wasteland',
    title: 'CAPÍTULO V: O Deus das Cinzas',
    text: 'O céu ficou branco e depois não ficou nada. A ONU, as fronteiras, as leis viraram pó radioativo. Os elevadores desceram com quem consegui salvar. A porta do Vault fechou com um som que nunca vou esquecer. Lá em cima, o mundo que governei acabou. Aqui embaixo, um menino chamado Tomé me olhou e perguntou: "Foi você que apertou o botão?" O contador marca ANO ZERO.',
  }),
  cap_layd: Object.freeze({
    id: 'cap_layd',
    title: 'CAPÍTULO VI: A Companheira do Ermo',
    text: 'Durante dias, os soldados da Porta ouviram latidos na chuva ácida. Diziam que era o vento nos canos ou mais uma armadilha dos saqueadores. Na manhã em que decidi ficar, a vigia se abriu e uma cadela magra apareceu diante da escotilha, coberta de ferrugem e poeira. Trazia uma coleira rachada e uma placa de latão com um nome riscado à mão: Layd. Ela não pediu comida nem permissão. Deu três voltas em torno das minhas botas e deitou. Desde então, onde eu caminho, ela caminha. Talvez seja lealdade. Talvez seja apenas a memória de um mundo que ainda sabia confiar em alguém.',
  }),
  cap_6_reconstrucao: Object.freeze({
    id: 'cap_6_reconstrucao',
    title: 'CAPÍTULO VII: O Primeiro Tijolo',
    text: 'A primeira estrada não parecia uma estrada. Era cascalho, ferrugem e uma faixa de tinta amarela roubada de um depósito militar. Mesmo assim, quando a Porta do Vault acendeu o sinal verde, as pessoas saíram para vê-la como se fosse uma avenida. Durante anos eu governei mapas. Na superfície, aprendi que uma linha no chão pode ser uma promessa.',
  }),
  cap_7_servicos: Object.freeze({
    id: 'cap_7_servicos',
    title: 'CAPÍTULO VIII: Três Luzes Verdes',
    text: 'Comida, água e energia. Três palavras pequenas, três máquinas enormes, três maneiras de uma cidade morrer. Naquela manhã, os painéis ficaram verdes ao mesmo tempo. Helena disse que era infraestrutura. Tomé chamou de milagre. Eu não corrigi nenhum dos dois. Um líder inteligente sabe quando deixar o povo dar nome às próprias vitórias.',
  }),
  cap_8_comunidade: Object.freeze({
    id: 'cap_8_comunidade',
    title: 'CAPÍTULO IX: A Praça',
    text: 'A praça ficou cheia sem decreto, sem soldados e sem alto-falantes. Pessoas que nasceram depois da bomba venderam pão, discutiram política e se apaixonaram sob árvores que nunca existiram antes. Pela primeira vez, a cidade não precisava da minha voz para continuar funcionando. Foi o momento mais assustador do meu governo. Também foi o mais próximo de uma vitória.',
  }),
  cap_9_legado: Object.freeze({
    id: 'cap_9_legado',
    title: 'CAPÍTULO X: O Governo que Me Sobreviveu',
    text: 'Três anos na superfície e os relatórios já não começam com o meu nome. Começam com o nome da cidade. As crianças aprendem a data da guerra, mas não sabem qual foi a minha facção no Congresso. Talvez esse seja o julgamento final de qualquer governante: descobrir se o mundo continua existindo depois que ele deixa de ser o centro dele.',
  }),
});

const STORY_ORDER = Object.freeze([
  'cap_1_origem',
  'cap_2_corrupcao',
  'cap_3_guerra',
  'cap_4_imperio',
  'cap_5_wasteland',
  'cap_layd',
  'cap_6_reconstrucao',
  'cap_7_servicos',
  'cap_8_comunidade',
  'cap_9_legado',
]);

function hasWarMilestone(state) {
  return Boolean(
    state.history_log?.some((entry) => entry.type === 'guerra')
      || state.geopolitics?.contacts?.some((contact) => contact.atWar),
  );
}

function getUnlockedChapters(state) {
  const known = Array.isArray(state.unlocked_chapters) ? state.unlocked_chapters : [];
  const valid = known.filter((id) => Object.hasOwn(LORE_CHAPTERS, id));
  return valid.includes('cap_1_origem') ? valid : ['cap_1_origem', ...valid];
}

function isChapterReady(state, chapterId) {
  if (chapterId === 'cap_1_origem') return true;
  if (chapterId === 'cap_2_corrupcao') return Number(state.slush_fund) > 0;
  if (chapterId === 'cap_3_guerra') return hasWarMilestone(state);
  if (chapterId === 'cap_4_imperio') return state.government === 'empire';
  if (chapterId === 'cap_5_wasteland') return state.is_wasteland === true;
  if (chapterId === 'cap_layd') return state.companion?.adopted === true;
  if (chapterId === 'cap_6_reconstrucao') return Boolean(state.city);
  if (chapterId === 'cap_7_servicos') return Boolean(state.city?.completedObjectives?.includes('services'));
  if (chapterId === 'cap_8_comunidade') return Boolean(state.city?.completedObjectives?.includes('community'));
  if (chapterId === 'cap_9_legado') return Boolean(state.city?.result || state.city?.completedObjectives?.includes('legacy'));
  return false;
}

export function getLoreChapter(chapterId) {
  return LORE_CHAPTERS[chapterId] ?? null;
}

export function checkStoryChapters(state) {
  const unlockedChapters = getUnlockedChapters(state);
  const newChapters = STORY_ORDER.filter((chapterId) => (
    !unlockedChapters.includes(chapterId) && isChapterReady(state, chapterId)
  ));

  if (!newChapters.length && unlockedChapters.length === (state.unlocked_chapters ?? []).length) {
    return state;
  }

  return {
    ...state,
    unlocked_chapters: [...unlockedChapters, ...newChapters],
    notice: newChapters.length ? STORY_NOTICE : state.notice,
    story_notice: newChapters.length ? STORY_NOTICE : state.story_notice,
  };
}

export { STORY_NOTICE };
