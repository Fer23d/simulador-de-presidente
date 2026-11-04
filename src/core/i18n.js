import { normalizeLanguage } from './player_profile.js';

const MONTH_NAMES = Object.freeze({
  'pt-BR': Object.freeze(['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']),
  es: Object.freeze(['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']),
  en: Object.freeze(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']),
});

const UI_MESSAGES = Object.freeze({
  'pt-BR': {
    'nav.overview': 'Visão geral',
    'nav.budget': 'Orçamento',
    'nav.diplomacy': 'Diplomacia',
    'nav.military': 'Forças Armadas',
    'nav.cabinet': 'Gabinete',
    'nav.technology': 'Tecnologia',
    'nav.projects': 'Projetos Internos',
    'nav.congress': 'Congresso',
    'nav.history': '> MODO HISTÓRIA',
    'nav.countries': 'Países',
    'nav.profile': 'Meu perfil',
    'metric.gdp': 'PIB',
    'metric.inflation': 'Inflação',
    'metric.unemployment': 'Desemprego',
    'metric.support': 'Apoio interno',
    'metric.cash': 'Caixa nacional',
    'metric.defcon': 'DEFCON',
    'metric.balance': 'Saldo projetado',
    'level.abbrev': 'NV',
    'top.country': 'País',
    'top.restart': 'Reiniciar',
    'top.newGame': 'Nova partida',
    'profile.kicker': 'Identidade e configurações',
    'profile.title': 'Meu perfil',
    'profile.identity': 'Como você será chamado',
    'profile.nameLabel': 'Nome de chamada',
    'profile.namePlaceholder': 'Digite seu nome',
    'profile.nameHint': 'Este nome aparece no gabinete, no Vault e na reconstrução da cidade.',
    'profile.save': '[ SALVAR IDENTIDADE ]',
    'profile.settings': 'Configurações',
    'profile.language': 'Idioma da interface',
    'profile.languageHint': 'Rótulos, níveis, painéis, alertas e modos acompanham o idioma selecionado.',
    'profile.volume': 'Volume',
    'profile.mute': 'Som mudo',
    'profile.tutorial': 'Tutorial e dicas',
    'profile.restartTutorial': 'Reiniciar tutorial',
    'profile.fullscreen': 'Tela cheia',
    'profile.version': 'Preferências salvas nesta partida',
    'profile.active': 'Identidade ativa',
    'profile.pt': 'Português (Brasil)',
    'profile.es': 'Español',
    'profile.en': 'English',
  },
  es: {
    'nav.overview': 'Vista general',
    'nav.budget': 'Presupuesto',
    'nav.diplomacy': 'Diplomacia',
    'nav.military': 'Fuerzas Armadas',
    'nav.cabinet': 'Gabinete',
    'nav.technology': 'Tecnología',
    'nav.projects': 'Proyectos internos',
    'nav.congress': 'Congreso',
    'nav.history': '> MODO HISTORIA',
    'nav.countries': 'Países',
    'nav.profile': 'Mi perfil',
    'metric.gdp': 'PIB',
    'metric.inflation': 'Inflación',
    'metric.unemployment': 'Desempleo',
    'metric.support': 'Apoyo interno',
    'metric.cash': 'Tesoro nacional',
    'metric.defcon': 'DEFCON',
    'metric.balance': 'Saldo proyectado',
    'level.abbrev': 'NIV',
    'top.country': 'País',
    'top.restart': 'Reiniciar',
    'top.newGame': 'Nueva partida',
    'profile.kicker': 'Identidad y configuración',
    'profile.title': 'Mi perfil',
    'profile.identity': 'Cómo te llamarán',
    'profile.nameLabel': 'Nombre de llamada',
    'profile.namePlaceholder': 'Escribe tu nombre',
    'profile.nameHint': 'Este nombre aparece en el gabinete, el Refugio y la reconstrucción de la ciudad.',
    'profile.save': '[ GUARDAR IDENTIDAD ]',
    'profile.settings': 'Configuración',
    'profile.language': 'Idioma de la interfaz',
    'profile.languageHint': 'Etiquetas, niveles, paneles, alertas y modos siguen el idioma seleccionado.',
    'profile.volume': 'Volumen',
    'profile.mute': 'Silenciar sonido',
    'profile.tutorial': 'Tutorial y consejos',
    'profile.restartTutorial': 'Reiniciar tutorial',
    'profile.fullscreen': 'Pantalla completa',
    'profile.version': 'Preferencias guardadas en esta partida',
    'profile.active': 'Identidad activa',
    'profile.pt': 'Português (Brasil)',
    'profile.es': 'Español',
    'profile.en': 'English',
  },
  en: {
    'nav.overview': 'Overview',
    'nav.budget': 'Budget',
    'nav.diplomacy': 'Diplomacy',
    'nav.military': 'Armed Forces',
    'nav.cabinet': 'Cabinet',
    'nav.technology': 'Technology',
    'nav.projects': 'Internal Projects',
    'nav.congress': 'Congress',
    'nav.history': '> STORY MODE',
    'nav.countries': 'Countries',
    'nav.profile': 'My profile',
    'metric.gdp': 'GDP',
    'metric.inflation': 'Inflation',
    'metric.unemployment': 'Unemployment',
    'metric.support': 'Domestic support',
    'metric.cash': 'National treasury',
    'metric.defcon': 'DEFCON',
    'metric.balance': 'Projected balance',
    'level.abbrev': 'LVL',
    'top.country': 'Country',
    'top.restart': 'Restart',
    'top.newGame': 'New game',
    'profile.kicker': 'Identity and settings',
    'profile.title': 'My profile',
    'profile.identity': 'What the nation will call you',
    'profile.nameLabel': 'Call sign',
    'profile.namePlaceholder': 'Enter your name',
    'profile.nameHint': 'This name appears in the cabinet, the Vault and the city reconstruction.',
    'profile.save': '[ SAVE IDENTITY ]',
    'profile.settings': 'Settings',
    'profile.language': 'Interface language',
    'profile.languageHint': 'Labels, levels, panels, alerts and game modes follow the selected language.',
    'profile.volume': 'Volume',
    'profile.mute': 'Mute sound',
    'profile.tutorial': 'Tutorial and tips',
    'profile.restartTutorial': 'Restart tutorial',
    'profile.fullscreen': 'Fullscreen',
    'profile.version': 'Preferences saved in this game',
    'profile.active': 'Active identity',
    'profile.pt': 'Português (Brasil)',
    'profile.es': 'Español',
    'profile.en': 'English',
  },
});

// Textos legados ainda são montados em vários módulos históricos do jogo. Esta
// tabela permite localizá-los sem misturar idioma com as regras de simulação.
// Conteúdo narrativo (lore, finais e falas) fica fora dela de propósito.
const LEGACY_UI_TRANSLATIONS = Object.freeze({
  es: Object.freeze([
    // Progressão global, níveis, recompensas e estados dos painéis.
    ['NÍVEIS', 'NIVELES'], ['níveis', 'niveles'], ['TRILHA DE NÍVEIS', 'RUTA DE NIVELES'], ['PROGRESSÃO', 'PROGRESIÓN'], ['Progressão', 'Progresión'],
    ['PRÊMIO MÁXIMO', 'PREMIO MÁXIMO'], ['PRÊMIO ESPECIAL', 'PREMIO ESPECIAL'], ['Prêmio de nível', 'Premio de nivel'],
    ['Ponto de partida da jornada', 'Punto de partida del viaje'], ['Já alcançado', 'Ya alcanzado'], ['VOCÊ ESTÁ AQUI', 'ESTÁS AQUÍ'],
    ['A Porta do Vault abre no nível', 'La Puerta del Refugio se abre en el nivel'], ['A Porta do Vault abre no nível', 'La Puerta del Refugio se abre en el nivel'], ['A Porta do Vault só abre neste nível', 'La Puerta del Refugio solo se abre en este nivel'], ['A Porta do Vault só abre no nível', 'La Puerta del Refugio solo se abre en el nivel'],
    ['XP máximo', 'XP máximo'], ['Próximo prêmio especial', 'Próximo premio especial'], ['Você chegou ao nível máximo.', 'Has llegado al nivel máximo.'],
    ['faltam', 'faltan'], ['níveis', 'niveles'], ['nível', 'nivel'], ['capítulos recuperados', 'capítulos recuperados'], ['Modo dos prêmios', 'Modo de las recompensas'],
    ['Todo nível dá um prêmio do modo em que você está.', 'Cada nivel da una recompensa del modo en el que estás.'],
    ['Nível comum', 'Nivel común'], ['terminado em 5', 'terminado en 5'], ['terminado em 0', 'terminado en 0'],
    ['com título, vestimenta exclusiva e bônus extra.', 'con título, vestimenta exclusiva y bonificación extra.'], ['(atual)', '(actual)'],
    ['recompensas', 'recompensas'], ['Título', 'Título'], ['Vestimenta exclusiva', 'Vestimenta exclusiva'],
    ['Caixa nacional', 'Tesoro nacional'], ['Pontos de tecnologia', 'Puntos de tecnología'], ['Água', 'Agua'], ['Felicidade', 'Felicidad'], ['Presidência', 'Presidencia'], ['Cidade', 'Ciudad'],
    ['Não disponível', 'No disponible'], ['Não definido', 'No definido'], ['SEM SETOR DISPONÍVEL', 'SIN SECTOR DISPONIBLE'],
    ['Pronto para iniciar', 'Listo para iniciar'], ['PP INSUFICIENTES', 'PP INSUFICIENTES'], ['DEPENDÊNCIA PENDENTE', 'DEPENDENCIA PENDIENTE'],
    ['CONCLUÍDO', 'COMPLETADO'], ['INICIAR PROJETO', 'INICIAR PROYECTO'], ['Pontos de experiência', 'Puntos de experiencia'],
    ['Pontos de Pesquisa', 'Puntos de investigación'], ['Pesquisa militar', 'Investigación militar'], ['Nível', 'Nivel'], ['NÍVEL', 'NIVEL'],
    ['LINHA DE RECONSTRUÇÃO CONCLUÍDA', 'LÍNEA DE RECONSTRUCCIÓN COMPLETADA'], ['ORDEM ATUAL', 'ORDEN ACTUAL'], ['REDE DE SOBREVIVÊNCIA', 'RED DE SUPERVIVENCIA'],
    ['SISTEMA ONLINE', 'SISTEMA EN LÍNEA'], ['ÚLTIMOS REGISTROS', 'ÚLTIMOS REGISTROS'], ['ESCOLHA UMA CONSTRUÇÃO', 'ELIGE UNA CONSTRUCCIÓN'],
    ['RECURSOS', 'RECURSOS'], ['FELICIDADE', 'FELICIDAD'], ['DENSIDADE', 'DENSIDAD'], ['CONTAMINADO', 'CONTAMINADO'], ['SERVIÇO ATIVO', 'SERVICIO ACTIVO'],
    ['MONTANDO', 'MONTANDO'], ['OBRA PARA O NÍVEL', 'OBRA PARA EL NIVEL'], ['FALTAM', 'FALTAN'], ['BARRIS', 'BARRILES'], ['SEM DEFESA', 'SIN DEFENSA'],
    ['FORTE DA SUPERFÍCIE', 'FUERTE DE LA SUPERFICIE'], ['TERRENO DO FORTE', 'TERRENO DEL FUERTE'], ['BARRIS A PROTEGER', 'BARRILES A PROTEGER'],
    ['ATAQUE REPELIDO', 'ATAQUE REPELIDO'], ['CAMPO SAQUEADO', 'CAMPO SAQUEADO'], ['MERCADO SOMBRIO', 'MERCADO SOMBRÍO'], ['RECOMPENSA', 'RECOMPENSA'],
    ['BATEDORES', 'EXPLORADORES'], ['ANDAR', 'PLANTA'], ['SETOR', 'SECTOR'], ['VÁ ATÉ LÁ E APERTE [E]', 'VE ALLÍ Y PULSA [E]'],
    ['PROBLEMA NO VAULT', 'PROBLEMA EN EL REFUGIO'], ['ESCONDIDA', 'ESCONDIDA'], ['DESCONFIANÇA DO VAULT', 'DESCONFIANZA DEL REFUGIO'],
    ['ANO ZERO PÓS-BOMBA', 'AÑO CERO POSBOMBA'], ['ECONOMIA DE SUCATA', 'ECONOMÍA DE CHATARRA'], ['A superfície morreu.', 'La superficie murió.'],
    ['PRESIDENTE EM PATRULHA', 'PRESIDENTE EN PATRULLA'], ['GERIR SALA', 'GESTIONAR SALA'], ['VOLTAR AO VAULT', 'VOLVER AL REFUGIO'],
    ['REPARAR', 'REPARAR'], ['RECRUTAR', 'RECLUTAR'], ['EQUIPAR GUARDA', 'EQUIPAR GUARDIA'], ['TRATAR RADIAÇÃO', 'TRATAR RADIACIÓN'],
    ['TRANSMITIR SINAL', 'TRANSMITIR SEÑAL'], ['OPERAR A SALA DE RÁDIO', 'OPERAR LA SALA DE RADIO'], ['ABRIR O GUARDA-ROUPA', 'ABRIR EL ARMARIO'],
    ['CHEIO', 'LLENO'], ['ERGUER', 'LEVANTAR'], ['FORTE', 'FUERTE'], ['ERGUENDO', 'LEVANTANDO'], ['ATAQUE REPELIDO', 'ATAQUE REPELIDO'],
    ['MODO PRESIDÊNCIA', 'MODO PRESIDENCIA'], ['PRÓXIMO', 'PRÓXIMO'], ['ATUAL', 'ACTUAL'],
    ['Agenda presidencial', 'Agenda presidencial'], ['Próximo movimento', 'Próximo movimiento'], ['Proximo movimento', 'Próximo movimiento'],
    ['Nação', 'Nación'], ['Nacao', 'Nación'], ['Painel mundial', 'Panel mundial'], ['Diplomacia e Mapa', 'Diplomacia y mapa'],
    ['Diplomacia de risco', 'Diplomacia de riesgo'], ['Reputação global', 'Reputación global'], ['Reputacao global', 'Reputación global'],
    ['Sanções internacionais ativas', 'Sanciones internacionales activas'], ['Sancoes internacionais ativas', 'Sanciones internacionales activas'],
    ['Sem sanções internacionais', 'Sin sanciones internacionales'], ['Sem sancoes internacionais', 'Sin sanciones internacionales'],
    ['Nação selecionada', 'Nación seleccionada'], ['Nacao selecionada', 'Nación seleccionada'], ['Área', 'Área'], ['Area', 'Área'],
    ['População', 'Población'], ['Populacao', 'Población'], ['Governo', 'Gobierno'], ['Território anexado', 'Territorio anexado'],
    ['Comércio', 'Comercio'], ['Comercio', 'Comercio'], ['Aliança', 'Alianza'], ['Alianca', 'Alianza'], ['Sabotar', 'Sabotear'],
    ['Guerra', 'Guerra'], ['Impor sanção', 'Imponer sanción'], ['Impor sancao', 'Imponer sanción'], ['Exigir anexação', 'Exigir anexión'],
    ['Exigir anexacao', 'Exigir anexión'], ['Ataque nuclear', 'Ataque nuclear'], ['Buscar país', 'Buscar país'], ['Buscar pais', 'Buscar país'],
    ['Propor Acordo Comercial', 'Proponer acuerdo comercial'], ['Importar aço', 'Importar acero'], ['Propor Aliança', 'Proponer alianza'],
    ['Propor Alianca', 'Proponer alianza'], ['Lançar Ciberataque', 'Lanzar ciberataque'], ['Lançar Vírus Sintético', 'Lanzar virus sintético'],
    ['Orquestrar Falsa Bandeira', 'Orquestar falsa bandera'], ['INSULTAR LÍDER ESTRANGEIRO', 'INSULTAR AL LÍDER EXTRANJERO'],
    ['INSULTAR LIDER ESTRANGEIRO', 'INSULTAR AL LÍDER EXTRANJERO'], ['Financiar Rebeldes', 'Financiar rebeldes'],
    ['CÓDIGOS NUCLEARES', 'CÓDIGOS NUCLEARES'], ['Absorver pela União', 'Absorber en la Unión'], ['Guerra', 'Guerra'],
    ['Orçamento nacional', 'Presupuesto nacional'], ['Orcamento nacional', 'Presupuesto nacional'], ['Imposto de renda', 'Impuesto sobre la renta'],
    ['Imposto sobre consumo', 'Impuesto al consumo'], ['Gastos públicos', 'Gastos públicos'], ['Gastos publicos', 'Gastos públicos'],
    ['Saúde', 'Salud'], ['Saude', 'Salud'], ['Educação', 'Educación'], ['Educacao', 'Educación'], ['Infraestrutura', 'Infraestructura'],
    ['Defesa', 'Defensa'], ['Ciência e Tecnologia', 'Ciencia y tecnología'], ['Ciencia e Tecnologia', 'Ciencia y tecnología'],
    ['Aplicar orçamento', 'Aplicar presupuesto'], ['Aplicar orcamento', 'Aplicar presupuesto'], ['Congresso suspenso', 'Congreso suspendido'],
    ['Instituições', 'Instituciones'], ['Instituicoes', 'Instituciones'], ['Leis são aprovadas por decreto enquanto durar o estado de sítio.', 'Las leyes se aprueban por decreto mientras dure el estado de sitio.'],
    ['Projetos Internos', 'Proyectos internos'], ['Capacidade nacional', 'Capacidad nacional'], ['Automatizar Parque Industrial', 'Automatizar parque industrial'],
    ['CONSTRUIR', 'CONSTRUIR'], ['CONSTRUIR RODOVIA NACIONAL', 'CONSTRUIR CARRETERA NACIONAL'], ['CONSTRUIR COMPLEXO INDUSTRIAL', 'CONSTRUIR COMPLEJO INDUSTRIAL'],
    ['Construir Rede Mao Morta (IA)', 'Construir red Mano Muerta (IA)'], ['Economia de Sucata', 'Economía de chatarra'], ['Ano Zero Pos-Bomba', 'Año cero posbomba'],
    ['Ano Zero Pós-Bomba', 'Año cero posbomba'], ['Purificador de Agua', 'Purificador de agua'], ['Gerador Geotermico', 'Generador geotérmico'],
    ['Diplomacia', 'Diplomacia'], ['Relações Internacionais', 'Relaciones internacionales'], ['Relacoes Internacionais', 'Relaciones internacionales'],
    ['Forças Armadas', 'Fuerzas armadas'], ['Forcas Armadas', 'Fuerzas armadas'], ['Tecnologia', 'Tecnología'], ['Congresso', 'Congreso'],
    ['Países', 'Países'], ['Paises', 'Países'], ['Gabinete', 'Gabinete'], ['Diário', 'Diario'], ['DIÁRIO', 'DIARIO'],
    ['ENCICLOPÉDIA DO ERMO', 'ENCICLOPEDIA DEL YERMO'], ['ENCICLOPEDIA DO ERMO', 'ENCICLOPEDIA DEL YERMO'], ['FECHAR ARQUIVO', 'CERRAR ARCHIVO'],
    ['NOVA PARTIDA', 'NUEVA PARTIDA'], ['REINICIAR', 'REINICIAR'], ['Pausar', 'Pausar'], ['Velocidade do tempo', 'Velocidad del tiempo'],
    ['CONSTRUIR', 'CONSTRUIR'], ['REDE DE SOBREVIVÊNCIA · SUCATAS', 'RED DE SUPERVIVENCIA · CHATARRA'], ['DIÁRIO DE CAMPO', 'DIARIO DE CAMPO'],
    ['ÚLTIMOS REGISTOS', 'ÚLTIMOS REGISTROS'], ['Ultimos registros', 'Últimos registros'], ['SELECIONE UM SETOR', 'SELECCIONA UN SECTOR'],
    ['Escolha uma construção', 'Elige una construcción'], ['Escolha uma construcao', 'Elige una construcción'], ['Demolir', 'Demoler'],
    ['MODO CIDADE', 'MODO CIUDAD'], ['RECONSTRUÇÃO', 'RECONSTRUCCIÓN'], ['RECONSTRUCAO', 'RECONSTRUCCIÓN'], ['COMANDO:', 'MANDO:'],
    ['Custo:', 'Coste:'], ['sucatas', 'chatarras'], ['PRESIDENTE EM PATRULHA', 'PRESIDENTE EN PATRULLA'], ['SALAS', 'SALAS'],
    ['CAPACIDADE', 'CAPACIDAD'], ['SOLDADOS', 'SOLDADOS'], ['DEFESA', 'DEFENSA'], ['CIÊNCIA', 'CIENCIA'], ['COMIDA', 'COMIDA'],
    ['ENERGIA', 'ENERGÍA'], ['RADIAÇÃO', 'RADIACIÓN'], ['RADIAÇÃO', 'RADIACIÓN'], ['OXIGÊNIO', 'OXÍGENO'], ['O₂', 'O₂'],
    ['AVANÇAR 1 DIA', 'AVANZAR 1 DÍA'], ['AVANÇAR 3 DIAS', 'AVANZAR 3 DÍAS'], ['EXPANDIR VAULT', 'EXPANDIR REFUGIO'],
    ['GERIR SALA', 'GESTIONAR SALA'], ['GERIR SALA', 'GESTIONAR SALA'], ['PRESIDENTE', 'PRESIDENTE'], ['Médico', 'Médico'],
    ['Engenheiro', 'Ingeniero'], ['Soldado', 'Soldado'], ['Trabalhador', 'Trabajador'], ['Falar', 'Hablar'], ['LEALDADE', 'LEALTAD'],
    ['Estrada', 'Carretera'], ['Abrigo', 'Refugio'], ['Horta Hidropônica', 'Huerta hidropónica'], ['Horta Hidroponica', 'Huerta hidropónica'],
    ['Purificador de Água', 'Purificador de agua'], ['Purificador de Agua', 'Purificador de agua'], ['Gerador a Petróleo', 'Generador de petróleo'], ['Gerador a Petroleo', 'Generador de petróleo'],
    ['Painel Solar', 'Panel solar'], ['Poço de Petróleo', 'Pozo de petróleo'], ['Poco de Petroleo', 'Pozo de petróleo'], ['Oficina', 'Taller'], ['Mercado', 'Mercado'],
    ['Clínica', 'Clínica'], ['Posto de Guarda', 'Puesto de guardia'], ['Praça', 'Plaza'], ['Descontaminador', 'Descontaminador'],
    ['Dar teto à próxima geração', 'Dar techo a la próxima generación'], ['Reacender os serviços vitais', 'Reactivar los servicios vitales'], ['Criar uma comunidade', 'Crear una comunidad'], ['Deixar um legado', 'Dejar un legado'],
    ['Liga os prédios à Porta do Vault.', 'Conecta los edificios con la Puerta del Refugio.'], ['Moradia para 12 cidadãos.', 'Vivienda para 12 ciudadanos.'],
    ['Produz 40 de comida por dia. 6 vagas.', 'Produce 40 de comida al día. 6 puestos.'], ['Produz 50 de água por dia. 3 vagas.', 'Produce 50 de agua al día. 3 puestos.'],
    ['Gera 30 de energia queimando 1 barril por dia. 3 vagas.', 'Genera 30 de energía quemando 1 barril al día. 3 puestos.'], ['Gera 8 de energia sem combustível.', 'Genera 8 de energía sin combustible.'],
    ['Extrai 4 barris por dia. 4 vagas.', 'Extrae 4 barriles al día. 4 puestos.'], ['Produz 14 de sucata por dia. 8 vagas.', 'Produce 14 de chatarra al día. 8 puestos.'],
    ['Comércio: +6 de sucata e felicidade num raio de 6.', 'Comercio: +6 de chatarra y felicidad en un radio de 6.'], ['Saúde: felicidade num raio de 7.', 'Salud: felicidad en un radio de 7.'],
    ['Segurança: felicidade num raio de 7.', 'Seguridad: felicidad en un radio de 7.'], ['Convivência: felicidade num raio de 6.', 'Convivencia: felicidad en un radio de 6.'],
    ['Limpa 1 terreno contaminado', 'Limpia 1 terreno contaminado'], ['APÓS A GUERRA, TUDO MUDA', 'DESPUÉS DE LA GUERRA, TODO CAMBIA'],
    ['/!\\ ALERTA DE SISTEMA - AUTORIZACAO NECESSARIA /!\\', '/!\\ ALERTA DE SISTEMA - AUTORIZACIÓN NECESARIA /!\\'], ['NAO DEFINIDO', 'NO DEFINIDO'],
    ['PERDAS CIVIS ESTIMADAS', 'PÉRDIDAS CIVILES ESTIMADAS'], ['INSERIR CODIGO DE AUTORIZACAO DE LANCAMENTO', 'INTRODUCE EL CÓDIGO DE AUTORIZACIÓN DE LANZAMIENTO'],
    ['CODIGO DE LANCAMENTO', 'CÓDIGO DE LANZAMIENTO'], ['GIRAR CHAVE', 'GIRAR LA LLAVE'], ['CANCELAR', 'CANCELAR'], ['SESSAO DO CONGRESSO NACIONAL', 'SESIÓN DEL CONGRESO NACIONAL'],
    ['PROJETO DE LEI', 'PROYECTO DE LEY'], ['VOTO SECRETO', 'VOTO SECRETO'], ['CONFIRMA', 'CONFIRMAR'], ['VOTAR SIM', 'VOTAR SÍ'], ['ABANDONAR PROJETO', 'ABANDONAR PROYECTO'],
    ['ESCOLHA O PILAR DA NOVA REPUBLICA', 'ELIGE EL PILAR DE LA NUEVA REPÚBLICA'], ['ESTADO ESTRATOCRATICO', 'ESTADO ESTRATOCRÁTICO'],
    ['TECNOCRACIA ABSOLUTA', 'TECNOCRACIA ABSOLUTA'], ['ESTADO TEOCRATICO', 'ESTADO TEOCRÁTICO'], ['ADIAR NOVA ORDEM', 'POSPONER EL NUEVO ORDEN'],
    ['CONTINUAR', 'CONTINUAR'], ['NOVO JOGO', 'NUEVA PARTIDA'], ['OPÇÕES', 'OPCIONES'], ['OPCOES', 'OPCIONES'], ['CRÉDITOS', 'CRÉDITOS'],
    ['CRÉDITO', 'CRÉDITO'], ['COMEÇAR DE NOVO?', '¿EMPEZAR DE NUEVO?'], ['SIM, NOVO JOGO', 'SÍ, NUEVA PARTIDA'], ['VOLTAR', 'VOLVER'],
    ['TUTORIAL E DICAS', 'TUTORIAL Y CONSEJOS'], ['REINICIAR TUTORIAL', 'REINICIAR TUTORIAL'], ['TELA CHEIA', 'PANTALLA COMPLETA'],
    ['PRESSIONE ENTER · ESC VOLTA', 'PULSA ENTER · ESC VUELVE'], ['ENTENDI', 'ENTENDIDO'], ['AGUARDANDO SUA AÇÃO', 'ESPERANDO TU ACCIÓN'],
    ['Ação', 'Acción'], ['Aprovada', 'Aprobada'], ['Rejeitada', 'Rechazada'], ['Pendente', 'Pendiente'], ['Em pauta', 'En agenda'], ['Encerrada', 'Cerrada'],
    ['Colocar em votacao', 'Poner a votación'], ['Colocar em votação', 'Poner a votación'], ['Pauta do Congresso', 'Agenda del Congreso'],
    ['Bancadas', 'Bloques'], ['assentos', 'escaños'], ['Apoio obtido', 'Apoyo obtenido'], ['Negociar', 'Negociar'], ['Força corporativa', 'Poder corporativo'],
    ['Forca corporativa', 'Poder corporativo'], ['Saldo mensal', 'Saldo mensual'], ['Resultado fiscal', 'Resultado fiscal'], ['Superávit', 'Superávit'],
    ['Superavit', 'Superávit'], ['Déficit', 'Déficit'], ['Deficit', 'Déficit'], ['Arrecadação', 'Recaudación'], ['Arrecadacao', 'Recaudación'],
    ['Política tributária', 'Política tributaria'], ['Politica tributaria', 'Política tributaria'], ['Carga configurada', 'Carga configurada'], ['Projeção mensal', 'Proyección mensual'],
    ['Caixa 2', 'Caja B'], ['Desviar Fundos para as Ilhas Cayman', 'Desviar fondos a las Islas Caimán'], ['ESTATIZAR MEGACORPORAÇÕES', 'ESTATIZAR MEGACORPORACIONES'],
    ['LEI TRABALHISTA', 'LEY LABORAL'], ['LEIS', 'LEYES'], ['PONTOS DE PESQUISA MILITAR', 'PUNTOS DE INVESTIGACIÓN MILITAR'], ['PROJETOS ESPECIAIS', 'PROYECTOS ESPECIALES'],
    ['PONTOS DE PESQUISA', 'PUNTOS DE INVESTIGACIÓN'], ['DESBLOQUEADO', 'DESBLOQUEADO'], ['BLOQUEADO', 'BLOQUEADO'], ['PESQUISAR', 'INVESTIGAR'],
    ['MELHORAR', 'MEJORAR'], ['NÍVEL MÁXIMO', 'NIVEL MÁXIMO'], ['NIVEL MAXIMO', 'NIVEL MÁXIMO'], ['PRODUÇÃO', 'PRODUCCIÓN'],
    ['PRODUCAO', 'PRODUCCIÓN'], ['MANUTENÇÃO', 'MANTENIMIENTO'], ['MANUTENCAO', 'MANTENIMIENTO'], ['TRABALHADORES', 'TRABAJADORES'],
    ['Trabalhadores ativos', 'Trabajadores activos'], ['Sucata disponível', 'Chatarra disponible'], ['Ciência disponível', 'Ciencia disponible'],
    ['Ciencia disponivel', 'Ciencia disponible'], ['Próximo nível', 'Próximo nivel'], ['Proximo nivel', 'Próximo nivel'], ['Dreno de oxigênio desta sala', 'Drenaje de oxígeno de esta sala'],
    ['Dreno de oxigenio desta sala', 'Drenaje de oxígeno de esta sala'], ['Manutenção do suporte', 'Mantenimiento del soporte'], ['Melhorar sala', 'Mejorar sala'],
    ['Relação', 'Relación'], ['Relacao', 'Relación'], ['Poder', 'Poder'], ['Defesa digital', 'Defensa digital'], ['Em guerra', 'En guerra'], ['Aliado', 'Aliado'],
    ['Acordo comercial', 'Acuerdo comercial'], ['Sem tratado', 'Sin tratado'], ['Fantoche', 'Títere'], ['Sancionado', 'Sancionado'], ['ZONA DE ANIQUILAÇÃO NUCLEAR', 'ZONA DE ANIQUILACIÓN NUCLEAR'],
    ['Relatório de missão', 'Informe de misión'], ['Missão concluída', 'Misión completada'], ['Enviar para a superfície', 'Enviar a la superficie'], ['EXPEDIÇÃO', 'EXPEDICIÓN'],
    ['SINAL DO EXPLORADOR FOI PERDIDO NO WASTELAND.', 'SE PERDIÓ LA SEÑAL DEL EXPLORADOR EN EL YERMO.'], ['Falar', 'Hablar'], ['ACEDER AO TERMINAL', 'ACCEDER AL TERMINAL'],
    ['Ligar som', 'Activar sonido'], ['Desligar som', 'Desactivar sonido'], ['Volume', 'Volumen'],
  ]),
  en: Object.freeze([
    // Global progression, levels, rewards and panel states.
    ['NÍVEIS', 'LEVELS'], ['níveis', 'levels'], ['TRILHA DE NÍVEIS', 'LEVEL TRACK'], ['PROGRESSÃO', 'PROGRESSION'], ['Progressão', 'Progression'],
    ['PRÊMIO MÁXIMO', 'MAXIMUM REWARD'], ['PRÊMIO ESPECIAL', 'SPECIAL REWARD'], ['Prêmio de nível', 'Level reward'],
    ['Ponto de partida da jornada', 'Starting point of the journey'], ['Já alcançado', 'Already reached'], ['VOCÊ ESTÁ AQUI', 'YOU ARE HERE'],
    ['A Porta do Vault abre no nível', 'The Vault Door opens at level'], ['A Porta do Vault só abre neste nível', 'The Vault Door only opens at this level'], ['A Porta do Vault só abre no nível', 'The Vault Door only opens at level'],
    ['XP máximo', 'MAX XP'], ['Próximo prêmio especial', 'Next special reward'], ['Você chegou ao nível máximo.', 'You reached the maximum level.'],
    ['faltam', 'missing'], ['níveis', 'levels'], ['nível', 'level'], ['capítulos recuperados', 'chapters recovered'], ['Modo dos prêmios', 'Reward mode'],
    ['Todo nível dá um prêmio do modo em que você está.', 'Every level grants a reward from your current mode.'],
    ['Nível comum', 'Standard level'], ['terminado em 5', 'ending in 5'], ['terminado em 0', 'ending in 0'],
    ['com título, vestimenta exclusiva e bônus extra.', 'with a title, exclusive outfit and extra bonus.'], ['(atual)', '(current)'],
    ['recompensas', 'rewards'], ['Título', 'Title'], ['Vestimenta exclusiva', 'Exclusive outfit'],
    ['Caixa nacional', 'National treasury'], ['Pontos de tecnologia', 'Technology points'], ['Água', 'Water'], ['Felicidade', 'Happiness'], ['Presidência', 'Presidency'], ['Cidade', 'City'],
    ['Não disponível', 'Unavailable'], ['Não definido', 'Undefined'], ['SEM SETOR DISPONÍVEL', 'NO SECTOR AVAILABLE'],
    ['Pronto para iniciar', 'Ready to start'], ['PP INSUFICIENTES', 'INSUFFICIENT RP'], ['DEPENDÊNCIA PENDENTE', 'DEPENDENCY PENDING'],
    ['CONCLUÍDO', 'COMPLETED'], ['INICIAR PROJETO', 'START PROJECT'], ['Pontos de experiência', 'Experience points'],
    ['Pontos de Pesquisa', 'Research points'], ['Pesquisa militar', 'Military research'], ['Nível', 'Level'], ['NÍVEL', 'LEVEL'],
    ['LINHA DE RECONSTRUÇÃO CONCLUÍDA', 'RECONSTRUCTION LINE COMPLETE'], ['ORDEM ATUAL', 'CURRENT ORDER'], ['REDE DE SOBREVIVÊNCIA', 'SURVIVAL NETWORK'],
    ['SISTEMA ONLINE', 'SYSTEM ONLINE'], ['ÚLTIMOS REGISTROS', 'LATEST RECORDS'], ['ESCOLHA UMA CONSTRUÇÃO', 'CHOOSE A BUILDING'],
    ['RECURSOS', 'RESOURCES'], ['FELICIDADE', 'HAPPINESS'], ['DENSIDADE', 'DENSITY'], ['CONTAMINADO', 'CONTAMINATED'], ['SERVIÇO ATIVO', 'SERVICE ACTIVE'],
    ['MONTANDO', 'ASSEMBLING'], ['OBRA PARA O NÍVEL', 'UPGRADE TO LEVEL'], ['FALTAM', 'MISSING'], ['BARRIS', 'BARRELS'], ['SEM DEFESA', 'NO DEFENSE'],
    ['FORTE DA SUPERFÍCIE', 'SURFACE FORT'], ['TERRENO DO FORTE', 'FORT SITE'], ['BARRIS A PROTEGER', 'BARRELS TO PROTECT'],
    ['ATAQUE REPELIDO', 'ATTACK REPELLED'], ['CAMPO SAQUEADO', 'FIELD LOOTED'], ['MERCADO SOMBRIO', 'DARK MARKET'], ['RECOMPENSA', 'REWARD'],
    ['BATEDORES', 'SCOUTS'], ['ANDAR', 'FLOOR'], ['SETOR', 'SECTOR'], ['VÁ ATÉ LÁ E APERTE [E]', 'GO THERE AND PRESS [E]'],
    ['PROBLEMA NO VAULT', 'VAULT PROBLEM'], ['ESCONDIDA', 'HIDDEN'], ['DESCONFIANÇA DO VAULT', 'VAULT SUSPICION'],
    ['ANO ZERO PÓS-BOMBA', 'POST-BOMB YEAR ZERO'], ['ECONOMIA DE SUCATA', 'SCRAP ECONOMY'], ['A superfície morreu.', 'The surface died.'],
    ['PRESIDENTE EM PATRULHA', 'PRESIDENT ON PATROL'], ['GERIR SALA', 'MANAGE ROOM'], ['VOLTAR AO VAULT', 'RETURN TO VAULT'],
    ['REPARAR', 'REPAIR'], ['RECRUTAR', 'RECRUIT'], ['EQUIPAR GUARDA', 'EQUIP GUARD'], ['TRATAR RADIAÇÃO', 'TREAT RADIATION'],
    ['TRANSMITIR SINAL', 'BROADCAST SIGNAL'], ['OPERAR A SALA DE RÁDIO', 'OPERATE RADIO ROOM'], ['ABRIR O GUARDA-ROUPA', 'OPEN WARDROBE'],
    ['CHEIO', 'FULL'], ['ERGUER', 'BUILD'], ['FORTE', 'FORT'], ['ERGUENDO', 'BUILDING'], ['ATAQUE REPELIDO', 'ATTACK REPELLED'],
    ['MODO PRESIDÊNCIA', 'PRESIDENCY MODE'], ['PRÓXIMO', 'NEXT'], ['ATUAL', 'CURRENT'],
    ['Agenda presidencial', 'Presidential agenda'], ['Próximo movimento', 'Next move'], ['Proximo movimento', 'Next move'],
    ['Nação', 'Nation'], ['Nacao', 'Nation'], ['Painel mundial', 'World panel'], ['Diplomacia e Mapa', 'Diplomacy and map'],
    ['Diplomacia de risco', 'High-risk diplomacy'], ['Reputação global', 'Global reputation'], ['Reputacao global', 'Global reputation'],
    ['Sanções internacionais ativas', 'International sanctions active'], ['Sancoes internacionais ativas', 'International sanctions active'],
    ['Sem sanções internacionais', 'No international sanctions'], ['Sem sancoes internacionais', 'No international sanctions'],
    ['Nação selecionada', 'Selected nation'], ['Nacao selecionada', 'Selected nation'], ['Área', 'Area'], ['Area', 'Area'],
    ['População', 'Population'], ['Populacao', 'Population'], ['Governo', 'Government'], ['Território anexado', 'Annexed territory'],
    ['Comércio', 'Trade'], ['Comercio', 'Trade'], ['Aliança', 'Alliance'], ['Alianca', 'Alliance'], ['Sabotar', 'Sabotage'],
    ['Guerra', 'War'], ['Impor sanção', 'Impose sanction'], ['Impor sancao', 'Impose sanction'], ['Exigir anexação', 'Demand annexation'],
    ['Exigir anexacao', 'Demand annexation'], ['Ataque nuclear', 'Nuclear strike'], ['Buscar país', 'Search country'], ['Buscar pais', 'Search country'],
    ['Propor Acordo Comercial', 'Propose trade agreement'], ['Importar aço', 'Import steel'], ['Propor Aliança', 'Propose alliance'],
    ['Propor Alianca', 'Propose alliance'], ['Lançar Ciberataque', 'Launch cyberattack'], ['Lançar Vírus Sintético', 'Launch synthetic virus'],
    ['Orquestrar Falsa Bandeira', 'Orchestrate false flag'], ['INSULTAR LÍDER ESTRANGEIRO', 'INSULT FOREIGN LEADER'],
    ['INSULTAR LIDER ESTRANGEIRO', 'INSULT FOREIGN LEADER'], ['Financiar Rebeldes', 'Fund rebels'], ['Absorver pela União', 'Absorb into Union'],
    ['Orçamento nacional', 'National budget'], ['Orcamento nacional', 'National budget'], ['Imposto de renda', 'Income tax'],
    ['Imposto sobre consumo', 'Consumption tax'], ['Gastos públicos', 'Public spending'], ['Gastos publicos', 'Public spending'],
    ['Saúde', 'Health'], ['Saude', 'Health'], ['Educação', 'Education'], ['Educacao', 'Education'], ['Infraestrutura', 'Infrastructure'],
    ['Defesa', 'Defense'], ['Ciência e Tecnologia', 'Science and technology'], ['Ciencia e Tecnologia', 'Science and technology'],
    ['Aplicar orçamento', 'Apply budget'], ['Aplicar orcamento', 'Apply budget'], ['Congresso suspenso', 'Congress suspended'],
    ['Instituições', 'Institutions'], ['Instituicoes', 'Institutions'], ['Leis são aprovadas por decreto enquanto durar o estado de sítio.', 'Laws are approved by decree while martial law lasts.'],
    ['Projetos Internos', 'Internal projects'], ['Capacidade nacional', 'National capacity'], ['Automatizar Parque Industrial', 'Automate industrial park'],
    ['Construir Rede Mao Morta (IA)', 'Build Dead Hand network (AI)'], ['Economia de Sucata', 'Scrap economy'], ['Ano Zero Pos-Bomba', 'Post-bomb Year Zero'],
    ['Ano Zero Pós-Bomba', 'Post-bomb Year Zero'], ['Purificador de Agua', 'Water purifier'], ['Gerador Geotermico', 'Geothermal generator'],
    ['Relações Internacionais', 'International relations'], ['Relacoes Internacionais', 'International relations'], ['Forças Armadas', 'Armed forces'],
    ['Forcas Armadas', 'Armed forces'], ['Tecnologia', 'Technology'], ['Congresso', 'Congress'], ['Países', 'Countries'], ['Paises', 'Countries'],
    ['Diário', 'Diary'], ['DIÁRIO', 'DIARY'], ['ENCICLOPÉDIA DO ERMO', 'WASTELAND ENCYCLOPEDIA'], ['ENCICLOPEDIA DO ERMO', 'WASTELAND ENCYCLOPEDIA'],
    ['FECHAR ARQUIVO', 'CLOSE ARCHIVE'], ['NOVA PARTIDA', 'NEW GAME'], ['REINICIAR', 'RESTART'], ['Velocidade do tempo', 'Time speed'],
    ['REDE DE SOBREVIVÊNCIA · SUCATAS', 'SURVIVAL NETWORK · SCRAP'], ['DIÁRIO DE CAMPO', 'FIELD DIARY'], ['ÚLTIMOS REGISTOS', 'LATEST RECORDS'],
    ['Ultimos registros', 'Latest records'], ['SELECIONE UM SETOR', 'SELECT A SECTOR'], ['Escolha uma construção', 'Choose a building'],
    ['Escolha uma construcao', 'Choose a building'], ['Demolir', 'Demolish'], ['MODO CIDADE', 'CITY MODE'], ['RECONSTRUÇÃO', 'RECONSTRUCTION'],
    ['RECONSTRUCAO', 'RECONSTRUCTION'], ['COMANDO:', 'COMMAND:'], ['Custo:', 'Cost:'], ['sucatas', 'scrap'], ['PRESIDENTE EM PATRULHA', 'PRESIDENT ON PATROL'],
    ['SALAS', 'ROOMS'], ['CAPACIDADE', 'CAPACITY'], ['SOLDADOS', 'SOLDIERS'], ['DEFESA', 'DEFENSE'], ['CIÊNCIA', 'SCIENCE'], ['COMIDA', 'FOOD'],
    ['ENERGIA', 'ENERGY'], ['RADIAÇÃO', 'RADIATION'], ['RADIAÇÃO', 'RADIATION'], ['OXIGÊNIO', 'OXYGEN'], ['AVANÇAR 1 DIA', 'ADVANCE 1 DAY'],
    ['AVANÇAR 3 DIAS', 'ADVANCE 3 DAYS'], ['EXPANDIR VAULT', 'EXPAND VAULT'], ['GERIR SALA', 'MANAGE ROOM'], ['Médico', 'Doctor'],
    ['Engenheiro', 'Engineer'], ['Soldado', 'Soldier'], ['Trabalhador', 'Worker'], ['Falar', 'Talk'], ['LEALDADE', 'LOYALTY'],
    ['Estrada', 'Road'], ['Abrigo', 'Shelter'], ['Horta Hidropônica', 'Hydroponic farm'], ['Horta Hidroponica', 'Hydroponic farm'],
    ['Purificador de Água', 'Water purifier'], ['Purificador de Agua', 'Water purifier'], ['Gerador a Petróleo', 'Oil generator'], ['Gerador a Petroleo', 'Oil generator'],
    ['Painel Solar', 'Solar panel'], ['Poço de Petróleo', 'Oil well'], ['Poco de Petroleo', 'Oil well'], ['Oficina', 'Workshop'], ['Mercado', 'Market'],
    ['Clínica', 'Clinic'], ['Posto de Guarda', 'Guard post'], ['Praça', 'Plaza'], ['Descontaminador', 'Decontaminator'],
    ['Dar teto à próxima geração', 'House the next generation'], ['Reacender os serviços vitais', 'Restore vital services'], ['Criar uma comunidade', 'Create a community'], ['Deixar um legado', 'Leave a legacy'],
    ['Liga os prédios à Porta do Vault.', 'Connect buildings to the Vault Door.'], ['Moradia para 12 cidadãos.', 'Housing for 12 citizens.'],
    ['Produz 40 de comida por dia. 6 vagas.', 'Produces 40 food per day. 6 jobs.'], ['Produz 50 de água por dia. 3 vagas.', 'Produces 50 water per day. 3 jobs.'],
    ['Gera 30 de energia queimando 1 barril por dia. 3 vagas.', 'Generates 30 energy by burning 1 barrel per day. 3 jobs.'], ['Gera 8 de energia sem combustível.', 'Generates 8 energy without fuel.'],
    ['Extrai 4 barris por dia. 4 vagas.', 'Extracts 4 barrels per day. 4 jobs.'], ['Produz 14 de sucata por dia. 8 vagas.', 'Produces 14 scrap per day. 8 jobs.'],
    ['Comércio: +6 de sucata e felicidade num raio de 6.', 'Trade: +6 scrap and happiness within a radius of 6.'], ['Saúde: felicidade num raio de 7.', 'Health: happiness within a radius of 7.'],
    ['Segurança: felicidade num raio de 7.', 'Security: happiness within a radius of 7.'], ['Convivência: felicidade num raio de 6.', 'Community: happiness within a radius of 6.'],
    ['Limpa 1 terreno contaminado', 'Cleans 1 contaminated tile'], ['APÓS A GUERRA, TUDO MUDA', 'AFTER THE WAR, EVERYTHING CHANGES'],
    ['/!\\ ALERTA DE SISTEMA - AUTORIZACAO NECESSARIA /!\\', '/!\\ SYSTEM ALERT - AUTHORIZATION REQUIRED /!\\'], ['NAO DEFINIDO', 'UNDEFINED'],
    ['PERDAS CIVIS ESTIMADAS', 'ESTIMATED CIVILIAN LOSSES'], ['INSERIR CODIGO DE AUTORIZACAO DE LANCAMENTO', 'ENTER LAUNCH AUTHORIZATION CODE'],
    ['CODIGO DE LANCAMENTO', 'LAUNCH CODE'], ['GIRAR CHAVE', 'TURN KEY'], ['CANCELAR', 'CANCEL'], ['SESSAO DO CONGRESSO NACIONAL', 'NATIONAL CONGRESS SESSION'],
    ['PROJETO DE LEI', 'BILL'], ['VOTO SECRETO', 'SECRET BALLOT'], ['CONFIRMA', 'CONFIRM'], ['VOTAR SIM', 'VOTE YES'], ['ABANDONAR PROJETO', 'ABANDON PROJECT'],
    ['ESCOLHA O PILAR DA NOVA REPUBLICA', 'CHOOSE THE PILLAR OF THE NEW REPUBLIC'], ['ESTADO ESTRATOCRATICO', 'STRATOCRATIC STATE'],
    ['TECNOCRACIA ABSOLUTA', 'ABSOLUTE TECHNOCRACY'], ['ESTADO TEOCRATICO', 'THEOCRATIC STATE'], ['ADIAR NOVA ORDEM', 'POSTPONE NEW ORDER'],
    ['CONTINUAR', 'CONTINUE'], ['NOVO JOGO', 'NEW GAME'], ['OPÇÕES', 'OPTIONS'], ['OPCOES', 'OPTIONS'], ['CRÉDITOS', 'CREDITS'],
    ['CRÉDITO', 'CREDIT'], ['COMEÇAR DE NOVO?', 'START OVER?'], ['SIM, NOVO JOGO', 'YES, NEW GAME'], ['VOLTAR', 'BACK'],
    ['TUTORIAL E DICAS', 'TUTORIAL AND TIPS'], ['REINICIAR TUTORIAL', 'RESTART TUTORIAL'], ['TELA CHEIA', 'FULLSCREEN'],
    ['PRESSIONE ENTER · ESC VOLTA', 'PRESS ENTER · ESC BACK'], ['ENTENDI', 'GOT IT'], ['AGUARDANDO SUA AÇÃO', 'WAITING FOR YOUR ACTION'],
    ['Ação', 'Action'], ['Aprovada', 'Approved'], ['Rejeitada', 'Rejected'], ['Pendente', 'Pending'], ['Em pauta', 'On agenda'], ['Encerrada', 'Closed'],
    ['Colocar em votacao', 'Put to vote'], ['Colocar em votação', 'Put to vote'], ['Pauta do Congresso', 'Congress agenda'], ['Bancadas', 'Factions'],
    ['assentos', 'seats'], ['Apoio obtido', 'Support obtained'], ['Negociar', 'Negotiate'], ['Força corporativa', 'Corporate power'], ['Forca corporativa', 'Corporate power'],
    ['Saldo mensal', 'Monthly balance'], ['Resultado fiscal', 'Fiscal result'], ['Superávit', 'Surplus'], ['Superavit', 'Surplus'], ['Déficit', 'Deficit'], ['Deficit', 'Deficit'],
    ['Arrecadação', 'Revenue'], ['Arrecadacao', 'Revenue'], ['Política tributária', 'Tax policy'], ['Politica tributaria', 'Tax policy'], ['Carga configurada', 'Configured tax load'],
    ['Projeção mensal', 'Monthly projection'], ['Caixa 2', 'Slush fund'], ['Desviar Fundos para as Ilhas Cayman', 'Divert funds to the Cayman Islands'], ['ESTATIZAR MEGACORPORAÇÕES', 'NATIONALIZE MEGACORPORATIONS'],
    ['LEI TRABALHISTA', 'LABOR LAW'], ['LEIS', 'LAWS'], ['PONTOS DE PESQUISA MILITAR', 'MILITARY RESEARCH POINTS'], ['PROJETOS ESPECIAIS', 'SPECIAL PROJECTS'],
    ['PONTOS DE PESQUISA', 'RESEARCH POINTS'], ['DESBLOQUEADO', 'UNLOCKED'], ['BLOQUEADO', 'LOCKED'], ['PESQUISAR', 'RESEARCH'], ['MELHORAR', 'UPGRADE'],
    ['NÍVEL MÁXIMO', 'MAX LEVEL'], ['NIVEL MAXIMO', 'MAX LEVEL'], ['PRODUÇÃO', 'PRODUCTION'], ['PRODUCAO', 'PRODUCTION'], ['MANUTENÇÃO', 'MAINTENANCE'],
    ['MANUTENCAO', 'MAINTENANCE'], ['TRABALHADORES', 'WORKERS'], ['Trabalhadores ativos', 'Active workers'], ['Sucata disponível', 'Available scrap'],
    ['Ciência disponível', 'Available science'], ['Ciencia disponivel', 'Available science'], ['Próximo nível', 'Next level'], ['Proximo nivel', 'Next level'],
    ['Dreno de oxigênio desta sala', 'Room oxygen drain'], ['Dreno de oxigenio desta sala', 'Room oxygen drain'], ['Manutenção do suporte', 'Life-support maintenance'],
    ['Manutencao do suporte', 'Life-support maintenance'], ['Melhorar sala', 'Upgrade room'], ['Relação', 'Relation'], ['Relacao', 'Relation'], ['Poder', 'Power'],
    ['Defesa digital', 'Cyber defense'], ['Em guerra', 'At war'], ['Aliado', 'Ally'], ['Acordo comercial', 'Trade agreement'], ['Sem tratado', 'No treaty'], ['Fantoche', 'Puppet'],
    ['Sancionado', 'Sanctioned'], ['ZONA DE ANIQUILAÇÃO NUCLEAR', 'NUCLEAR ANNIHILATION ZONE'], ['Relatório de missão', 'Mission report'], ['Missão concluída', 'Mission complete'],
    ['Enviar para a superfície', 'Send to the surface'], ['EXPEDIÇÃO', 'EXPEDITION'], ['SINAL DO EXPLORADOR FOI PERDIDO NO WASTELAND.', 'EXPLORER SIGNAL LOST IN THE WASTELAND.'],
    ['Falar', 'Talk'], ['ACEDER AO TERMINAL', 'ACCESS TERMINAL'], ['Ligar som', 'Enable sound'], ['Desligar som', 'Disable sound'], ['Volume', 'Volume'],
  ]),
});

// Mensagens geradas pelo motor de simulação. Elas não são apenas títulos de
// UI: aparecem depois de uma ação e precisam trocar de idioma no mesmo frame
// que o restante do painel.
const DYNAMIC_UI_TRANSLATIONS = Object.freeze({
  es: Object.freeze([
    ['Sucata insuficiente.', 'Chatarra insuficiente.'],
    ['Sucata insuficiente para este projeto.', 'Chatarra insuficiente para este proyecto.'],
    ['Sucata insuficiente para melhorar a sala.', 'Chatarra insuficiente para mejorar la sala.'],
    ['Ciência insuficiente para melhorar a sala.', 'Ciencia insuficiente para mejorar la sala.'],
    ['Caixa insuficiente para esta ação.', 'Tesoro insuficiente para esta acción.'],
    ['Energia insuficiente para esta ação.', 'Energía insuficiente para esta acción.'],
    ['Petróleo insuficiente para esta ação.', 'Petróleo insuficiente para esta acción.'],
    ['Sala não encontrada.', 'Sala no encontrada.'],
    ['Nenhum habitante disponível para expedição.', 'Ningún habitante disponible para expedición.'],
    ['O Vault sobrevive mais um mês.', 'El Refugio sobrevive un mes más.'],
    ['A partida foi encerrada.', 'La partida ha terminado.'],
    ['Projeto de sobrevivência inválido.', 'Proyecto de supervivencia no válido.'],
    ['Caixa insuficiente para o Mega-Vault.', 'Tesoro insuficiente para el Mega-Refugio.'],
    ['Aço insuficiente para o Mega-Vault.', 'Acero insuficiente para el Mega-Refugio.'],
  ]),
  en: Object.freeze([
    ['Sucata insuficiente.', 'Insufficient scrap.'],
    ['Sucata insuficiente para este projeto.', 'Not enough scrap for this project.'],
    ['Sucata insuficiente para melhorar a sala.', 'Not enough scrap to upgrade the room.'],
    ['Ciência insuficiente para melhorar a sala.', 'Not enough science to upgrade the room.'],
    ['Caixa insuficiente para esta ação.', 'Not enough treasury funds for this action.'],
    ['Energia insuficiente para esta ação.', 'Not enough energy for this action.'],
    ['Petróleo insuficiente para esta ação.', 'Not enough oil for this action.'],
    ['Sala não encontrada.', 'Room not found.'],
    ['Nenhum habitante disponível para expedição.', 'No inhabitant is available for an expedition.'],
    ['O Vault sobrevive mais um mês.', 'The Vault survives another month.'],
    ['A partida foi encerrada.', 'The game is over.'],
    ['Projeto de sobrevivência inválido.', 'Invalid survival project.'],
    ['Caixa insuficiente para o Mega-Vault.', 'Not enough treasury funds for the Mega-Vault.'],
    ['Aço insuficiente para o Mega-Vault.', 'Not enough steel for the Mega-Vault.'],
  ]),
});

const LEGACY_TRANSLATION_CACHE = new Map();
const CANONICAL_VARIANTS = new Map();
const CANONICAL_FOLD_VARIANTS = new Map();
const LOCALE_TARGETS = { es: new Map(), en: new Map() };
const SAFE_WORDS = Object.freeze([
  Object.freeze(['DIA', 'DÍA', 'DAY']), Object.freeze(['MÊS', 'MES', 'MONTH']), Object.freeze(['ANO', 'AÑO', 'YEAR']),
  Object.freeze(['SUCATA', 'CHATARRA', 'SCRAP']), Object.freeze(['SUCATAS', 'CHATARRAS', 'SCRAP']),
  Object.freeze(['COMIDA', 'COMIDA', 'FOOD']), Object.freeze(['ENERGIA', 'ENERGÍA', 'ENERGY']), Object.freeze(['ÁGUA', 'AGUA', 'WATER']),
  Object.freeze(['PETRÓLEO', 'PETRÓLEO', 'OIL']), Object.freeze(['NÍVEL', 'NIVEL', 'LEVEL']), Object.freeze(['NÍVEIS', 'NIVELES', 'LEVELS']),
  Object.freeze(['CIÊNCIA', 'CIENCIA', 'SCIENCE']), Object.freeze(['TRABALHADORES', 'TRABAJADORES', 'WORKERS']),
  Object.freeze(['PRODUÇÃO', 'PRODUCCIÓN', 'PRODUCTION']), Object.freeze(['MANUTENÇÃO', 'MANTENIMIENTO', 'MAINTENANCE']),
  Object.freeze(['CAPACIDADE', 'CAPACIDAD', 'CAPACITY']), Object.freeze(['DEFESA', 'DEFENSA', 'DEFENSE']),
  Object.freeze(['SOLDADOS', 'SOLDADOS', 'SOLDIERS']), Object.freeze(['RADIAÇÃO', 'RADIACIÓN', 'RADIATION']),
  Object.freeze(['PONTOS', 'PUNTOS', 'POINTS']), Object.freeze(['PESQUISA', 'INVESTIGACIÓN', 'RESEARCH']),
  Object.freeze(['RECOMPENSA', 'RECOMPENSA', 'REWARD']), Object.freeze(['FELICIDADE', 'FELICIDAD', 'HAPPINESS']),
]);

// Vocabulário de interface que aparece em avisos dinâmicos, tooltips e
// painéis recriados pelo motor do bunker. As frases maiores continuam no
// catálogo acima; este vocabulário impede que um aviso novo fique misturado
// em português quando o jogador troca de idioma no meio da partida.
const LEXICAL_WORDS = Object.freeze([
  ['MODO', 'MODO', 'MODE'], ['HISTÓRIA', 'HISTORIA', 'STORY'], ['DIÁRIO', 'DIARIO', 'DIARY'],
  ['CIDADE', 'CIUDAD', 'CITY'], ['RECONSTRUÇÃO', 'RECONSTRUCCIÓN', 'RECONSTRUCTION'],
  ['ORDEM', 'ORDEN', 'ORDER'], ['ATUAL', 'ACTUAL', 'CURRENT'], ['PRÓXIMO', 'PRÓXIMO', 'NEXT'],
  ['MÁXIMO', 'MÁXIMO', 'MAXIMUM'], ['MÍNIMO', 'MÍNIMO', 'MINIMUM'], ['PRÊMIO', 'PREMIO', 'PRIZE'],
  ['ESPECIAL', 'ESPECIAL', 'SPECIAL'], ['JORNADA', 'VIAJE', 'JOURNEY'], ['CAPÍTULO', 'CAPÍTULO', 'CHAPTER'],
  ['CAPÍTULOS', 'CAPÍTULOS', 'CHAPTERS'], ['PONTO', 'PUNTO', 'POINT'], ['PONTOS', 'PUNTOS', 'POINTS'],
  ['EXPERIÊNCIA', 'EXPERIENCIA', 'EXPERIENCE'], ['MILITAR', 'MILITAR', 'MILITARY'], ['TECNOLOGIA', 'TECNOLOGÍA', 'TECHNOLOGY'],
  ['OXIGÊNIO', 'OXÍGENO', 'OXYGEN'], ['SAÚDE', 'SALUD', 'HEALTH'], ['CONSUMO', 'CONSUMO', 'CONSUMPTION'], ['VAGAS', 'PUESTOS', 'JOBS'],
  ['RECURSOS', 'RECURSOS', 'RESOURCES'], ['DISPONÍVEL', 'DISPONIBLE', 'AVAILABLE'], ['DISPONÍVEIS', 'DISPONIBLES', 'AVAILABLE'],
  ['INSUFICIENTE', 'INSUFICIENTE', 'INSUFFICIENT'], ['INSUFICIENTES', 'INSUFICIENTES', 'INSUFFICIENT'],
  ['CONSTRUIR', 'CONSTRUIR', 'BUILD'], ['CONSTRUÇÃO', 'CONSTRUCCIÓN', 'BUILDING'], ['MELHORAR', 'MEJORAR', 'UPGRADE'],
  ['MELHORIA', 'MEJORA', 'UPGRADE'], ['CUSTO', 'COSTE', 'COST'], ['GRÁTIS', 'GRATIS', 'FREE'],
  ['PERFURE', 'PERFORA', 'DRILL'], ['AQUI', 'AQUÍ', 'HERE'],
  ['COMPRAR', 'COMPRAR', 'BUY'], ['VENDER', 'VENDER', 'SELL'], ['RECOLHER', 'RECOGER', 'COLLECT'],
  ['ENVIAR', 'ENVIAR', 'SEND'], ['VOLTAR', 'VOLVER', 'BACK'], ['FECHAR', 'CERRAR', 'CLOSE'],
  ['ABRIR', 'ABRIR', 'OPEN'], ['GERIR', 'GESTIONAR', 'MANAGE'], ['REPARAR', 'REPARAR', 'REPAIR'],
  ['RECRUTAR', 'RECLUTAR', 'RECRUIT'], ['EQUIPAR', 'EQUIPAR', 'EQUIP'], ['TRATAR', 'TRATAR', 'TREAT'],
  ['TRANSMITIR', 'TRANSMITIR', 'BROADCAST'], ['OPERAR', 'OPERAR', 'OPERATE'], ['SINAL', 'SEÑAL', 'SIGNAL'],
  ['EXPEDIÇÃO', 'EXPEDICIÓN', 'EXPEDITION'], ['SUPERFÍCIE', 'SUPERFICIE', 'SURFACE'], ['SUBTERRÂNEO', 'SUBTERRÁNEO', 'UNDERGROUND'],
  ['ANDAR', 'PLANTA', 'FLOOR'], ['SETOR', 'SECTOR', 'SECTOR'], ['TERRENO', 'TERRENO', 'PLOT'],
  ['LIVRE', 'LIBRE', 'FREE'], ['OCUPADO', 'OCUPADO', 'OCCUPIED'], ['GUERRA', 'GUERRA', 'WAR'],
  ['ALIANÇA', 'ALIANZA', 'ALLIANCE'], ['RELAÇÃO', 'RELACIÓN', 'RELATION'], ['PODER', 'PODER', 'POWER'],
  ['GOVERNO', 'GOBIERNO', 'GOVERNMENT'], ['POPULAÇÃO', 'POBLACIÓN', 'POPULATION'], ['ÁREA', 'ÁREA', 'AREA'],
  ['ACORDO', 'ACUERDO', 'AGREEMENT'], ['COMÉRCIO', 'COMERCIO', 'TRADE'], ['SANÇÃO', 'SANCIÓN', 'SANCTION'],
  ['ATAQUE', 'ATAQUE', 'ATTACK'], ['NUCLEAR', 'NUCLEAR', 'NUCLEAR'], ['SABOTAGEM', 'SABOTAJE', 'SABOTAGE'],
  ['AMEAÇA', 'AMENAZA', 'THREAT'], ['ALERTA', 'ALERTA', 'ALERT'], ['VITÓRIA', 'VICTORIA', 'VICTORY'],
  ['DERROTA', 'DERROTA', 'DEFEAT'], ['MENSAL', 'MENSUAL', 'MONTHLY'],
  ['ELEIÇÃO', 'ELECCIÓN', 'ELECTION'], ['LEI', 'LEY', 'LAW'], ['LEIS', 'LEYES', 'LAWS'], ['CONGRESSO', 'CONGRESO', 'CONGRESS'],
  ['APOIO', 'APOYO', 'SUPPORT'], ['NEGOCIAR', 'NEGOCIAR', 'NEGOTIATE'], ['IMPOSTO', 'IMPUESTO', 'TAX'],
  ['ORÇAMENTO', 'PRESUPUESTO', 'BUDGET'], ['GASTOS', 'GASTOS', 'SPENDING'], ['ARRECADAÇÃO', 'RECAUDACIÓN', 'REVENUE'],
  ['SALDO', 'SALDO', 'BALANCE'], ['SUPERÁVIT', 'SUPERÁVIT', 'SURPLUS'], ['DÉFICIT', 'DÉFICIT', 'DEFICIT'],
  ['INFLAÇÃO', 'INFLACIÓN', 'INFLATION'], ['DESEMPREGO', 'DESEMPLEO', 'UNEMPLOYMENT'], ['REPUTAÇÃO', 'REPUTACIÓN', 'REPUTATION'],
  ['GLOBAL', 'GLOBAL', 'GLOBAL'], ['INTERNACIONAL', 'INTERNACIONAL', 'INTERNATIONAL'], ['INSTITUIÇÕES', 'INSTITUCIONES', 'INSTITUTIONS'],
  ['PROJETOS', 'PROYECTOS', 'PROJECTS'], ['INTERNOS', 'INTERNOS', 'INTERNAL'], ['AUTOMATIZAR', 'AUTOMATIZAR', 'AUTOMATE'],
  ['AMBIENTE', 'AMBIENTE', 'ENVIRONMENT'], ['SOCIEDADE', 'SOCIEDAD', 'SOCIETY'], ['SEGURANÇA', 'SEGURIDAD', 'SECURITY'],
  ['PÚBLICOS', 'PÚBLICOS', 'PUBLIC'], ['EDUCAÇÃO', 'EDUCACIÓN', 'EDUCATION'], ['INFRAESTRUTURA', 'INFRAESTRUCTURA', 'INFRASTRUCTURE'],
  ['RENDA', 'RENTA', 'INCOME'], ['APLICAR', 'APLICAR', 'APPLY'], ['ESTADO', 'ESTADO', 'STATE'], ['PAÍS', 'PAÍS', 'COUNTRY'],
  ['PAÍSES', 'PAÍSES', 'COUNTRIES'], ['NAÇÃO', 'NACIÓN', 'NATION'], ['NAÇÕES', 'NACIONES', 'NATIONS'],
  ['PRESIDENTE', 'PRESIDENTE', 'PRESIDENT'], ['CIDADÃO', 'CIUDADANO', 'CITIZEN'], ['CIDADÃOS', 'CIUDADANOS', 'CITIZENS'],
  ['MORADORES', 'HABITANTES', 'RESIDENTS'], ['HABITANTES', 'HABITANTES', 'INHABITANTS'], ['TRATAMENTO', 'TRATAMIENTO', 'TREATMENT'],
  ['VACINA', 'VACUNA', 'VACCINE'], ['VACINAS', 'VACUNAS', 'VACCINES'], ['DOENTE', 'ENFERMO', 'SICK'], ['SAUDÁVEL', 'SALUDABLE', 'HEALTHY'],
  ['ESCOLHA', 'ELECCIÓN', 'CHOICE'], ['ESCOLHAS', 'ELECCIONES', 'CHOICES'], ['PROBLEMA', 'PROBLEMA', 'PROBLEM'],
  ['SOLUÇÃO', 'SOLUCIÓN', 'SOLUTION'], ['ATIVO', 'ACTIVO', 'ACTIVE'], ['ATIVA', 'ACTIVA', 'ACTIVE'], ['ATIVOS', 'ACTIVOS', 'ACTIVE'],
  ['INATIVO', 'INACTIVO', 'INACTIVE'], ['CHEIO', 'LLENO', 'FULL'], ['VAZIO', 'VACÍO', 'EMPTY'], ['PRONTO', 'LISTO', 'READY'],
  ['CONCLUÍDO', 'COMPLETADO', 'COMPLETED'], ['BLOQUEADO', 'BLOQUEADO', 'LOCKED'], ['DESBLOQUEADO', 'DESBLOQUEADO', 'UNLOCKED'],
  ['PENDENTE', 'PENDIENTE', 'PENDING'], ['APROVADA', 'APROBADA', 'APPROVED'], ['REJEITADA', 'RECHAZADA', 'REJECTED'],
  ['FALTAM', 'FALTAN', 'MISSING'], ['FALTA', 'FALTA', 'MISSING'], ['ABAIXO', 'DEBAJO', 'BELOW'], ['ACIMA', 'ENCIMA', 'ABOVE'],
  ['DENTRO', 'DENTRO', 'INSIDE'], ['FORA', 'FUERA', 'OUTSIDE'], ['PRÓPRIO', 'PROPIO', 'OWN'], ['TOTAL', 'TOTAL', 'TOTAL'],
]);

// O DOM é recriado várias vezes durante uma partida. Por isso a tradução não
// pode depender de o texto ainda estar em português: ao trocar de idioma,
// normalizamos qualquer variante conhecida para a chave canônica e só então
// aplicamos o idioma escolhido. Isso também corrige o caminho EN -> ES -> PT.
function foldVariant(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}

for (const locale of ['es', 'en']) {
  for (const [source, target] of [...(LEGACY_UI_TRANSLATIONS[locale] ?? []), ...(DYNAMIC_UI_TRANSLATIONS[locale] ?? [])]) {
    const canonical = CANONICAL_FOLD_VARIANTS.get(foldVariant(source)) ?? source;
    CANONICAL_FOLD_VARIANTS.set(foldVariant(source), canonical);
    CANONICAL_FOLD_VARIANTS.set(foldVariant(target), canonical);
    CANONICAL_VARIANTS.set(source, canonical);
    CANONICAL_VARIANTS.set(target, canonical);
    if (target !== source) LOCALE_TARGETS[locale].set(canonical, target);
  }
}

function legacyTranslationPairs(language) {
  const locale = normalizeLanguage(language);
  if (!LEGACY_TRANSLATION_CACHE.has(locale)) LEGACY_TRANSLATION_CACHE.set(locale, LEGACY_UI_TRANSLATIONS[locale] ?? []);
  return LEGACY_TRANSLATION_CACHE.get(locale);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceVariants(value, mapping, preserveMatchCase = false) {
  const variants = [...mapping.keys()].filter(Boolean).sort((a, b) => b.length - a.length);
  if (!variants.length) return String(value ?? '');
  const pattern = new RegExp(variants.map(escapeRegExp).join('|'), 'g');
  return String(value ?? '').replace(pattern, (match) => {
    const replacement = mapping.get(match) ?? match;
    return preserveMatchCase ? preserveCase(match, replacement) : replacement;
  });
}

function replaceSafeWords(value, language) {
  const localeIndex = normalizeLanguage(language) === 'en' ? 2 : normalizeLanguage(language) === 'es' ? 1 : 0;
  const variants = new Map();
  for (const [canonical, spanish, english] of SAFE_WORDS) {
    variants.set(canonical, canonical);
    variants.set(spanish, canonical);
    // SCRAP/RESEARCH e outros recursos podem ser singular/plural em
    // português, mas o inglês usa a mesma palavra. Prefira a forma singular
    // quando o token estrangeiro não permite distinguir as duas formas.
    if (!variants.has(english)) variants.set(english, canonical);
  }
  let result = String(value ?? '');
  const names = [...variants.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|');
  if (names) {
    const boundary = new RegExp(`(^|[^\\p{L}\\p{N}_])(${names})(?=$|[^\\p{L}\\p{N}_])`, 'gu');
    result = result.replace(boundary, (_match, prefix, token) => `${prefix}${variants.get(token) ?? token}`);
  }
  if (localeIndex === 0) return result;
  const target = new Map(SAFE_WORDS.map(([canonical, spanish, english]) => [canonical, localeIndex === 1 ? spanish : english]));
  const targetNames = [...target.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|');
  const targetBoundary = new RegExp(`(^|[^\\p{L}\\p{N}_])(${targetNames})(?=$|[^\\p{L}\\p{N}_])`, 'gu');
  return result.replace(targetBoundary, (_match, prefix, token) => `${prefix}${target.get(token) ?? token}`);
}

function replaceKnownVariants(value) {
  return replaceVariants(value, CANONICAL_VARIANTS, true);
}

function preserveCase(token, replacement) {
  if (token === token.toLocaleUpperCase('pt-BR')) return replacement.toLocaleUpperCase('pt-BR');
  if (token[0] === token[0]?.toLocaleUpperCase('pt-BR')) {
    return replacement.charAt(0).toLocaleUpperCase('pt-BR') + replacement.slice(1);
  }
  return replacement.toLocaleLowerCase('pt-BR');
}

function replaceLexicalWords(value, language) {
  const locale = normalizeLanguage(language);
  const targetIndex = locale === 'es' ? 1 : locale === 'en' ? 2 : 0;
  const canonicalByVariant = new Map();
  const targetByCanonical = new Map();
  for (const [portuguese, spanish, english] of LEXICAL_WORDS) {
    const canonical = portuguese.toLocaleLowerCase('pt-BR');
    for (const variant of [portuguese, spanish, english]) canonicalByVariant.set(variant.toLocaleLowerCase('pt-BR'), canonical);
    // As chaves estão em caixa alta para facilitar a leitura do catálogo,
    // mas o texto devolvido deve respeitar a caixa original do token.
    targetByCanonical.set(canonical, [portuguese, spanish, english][targetIndex].toLocaleLowerCase('pt-BR'));
  }
  const variants = [...canonicalByVariant.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|');
  if (!variants) return String(value ?? '');
  const boundary = new RegExp(`(^|[^\\p{L}\\p{N}_])(${variants})(?=$|[^\\p{L}\\p{N}_])`, 'giu');
  return String(value ?? '').replace(boundary, (_match, prefix, token) => {
    const canonical = canonicalByVariant.get(token.toLocaleLowerCase('pt-BR'));
    const target = targetByCanonical.get(canonical);
    return `${prefix}${target ? preserveCase(token, target) : token}`;
  });
}

const TRANSLATION_MEMO = new Map();
const TRANSLATION_MEMO_LIMIT = 4000;

function translateUiTextUncached(value, language) {
  const locale = normalizeLanguage(language);
  let result = replaceSafeWords(replaceKnownVariants(value), 'pt-BR');
  result = replaceVariants(result, LOCALE_TARGETS[locale] ?? new Map());
  result = replaceSafeWords(result, locale);
  return replaceLexicalWords(result, locale);
}

export function translateUiText(value, language) {
  if (typeof value !== 'string') return translateUiTextUncached(value, language);
  const key = `${language}\u0000${value}`;
  const cached = TRANSLATION_MEMO.get(key);
  if (cached !== undefined) return cached;
  const result = translateUiTextUncached(value, language);
  // Textos com numeros que mudam (cronometros) geram entradas novas: o limite evita crescer sem fim.
  if (TRANSLATION_MEMO.size >= TRANSLATION_MEMO_LIMIT) TRANSLATION_MEMO.clear();
  TRANSLATION_MEMO.set(key, result);
  return result;
}

const TRANSLATION_SKIP_SELECTOR = 'script, style, .story-typewriter, .ending-story, .dialogue-text, [data-story-content]';

export function translateDom(root, language) {
  if (!root?.ownerDocument) return;
  const document = root.ownerDocument;
  const walker = document.createTreeWalker(root, 4);
  const textNodes = [];
  let node = walker.nextNode();
  while (node) {
    if (!node.parentElement?.closest(TRANSLATION_SKIP_SELECTOR)) textNodes.push(node);
    node = walker.nextNode();
  }
  for (const textNode of textNodes) {
    const translated = translateUiText(textNode.nodeValue, language);
    if (translated !== textNode.nodeValue) textNode.nodeValue = translated;
  }
  root.querySelectorAll?.('[aria-label], [placeholder], [title]').forEach((element) => {
    if (element.closest(TRANSLATION_SKIP_SELECTOR)) return;
    for (const attribute of ['aria-label', 'placeholder', 'title']) {
      if (element.hasAttribute(attribute)) element.setAttribute(attribute, translateUiText(element.getAttribute(attribute), language));
    }
  });
}

export function uiText(language, key, fallback = key) {
  const locale = normalizeLanguage(language);
  return UI_MESSAGES[locale]?.[key] ?? UI_MESSAGES['pt-BR'][key] ?? fallback;
}

export function languageOptionLabel(language, id) {
  return uiText(language, `profile.${id === 'pt-BR' ? 'pt' : id}`);
}

export function getUiLanguage(state) {
  return normalizeLanguage(state?.playerProfile?.language);
}

export function monthName(language, monthIndex) {
  const locale = normalizeLanguage(language);
  return MONTH_NAMES[locale][Number(monthIndex) - 1] ?? MONTH_NAMES[locale][0];
}
