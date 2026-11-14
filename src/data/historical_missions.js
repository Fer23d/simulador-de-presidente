// Missoes historicas: reconstruir um imperio conquistando os paises que o formaram.
// "targets": paises que precisam ser anexados (o proprio pais do jogador, se estiver na lista, e dispensado).
// "story": o dossie mostrado ao escolher a missao (como comecou, auge, como terminou e numeros).
const mission = (data) => Object.freeze({ ...data, targets: Object.freeze(data.targets), story: Object.freeze({ ...data.story, numbers: Object.freeze(data.story.numbers) }) });

export const MISSIONS = Object.freeze({
  ussr: mission({
    id: 'ussr',
    home: 'rus',
    icon: '☭',
    title: 'Estabeleça a União Soviética',
    subtitle: 'Reunir as repúblicas que formaram a URSS',
    difficulty: 'Alta',
    objective: 'Anexe todas as nações que pertenceram à União Soviética.',
    targets: ['rus', 'ukr', 'blr', 'mda', 'geo', 'arm', 'aze', 'kaz', 'uzb', 'tkm', 'kgz', 'tjk', 'est', 'lva', 'ltu'],
    reward: { cashRate: 0.06, factions: { militares: 5, trabalhadores: 3 }, label: 'Caixa de 6% do PIB, militares +5 e trabalhadores +3' },
    story: {
      origin: 'Em 1917, a Revolução Russa derrubou o czar e levou os bolcheviques ao poder. Depois de uma guerra civil devastadora, o Tratado de Criação da URSS foi assinado em 30 de dezembro de 1922, unindo a Rússia, a Ucrânia, a Bielorrússia e a Transcaucásia sob um único Estado socialista com capital em Moscou.',
      peak: 'Após a vitória na Segunda Guerra Mundial, a URSS virou superpotência: 15 repúblicas, o Pacto de Varsóvia no Leste Europeu, o primeiro satélite (Sputnik, 1957), o primeiro homem no espaço (Gagarin, 1961) e um dos dois maiores arsenais nucleares do planeta.',
      end: 'A estagnação econômica, a corrida armamentista, o desastre de Chernobyl (1986) e as reformas da Perestroika e da Glasnost minaram o sistema. Depois do golpe fracassado de agosto de 1991, as repúblicas declararam independência uma a uma. Em 25 de dezembro de 1991, Gorbachev renunciou, e a URSS foi dissolvida no dia seguinte.',
      numbers: [['Duração', '1922 a 1991 (69 anos)'], ['Repúblicas', '15'], ['Área', 'cerca de 22,4 milhões de km² (um sexto das terras do mundo)'], ['População em 1991', 'cerca de 290 milhões de habitantes']],
    },
    epilogue: 'No mundo real, a União Soviética durou 69 anos e caiu sem uma invasão estrangeira. Na sua versão da história, a bandeira vermelha voltou a cobrir as repúblicas, desta vez pela força das suas tropas.',
  }),
  portugal: mission({
    id: 'portugal',
    home: 'prt',
    icon: '⚓',
    title: 'Reerga o Império Português',
    subtitle: 'Reunir Portugal e suas antigas colônias africanas, americana e asiática',
    difficulty: 'Média',
    objective: 'Anexe Portugal e as antigas possessões do império no Atlântico e no Índico.',
    targets: ['prt', 'bra', 'ago', 'moz', 'gnb', 'cpv', 'stp', 'tls'],
    reward: { cashRate: 0.05, factions: { elite: 4, trabalhadores: 1 }, label: 'Caixa de 5% do PIB, elite +4 e trabalhadores +1' },
    story: {
      origin: 'Em 1415, a conquista de Ceuta, no Norte da África, abriu a expansão portuguesa. Com o apoio do infante Dom Henrique, navegadores desceram a costa africana e, em 1498, Vasco da Gama chegou à Índia. Em 1500, Pedro Álvares Cabral alcançou o Brasil.',
      peak: 'No século XVI, Portugal controlava entrepostos de Goa a Macau, o comércio de especiarias, o ouro e o açúcar do Brasil e feitorias ao longo da África. Entre 1580 e 1640, esteve unido à coroa espanhola. Foi o primeiro império colonial europeu a chegar tão longe.',
      end: 'O Brasil se tornou independente em 1822. Goa foi tomada pela Índia em 1961. Após a Revolução dos Cravos (1974), Angola, Moçambique, Guiné-Bissau, Cabo Verde e São Tomé e Príncipe tornaram-se independentes em 1975. Timor-Leste foi invadido pela Indonésia no mesmo ano, e Macau voltou à China em 1999.',
      numbers: [['Duração', '1415 a 1999 (584 anos)'], ['Território no auge', 'cerca de 10 milhões de km² (c. 1815, com o Brasil)'], ['Continentes', 'América, África, Ásia e Europa'], ['Último território', 'Macau, devolvido em 1999']],
    },
    epilogue: 'No mundo real, o império português foi o mais longevo da Europa moderna e acabou entre revoluções e guerras de independência. Na sua versão, as caravelas voltam a unir os continentes sob uma só bandeira.',
  }),
  spain: mission({
    id: 'spain',
    home: 'esp',
    icon: '🛡️',
    title: 'Reerga o Império Espanhol',
    subtitle: 'Reunir a Espanha, a América hispânica e as Filipinas',
    difficulty: 'Muito alta',
    objective: 'Anexe a Espanha e as antigas colônias americanas e asiáticas do império.',
    targets: ['esp', 'mex', 'cub', 'col', 'ven', 'per', 'chl', 'arg', 'bol', 'pry', 'ury', 'ecu', 'pan', 'cri', 'nic', 'hnd', 'slv', 'gtm', 'dom', 'phl'],
    reward: { cashRate: 0.08, factions: { militares: 3, elite: 3, religiosos: 3 }, label: 'Caixa de 8% do PIB, militares +3, elite +3 e religiosos +3' },
    story: {
      origin: 'Em 1492, os Reis Católicos concluíram a Reconquista com a queda de Granada e financiaram a viagem de Colombo. Entre 1519 e 1521, Hernán Cortés derrubou o império asteca. Em 1532, Francisco Pizarro iniciou a conquista dos incas. A partir de 1565, a Espanha também ocupou as Filipinas.',
      peak: 'Sob os Habsburgos, a prata de Potosí e do México financiou exércitos e uma frota que cruzava o Atlântico e o Pacífico. Entre 1580 e 1640, a união com Portugal fez do domínio um império onde o sol nunca se punha, dividido em vice-reinos como Nova Espanha e Peru.',
      end: 'A invasão napoleônica de 1808 enfraqueceu o controle da metrópole, e as independências varreram a América entre 1810 e 1825, com a batalha de Ayacucho em 1824 como golpe final. Em 1898, a guerra contra os Estados Unidos custou Cuba, Porto Rico e as Filipinas. Os últimos territórios africanos foram perdidos entre 1968 e 1976.',
      numbers: [['Duração principal', '1492 a 1898 (406 anos)'], ['Território no auge', 'mais de 13 milhões de km²'], ['Vice-reinos na América', 'quatro (Nova Espanha, Peru, Nova Granada e Rio da Prata)'], ['Perda final', 'Guerra Hispano-Americana, 1898']],
    },
    epilogue: 'No mundo real, o império espanhol se desfez em meio século de guerras de independência. Na sua versão da história, os vice-reinos se reerguem sob um único comando, com a prata de volta aos cofres de Madri.',
  }),
});

export const MISSION_LIST = Object.freeze(Object.values(MISSIONS));
