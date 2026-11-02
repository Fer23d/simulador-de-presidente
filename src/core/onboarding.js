import { normalizeLanguage } from './player_profile.js';

// Entrada do jogo: capa com carregamento, tela de perfil e configuracoes e a historia do jogo e do modo (pulavel).
export const ONBOARDING_KEY = 'simulador-presidente-onboarding-v1';
export const MIN_BOOT_MS = 2600;

export function createOnboarding(value = {}) {
  return { profileDone: value?.profileDone === true, skipStory: value?.skipStory === true };
}

// Primeira entrada: sugere o idioma do navegador quando o jogador ainda nao escolheu um.
export function guessLanguage(navigatorLanguage = '') {
  const code = String(navigatorLanguage).toLowerCase();
  if (code.startsWith('es')) return 'es';
  if (code.startsWith('en')) return 'en';
  return 'pt-BR';
}

const UI = Object.freeze({
  'pt-BR': {
    loading: 'CARREGANDO', ready: 'PRESSIONE QUALQUER TECLA', tipLabel: 'DICA',
    profileKicker: 'PRIMEIRO CONTATO', profileTitle: 'MEU PERFIL', profileLead: 'Antes de descer: como devemos te chamar?',
    nameLabel: 'NOME', namePlaceholder: 'Seu nome', nameHint: 'Este nome aparece nas conversas, nas histórias e nos finais.',
    language: 'IDIOMA', volume: 'VOLUME', mute: 'SOM MUDO', tutorial: 'TUTORIAL E DICAS', continue: '[ CONTINUAR ]', back: '[ VOLTAR ]',
    storyKicker: 'ANTES DE COMEÇAR', next: '[ AVANÇAR ]', start: '[ COMEÇAR ]', skip: '[ PULAR HISTÓRIA ]', never: 'NÃO MOSTRAR A HISTÓRIA DE NOVO',
    scene: 'CENA', replay: 'HISTÓRIA', defaultName: 'Presidente',
  },
  es: {
    loading: 'CARGANDO', ready: 'PULSA CUALQUIER TECLA', tipLabel: 'CONSEJO',
    profileKicker: 'PRIMER CONTACTO', profileTitle: 'MI PERFIL', profileLead: 'Antes de bajar: ¿cómo debemos llamarte?',
    nameLabel: 'NOMBRE', namePlaceholder: 'Tu nombre', nameHint: 'Este nombre aparece en las conversaciones, las historias y los finales.',
    language: 'IDIOMA', volume: 'VOLUMEN', mute: 'SIN SONIDO', tutorial: 'TUTORIAL Y CONSEJOS', continue: '[ CONTINUAR ]', back: '[ VOLVER ]',
    storyKicker: 'ANTES DE EMPEZAR', next: '[ AVANZAR ]', start: '[ EMPEZAR ]', skip: '[ SALTAR HISTORIA ]', never: 'NO MOSTRAR LA HISTORIA DE NUEVO',
    scene: 'ESCENA', replay: 'HISTORIA', defaultName: 'Presidente',
  },
  en: {
    loading: 'LOADING', ready: 'PRESS ANY KEY', tipLabel: 'TIP',
    profileKicker: 'FIRST CONTACT', profileTitle: 'MY PROFILE', profileLead: 'Before you go down: what should we call you?',
    nameLabel: 'NAME', namePlaceholder: 'Your name', nameHint: 'This name appears in conversations, stories and endings.',
    language: 'LANGUAGE', volume: 'VOLUME', mute: 'MUTE', tutorial: 'TUTORIAL AND TIPS', continue: '[ CONTINUE ]', back: '[ BACK ]',
    storyKicker: 'BEFORE YOU BEGIN', next: '[ NEXT ]', start: '[ START ]', skip: '[ SKIP STORY ]', never: 'DO NOT SHOW THE STORY AGAIN',
    scene: 'SCENE', replay: 'STORY', defaultName: 'President',
  },
});

export function onboardingText(language, key) {
  return UI[normalizeLanguage(language)]?.[key] ?? UI['pt-BR'][key] ?? key;
}

const TIPS = Object.freeze({
  'pt-BR': ['Aperte E perto de uma sala para gerenciá-la.', 'O Vault nunca dorme: uma ração a menos hoje é um motim amanhã.',
    'Só o Traje Antirradiação aguenta a superfície.', 'Layd não escolhe lados. Quem escolhe é você.',
    'Cada mês é uma decisão. Cada decisão tem um preço.', 'Quem conta as latas sabe quem as esconde.'],
  es: ['Pulsa E cerca de una sala para gestionarla.', 'El Vault nunca duerme: una ración menos hoy es un motín mañana.',
    'Solo el Traje Antirradiación aguanta la superficie.', 'Layd no elige bandos. Tú sí.',
    'Cada mes es una decisión. Cada decisión tiene un precio.', 'Quien cuenta las latas sabe quién las esconde.'],
  en: ['Press E near a room to manage it.', 'The Vault never sleeps: one less ration today is a mutiny tomorrow.',
    'Only the Anti-Radiation Suit survives the surface.', 'Layd does not pick sides. You do.',
    'Every month is a decision. Every decision has a price.', 'Whoever counts the cans knows who hides them.'],
});

