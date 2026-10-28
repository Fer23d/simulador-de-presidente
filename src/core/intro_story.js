import { getPresidentClass } from './player_state.js';

// Historia de abertura do Vault: contada depois do clarao da bomba, antes de o jogador assumir o bunker.
// A ultima cena e o alerta de sistema que ja existia; o jogador pode pular tudo a qualquer momento.
export function getIntroScenes(state = {}) {
  const profile = getPresidentClass(state.presidentClass) ?? getPresidentClass('survivor');
  const leader = profile.leader;
  return [
    {
      id: 'last-day', icon: '🏛️', title: 'O ÚLTIMO DIA',
      text: `As sirenes começaram às 4h12 da manhã. No gabinete, ${leader} ainda segurava o telefone quando Helena Vargas entrou sem bater, pálida, com um papel na mão.\n\n"Senhor... os mísseis estão no ar. Temos onze minutos."`,
    },
    {
      id: 'brass-key', icon: '🗝️', title: 'A CHAVE DE LATÃO',
      text: 'A chave que Helena entregou no primeiro dia de mandato finalmente encontrou a sua fechadura: uma porta de aço atrás da estante do gabinete.\n\nAtrás dela, um elevador de carga. Duzentos metros de poço até o Último Gabinete. Ninguém descia ali havia trinta anos.',
    },
    {
      id: 'descent', icon: '⬇️', title: 'A DESCIDA',
      text: 'O elevador fez três viagens. Na primeira, soldados e engenheiros. Na segunda, cientistas carregando caixas de sementes e discos rígidos.\n\nNa terceira, uma professora chamada Lia Moraes, com quarenta crianças de uma escola do centro. Ninguém perguntou se havia lugar. Não havia tempo para perguntas.',
    },
    {
      id: 'flash', icon: '💥', title: 'O CLARÃO',
      text: 'A porta do Vault ainda estava fechando quando o chão tremeu. Depois veio o som: não um estrondo, mas um silêncio pesado, como se o mundo inteiro tivesse prendido a respiração.\n\nAs luzes piscaram. Os geradores de emergência roncaram. Alguém começou a chorar no escuro.',
    },
    {
      id: 'year-zero', icon: '🧒', title: 'ANO ZERO',
      text: `Quando a poeira assentou, um menino de nove anos se aproximou de ${leader}. Chamava-se Tomé. Olhou por um longo tempo, sem medo, e perguntou o que todos queriam perguntar:\n\n"Foi você que apertou o botão?"\n\nNinguém respondeu.`,
    },
    {
      id: 'command', icon: '☢️', title: '/// TRANSIÇÃO DE SOBREVIVÊNCIA ///', final: true,
      text: `[ ALERTA DE SISTEMA: SENSORES EXTERNOS DESTRUÍDOS ]\n> Nível de radiação exterior letal.\n> As superpotências não existem mais. A ONU não existe mais. O sol foi tapado pelas cinzas.\n> Bem-vindo à Nova Era, Líder. Os portões do Bunker foram selados. Sobreviva.\n\n"${profile.quote}"`,
    },
  ];
}