export function getBootTips(language) {
  return TIPS[normalizeLanguage(language)] ?? TIPS['pt-BR'];
}

// Historia do jogo, igual para todos, e historia do modo em que a partida comeca. {name} vira o nome do perfil.
const GAME_STORY = Object.freeze({
  'pt-BR': [
    { icon: '☢️', title: 'A GUERRA QUE ACABOU COM TUDO', text: 'Havia um botão, uma mesa e um país inteiro dormindo. Em oito minutos, nenhuma das três coisas importava. A guerra não foi declarada: foi esquecida em cima de uma mesa de reunião, entre cafés frios e relatórios que ninguém leu.' },
    { icon: '🚪', title: 'O ÚLTIMO GABINETE', text: 'Alguém tinha construído o Vault anos antes, em silêncio, com dinheiro que não constava em nenhum orçamento. Quando as sirenes tocaram, só uma porta continuou aberta. {name} foi o último a descer, e a porta se fechou atrás.' },
    { icon: '🌍', title: 'APÓS A GUERRA, TUDO MUDA', text: 'Primeiro se governa um país. Depois se alimenta um bunker. No fim, se reconstrói um mundo. Cada etapa tem seu preço, e quem sobrevive a uma raramente sai ileso da seguinte.' },
  ],
  es: [
    { icon: '☢️', title: 'LA GUERRA QUE LO ACABÓ TODO', text: 'Había un botón, una mesa y un país entero durmiendo. En ocho minutos, ninguna de las tres cosas importaba. La guerra no se declaró: se olvidó sobre una mesa de reuniones, entre cafés fríos e informes que nadie leyó.' },
    { icon: '🚪', title: 'EL ÚLTIMO GABINETE', text: 'Alguien construyó el Vault años antes, en silencio, con dinero que no figuraba en ningún presupuesto. Cuando sonaron las sirenas, solo una puerta siguió abierta. {name} fue el último en bajar, y la puerta se cerró detrás.' },
    { icon: '🌍', title: 'TRAS LA GUERRA, TODO CAMBIA', text: 'Primero se gobierna un país. Después se alimenta un búnker. Al final, se reconstruye un mundo. Cada etapa tiene su precio, y quien sobrevive a una rara vez sale ileso de la siguiente.' },
  ],
  en: [
    { icon: '☢️', title: 'THE WAR THAT ENDED EVERYTHING', text: 'There was a button, a desk and an entire country asleep. In eight minutes, none of the three mattered. The war was not declared: it was forgotten on a meeting table, between cold coffee and reports nobody read.' },
    { icon: '🚪', title: 'THE LAST OFFICE', text: 'Someone built the Vault years earlier, quietly, with money that appeared in no budget. When the sirens rang, only one door stayed open. {name} was the last to go down, and the door closed behind.' },
    { icon: '🌍', title: 'AFTER THE WAR, EVERYTHING CHANGES', text: 'First you govern a country. Then you feed a bunker. In the end, you rebuild a world. Each stage has its price, and whoever survives one rarely leaves the next unscathed.' },
  ],
});

const MODE_STORY = Object.freeze({
  'pt-BR': [
    { icon: '🏛️', title: 'MODO PRESIDÊNCIA', text: '{name} assume o gabinete em janeiro de 2026. O caixa está curto, o Congresso desconfia e o mundo está nervoso. Equilibre o orçamento, a diplomacia e as forças armadas, mês a mês.' },
    { icon: '⏳', title: 'CADA MÊS CONTA', text: 'Se o pior acontecer, o que você construiu até aqui decide quem desce ao Vault e com que recursos. Governe como se o fim fosse amanhã, porque pode ser.' },
  ],
  es: [
    { icon: '🏛️', title: 'MODO PRESIDENCIA', text: '{name} asume el gabinete en enero de 2026. La caja está corta, el Congreso desconfía y el mundo está nervioso. Equilibra el presupuesto, la diplomacia y las fuerzas armadas, mes a mes.' },
    { icon: '⏳', title: 'CADA MES CUENTA', text: 'Si ocurre lo peor, lo que construiste hasta aquí decide quién baja al Vault y con qué recursos. Gobierna como si el fin fuera mañana, porque puede serlo.' },
  ],
  en: [
    { icon: '🏛️', title: 'PRESIDENCY MODE', text: '{name} takes office in January 2026. The treasury is thin, Congress is suspicious and the world is on edge. Balance the budget, diplomacy and the armed forces, month by month.' },
    { icon: '⏳', title: 'EVERY MONTH COUNTS', text: 'If the worst happens, what you built until now decides who goes down to the Vault and with what. Govern as if the end were tomorrow, because it may be.' },
  ],
});

export function getStoryScenes(language, name = '') {
  const locale = normalizeLanguage(language);
  const player = String(name ?? '').trim() || onboardingText(locale, 'defaultName');
  return [...GAME_STORY[locale], ...MODE_STORY[locale]].map((scene, index, all) => ({
    ...scene, index, total: all.length, text: scene.text.replaceAll('{name}', player),
  }));
}
