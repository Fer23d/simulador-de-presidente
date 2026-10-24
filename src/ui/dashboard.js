import { COUNTRIES, createCountryProfile, getCountryById } from '../data/countries.js';
import { getVoteForecast } from '../core/congress.js';
import { BUDGET_LIMITS, projectBudget } from '../core/economy.js';
import { LAWS } from '../core/laws.js';
import { TECHNOLOGIES } from '../core/technology.js';
import { MILITARY_TECHNOLOGIES } from '../core/tech_tree.js';
import { calculateMilitaryMaintenance } from '../core/military.js';
import { calculateInternalMaintenance } from '../core/infrastructure.js';
import { MINISTERS } from '../core/ministers.js';
import { getRoomEconomyProfile, getRoomStorageCapacity, getRoomUpgradeCosts } from '../core/bunker_economy.js';
import { getFactionSupport } from '../core/factions.js';
import { canPromulgarConstituicao } from '../core/constitution.js';
import { RESOLUTIONS } from '../core/un_assembly.js';
import { getStoryEvent } from '../core/story_engine.js';
import { LORE_CHAPTERS, STORY_NOTICE } from '../core/story_lore.js';
import { INTERNAL_PROJECTS } from '../core/infrastructure.js';
import { broadcastShelterSignal, buildShelterRoom, calculateShelterCapacity, equipShelterGuard, findBuildSlots, getRoom, getShelterBuildCost, INITIAL_SHELTER_GRID, repairShelterGenerator, SHELTER_TYPES, upgradeShelterRoom, useShelterMedkit } from '../core/shelter_engine.js';
import { createRpgBunkerEngine } from '../core/rpg_bunker.js';
import { calculateSuppression, canResolveWastelandEvent, detainRebel, dismissExpeditionReport, getWastelandEvent, resolveWastelandEvent, startExpedition } from '../core/game_mechanics.js';
import { advanceEnvironmentCycle } from '../core/environment.js';
import { advanceLootboxClick, collectExpeditionLoot, createExpeditionLocation, openExpeditionLootbox, resolveExpeditionLocation } from '../core/expeditions.js';
import { playLootboxSound } from '../core/lootbox_renderer.js';
import { createPresidentSelectionMenu } from '../core/menu.js';
import { getWeather } from '../core/weather.js';
import { applyDialoguePacification } from '../core/dialogues.js';
import { DIALOGUE_CHAR_INTERVAL_MS, isDialogueTextComplete, renderDialogueView } from './dialogue_renderer.js';
import { equipSkin, getPresidentClassModifiers, PRESIDENT_CLASSES, PRESIDENT_SKINS, purchaseSkin, startGame } from '../core/player_state.js';
import {
  advanceMonth,
  absorverPaisParaUniao,
  dismissMinister,
  comprarBlindado,
  comprarCaca,
  comprarMaterialMilitar,
  comprarNavio,
  attemptAutogolpe,
  executarAutoGolpe,
  resolverAutoGolpe,
  changeTax,
  createGameState,
  decretarRevolucaoSocialista,
  financiarRebeldes,
  fundNuclear,
  importarRecursos,
  insultarNacao,
  dispensarAlertaHostil,
  hireMinister,
  resolvePeaceTreaty,
  createLeague,
  inviteToLeague,
  exigirAnexacao,
  hydrateGameState,
  negotiate,
  proposeAlliance,
  criarLiga,
  proposeTreaty,
  researchTechnology,
  respondArticle5,
  resolveEvent,
  recrutarSoldado,
  imporSancao,
  lancarAtaqueNuclear,
  sabotar,
  setBudget,
  startWar,
  voteLaborLaw,
  confirmarVotoSim as confirmarVotoLei,
  votarNaONU,
  lancarCiberataque,
  automatizarIndustria,
  construirProjetoInterno,
  construirMegaVault,
  construirProjetoWasteland,
  enviarBatedoresWasteland,
  executarFalsaBandeira,
  iniciarProjetoMaoMorta,
  lancarVirusSintetico,
  promulgarNovaConstituicao,
  autorizarAniquilacaoNuclear,
  canAutorizarAniquilacaoNuclear,
  candidatarJogosMundiais,
  estatizarMegacorporacoes,
  recusarJogosMundiais,
  desviarFundosParaCaixa2,
  destruirDoHelicoptero,
  fugirEmSilencio,
  afundarComONavio,
  infiltrarSosiaLider,
  resolverSitioNegro,
  reivindicarSitioNegro,
  escolherSitioNegro,
  pesquisarTecnologiaMilitar,
  dispensarHistoria,
  registrarEventoHistorico,
} from '../core/game-state.js';

const STORAGE_KEY = 'simulador-presidente-state-v1';
const MONTHS = ['Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const formatNumber = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const moneyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function formatMoney(value) {
  return moneyFormatter.format(value);
}

function formatPercent(value, digits = 1) {
  return `${(value * 100).toFixed(digits).replace('.', ',')}%`;
}

export function formatRelation(value) {
  const relation = Math.round(Number(value) || 0);
  return relation > 0 ? `+${relation}` : `${relation}`;
}

export function rangeControl(label, key, value, minimum, maximum) {
  return `<label class="range-control"><span>${label}<strong>${formatPercent(value, 0)}</strong></span><input type="range" min="${minimum}" max="${maximum}" step="0.01" value="${value}" data-action="budget" data-budget="${key}" aria-label="${label}"></label>`;
}

function percentage(value) {
  return Math.max(0, Math.min(100, value));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function nuclearBadge(country) {
  return country?.has_nukes === true
    ? '<span class="nuclear-threat-badge" title="Arsenal nuclear confirmado">[ ☢️ POTÊNCIA NUCLEAR ]</span>'
    : '';
}

function loadState() {
  try {
    return hydrateGameState(localStorage.getItem(STORAGE_KEY));
  } catch {
    return createGameState();
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return '';
  } catch {
    return 'Partida ativa somente nesta sessao.';
  }
}

function metric(label, value, tone = '') {
  return `<article class="metric ${tone}"><span>${label}</span><strong>${value}</strong></article>`;
}

function taxControl(label, key, value) {
  return `<div class="tax-control">
    <span>${label}</span>
    <div class="stepper" role="group" aria-label="${label}">
      <button type="button" class="icon-button" data-action="tax" data-tax="${key}" data-delta="-1" aria-label="Diminuir ${label}">−</button>
      <strong>${formatPercent(value, 0)}</strong>
      <button type="button" class="icon-button" data-action="tax" data-tax="${key}" data-delta="1" aria-label="Aumentar ${label}">+</button>
    </div>
  </div>`;
}

function overviewView(state, projection) {
  const budgetTone = projection.monthlyBalance >= 0 ? 'positive' : 'negative';
  const treatyPending = state.geopolitics.peaceTreaty?.status === 'pending' || Boolean(state.pendingEvent) || Boolean(state.pendingUnVote) || Boolean(state.pendingGlobalBid) || Boolean(state.pendingFinalDilemma) || Boolean(state.pendingInterrogation) || Boolean(state.pendingStory) || Boolean(state.pendingAllianceInvocation) || Boolean(state.pendingHostileAlert) || Boolean(state.wasteland_cinematic_pending) || Boolean(state.wasteland_cinematic_ready);
  return `<section class="view-grid overview-grid">
    <section class="panel agenda-panel">
      <div class="panel-heading"><div><p class="eyebrow">Agenda presidencial</p><h2>Proximo movimento</h2></div><span class="status-dot"></span></div>
      <p class="notice">${state.notice}</p>
      <div class="agenda-stats">
        <div><span>Saldo mensal</span><strong class="${budgetTone}">${formatMoney(projection.monthlyBalance)}</strong></div>
        <div><span>Maioria exigida</span><strong>${Math.floor(state.congress.totalSeats / 2) + 1} votos</strong></div>
        <div><span>Lei Trabalhista</span><strong>${state.laws.laborReform.approved ? 'Aprovada' : state.laws.laborReform.voteCompleted ? 'Rejeitada' : 'Pendente'}</strong></div>
        <div><span>Forca corporativa</span><strong>${Number(state.megacorp_power || 0).toFixed(0)} / 100</strong></div>
      </div>
      <button type="button" class="primary-action" data-action="advance" ${treatyPending ? 'disabled' : ''}>${state.is_wasteland ? '[ AVANÇAR MÊS (ANO ZERO PÓS-BOMBA) ]' : 'Avancar mes'} <span aria-hidden="true">→</span></button>
    </section>
    <section class="panel country-panel">
      <div class="panel-heading"><div><p class="eyebrow">Nacao</p><h2>${state.country.nome}</h2></div><span class="country-code">${state.country.id.toUpperCase()}</span></div>
      <dl class="country-facts">
        <div><dt>Populacao</dt><dd>${formatNumber.format(state.country.populacao_base)}</dd></div>
        <div><dt>Area</dt><dd>${formatNumber.format(state.country.area_km2)} km²</dd></div>
        <div><dt>Bioma</dt><dd>${state.country.bioma_dominante}</dd></div>
        <div><dt>Governo</dt><dd>${state.country.tipo_governo}</dd></div>
      </dl>
    </section>
    <section class="panel history-panel">
      <div class="panel-heading"><div><p class="eyebrow">Diario nacional</p><h2>Eventos recentes</h2></div></div>
      <ol class="history-list">${state.history.length ? state.history.map((entry) => `<li><span>${entry.type === 'vote' ? 'Congresso' : 'Economia'}</span>${entry.message}</li>`).join('') : '<li><span>Gabinete</span>Nenhum evento registrado.</li>'}</ol>
    </section>
  </section>`;
}

export function budgetView(state, projection) {
  return `<section class="view-grid budget-grid">
    <section class="panel budget-controls">
      <div class="panel-heading"><div><p class="eyebrow">Arrecadacao</p><h2>Politica tributaria</h2></div></div>
      ${rangeControl('Imposto de renda', 'incomeTaxRate', state.budget.incomeTaxRate, BUDGET_LIMITS.incomeTaxRate.minimum, BUDGET_LIMITS.incomeTaxRate.maximum)}
      ${rangeControl('IVA', 'vatRate', state.budget.vatRate, BUDGET_LIMITS.vatRate.minimum, BUDGET_LIMITS.vatRate.maximum)}
      ${rangeControl('Saude', 'healthSpend', state.budget.healthSpend, BUDGET_LIMITS.healthSpend.minimum, BUDGET_LIMITS.healthSpend.maximum)}
      ${rangeControl('Educacao', 'educationSpend', state.budget.educationSpend, BUDGET_LIMITS.educationSpend.minimum, BUDGET_LIMITS.educationSpend.maximum)}
      ${rangeControl('Infraestrutura', 'infrastructureSpend', state.budget.infrastructureSpend, BUDGET_LIMITS.infrastructureSpend.minimum, BUDGET_LIMITS.infrastructureSpend.maximum)}
      ${rangeControl('Ciencia e Tecnologia', 'scienceSpend', state.budget.scienceSpend, BUDGET_LIMITS.scienceSpend.minimum, BUDGET_LIMITS.scienceSpend.maximum)}
      ${rangeControl('Defesa', 'defenseSpend', state.budget.defenseSpend, BUDGET_LIMITS.defenseSpend.minimum, BUDGET_LIMITS.defenseSpend.maximum)}
      <div class="budget-summary"><span>Carga configurada</span><strong>${formatPercent(state.budget.incomeTaxRate + state.budget.vatRate, 0)}</strong></div>
    </section>
    <section class="panel projection-panel">
      <div class="panel-heading"><div><p class="eyebrow">Projecao mensal</p><h2>Resultado fiscal</h2></div></div>
      <div class="ledger-row"><span>Imposto de renda</span><strong>${formatMoney(projection.incomeTax)}</strong></div>
      <div class="ledger-row"><span>IVA</span><strong>${formatMoney(projection.vat)}</strong></div>
      <div class="ledger-row"><span>Despesa publica</span><strong>${formatMoney(projection.expenses)}</strong></div>
      <div class="ledger-row total"><span>${projection.monthlyBalance >= 0 ? 'Superavit' : 'Deficit'}</span><strong class="${projection.monthlyBalance >= 0 ? 'positive' : 'negative'}">${formatMoney(projection.monthlyBalance)}</strong></div>
      <div class="ledger-row"><span>Forca corporativa</span><strong class="${Number(state.megacorp_power || 0) > 80 ? 'negative' : ''}">${Number(state.megacorp_power || 0).toFixed(0)} / 100</strong></div>
      <button type="button" class="quiet-action danger-action" data-action="nationalize-megacorps" ${Number(state.megacorp_power || 0) > 0 ? '' : 'disabled'}>Estatizar Megacorporacoes</button>
      <div class="ledger-row"><span>Caixa 2</span><strong>${formatMoney(state.slush_fund || 0)}</strong></div>
      <button type="button" class="quiet-action danger-action" data-action="slush-fund">Desviar Fundos para as Ilhas Cayman</button>
    </section>
  </section>`;
}

export function renderCongress(state) {
  return LAWS.map((law) => {
    const lawState = state.laws[law.stateKey] ?? { approved: false, voteCompleted: false };
    const approved = lawState.approved;
    const completed = lawState.voteCompleted;
    return `<article class="law-row"><div><strong>${law.title}</strong><span>${law.description}</span></div><span class="bill-state ${approved ? 'approved' : completed ? 'rejected' : ''}">${approved ? 'Aprovada' : completed ? 'Rejeitada' : 'Em pauta'}</span><button type="button" class="quiet-action" data-action="open-law-vote" data-law="${law.id}" ${completed ? 'disabled' : ''}>${completed ? 'Encerrada' : 'Colocar em votacao'}</button></article>`;
  }).join('');
}

export function congressView(state) {
  if (state.regime.type === 'dictatorship') return `<section class="panel"><p class="eyebrow">Instituicoes</p><h2>Congresso suspenso</h2><p class="notice">Leis sao aprovadas por decreto enquanto durar o estado de sitio.</p></section>`;
  const forecast = getVoteForecast({
    ...state.congress,
    blocs: state.congress.blocs.map((bloc) => ({
      ...bloc,
      support: bloc.baseSupport ? Math.min(1, 0.01 + (bloc.id === 'left' ? 0.82 : bloc.id === 'center' ? 0.58 : bloc.id === 'right' ? 0.28 : 0.36) + bloc.support) : bloc.support,
    })),
  }, state.factions);
  const revolutionReady = state.regime.type === 'democracy' && state.factions.trabalhadores > 80 && state.factions.militares > 60 && state.factions.elite < 40;
  const constitutionReady = canPromulgarConstituicao(state);
  const elite = Number(state.factions.elite || 0).toFixed(0);
  const workers = Number(state.factions.trabalhadores || 0).toFixed(0);
  const military = Number(state.factions.militares || 0).toFixed(0);
  const religious = Number(state.factions.religiosos || 0).toFixed(0);
  return `<section class="view-grid congress-grid">
    <section class="panel bill-panel"><div class="panel-heading"><div><p class="eyebrow">Projetos de lei</p><h2>Pauta do Congresso</h2></div></div><div id="lista-leis" class="law-list">${renderCongress(state)}</div><div class="vote-meter"><div class="meter-track"><span style="width:${percentage((forecast.votesFor / forecast.requiredVotes) * 100)}%"></span></div><strong>${forecast.votesFor} / ${forecast.requiredVotes} votos estimados</strong></div></section>
    <section class="panel bloc-panel">
      <div class="panel-heading"><div><p class="eyebrow">Bancadas</p><h2>Articulacao</h2></div></div>
      <div class="bloc-list">${state.congress.blocs.map((bloc) => `<article class="bloc-row"><div><strong>${bloc.label}</strong><span>${bloc.seats} assentos</span></div><button type="button" class="quiet-action" data-action="negotiate" data-bloc="${bloc.id}" ${bloc.negotiated ? 'disabled' : ''}>${bloc.negotiated ? 'Apoio obtido' : `Negociar ${formatMoney(bloc.negotiationCost)}`}</button></article>`).join('')}</div><div class="ledger-row"><span>Elite / Trabalhadores</span><strong>${elite} / ${workers}</strong></div><div class="ledger-row"><span>Militares / Religiosos</span><strong>${military} / ${religious}</strong></div><button type="button" class="quiet-action danger-action" data-action="socialist-revolution" ${revolutionReady ? '' : 'disabled'}>Decretar Revolucao Socialista</button><button type="button" class="quiet-action constitution-action" data-action="constitution-open" ${constitutionReady ? '' : 'disabled'}>Promulgar Nova Constituicao</button>
    </section>
  </section>`;
}

function legacyDiplomacyView(state) {
  const onuTone = state.geopolitics.onuScore < 25 ? 'negative' : state.geopolitics.onuScore >= 60 ? 'positive' : '';
  const selectedId = state.ui?.selectedMapCountryId ?? state.country.id;
  const selected = createCountryProfile(getCountryById(selectedId) ?? getCountryById(state.country.id));
  const annexed = new Set(state.geopolitics.annexedCountryIds ?? []);
  const mapCountry = (id, label, path) => `<path d="${path}" class="map-country ${selected.id === id ? 'selected' : ''} ${annexed.has(id) ? 'annexed' : ''}" ${annexed.has(id) ? '' : `data-action="map-country" data-country="${id}" role="button" tabindex="0" aria-label="Selecionar ${label}"`}></path>`;
  return `<section class="panel"><div class="panel-heading"><div><p class="eyebrow">Painel mundial</p><h2>Diplomacia e Mapa</h2></div><span class="country-code ${onuTone}">ONU ${state.geopolitics.onuScore}/100</span></div><div class="onu-meter"><div><span>Reputacao global</span><strong class="${onuTone}">${state.geopolitics.internationalSanctions ? 'Sancoes internacionais ativas' : 'Sem sancoes internacionais'}</strong></div><div class="meter-track"><span style="width:${state.geopolitics.onuScore}%"></span></div></div><div class="map-layout"><svg class="world-map" viewBox="0 0 800 360" aria-label="Mapa mundial simplificado de teste"><path class="map-ocean" d="M0 0H800V360H0Z"></path>${mapCountry('usa', 'Estados Unidos', 'M105 92h126l35 32-23 48-98 6-46-38z')}${mapCountry('bra', 'Brasil', 'M270 191l71-12 47 48-19 84-65 7-44-61z')}${mapCountry('rus', 'Rússia', 'M420 64h235l65 35-38 47-174-2-88-39z')}${mapCountry('chn', 'China', 'M570 164l93-6 56 43-37 62-92 3-42-55z')}<text x="142" y="132">EUA</text><text x="312" y="245">BR</text><text x="545" y="105">RÚSSIA</text><text x="615" y="214">CHINA</text></svg><aside class="map-selection"><p class="eyebrow">Nacao selecionada</p><h3>${selected.nome} ${nuclearBadge(selected)}</h3><div class="ledger-row"><span>Area</span><strong>${formatNumber.format(selected.area_km2)} km²</strong></div><div class="ledger-row"><span>Populacao</span><strong>${formatNumber.format(selected.populacao_base)}</strong></div><div class="ledger-row"><span>Governo</span><strong>${selected.tipo_governo}</strong></div></aside></div><div class="bloc-list">${state.geopolitics.contacts.map((contact) => `<article class="bloc-row ${contact.anexado ? 'annexed-contact' : ''}"><div><strong>${contact.name} ${nuclearBadge(contact)}</strong><span>${contact.anexado ? 'Territorio anexado' : `Relacao ${formatRelation(contact.relation)} | Poder ${contact.militaryPower.toFixed(0)} | ${contact.atWar ? 'Em guerra' : contact.alliance ? 'Aliado' : contact.tradeTreaty ? 'Acordo comercial' : 'Sem tratado'}`}</span></div><div class="action-row"><button type="button" class="quiet-action" data-action="treaty" data-contact="${contact.id}" ${contact.anexado || contact.tradeTreaty || contact.atWar || contact.relation <= 20 ? 'disabled' : ''}>Comercio</button><button type="button" class="quiet-action" data-action="alliance" data-contact="${contact.id}" ${contact.anexado || contact.alliance || contact.atWar || !contact.tradeTreaty || contact.relation <= 45 ? 'disabled' : ''}>Alianca</button><button type="button" class="quiet-action" data-action="sabotage" data-contact="${contact.id}" ${contact.anexado || contact.atWar ? 'disabled' : ''}>Sabotar</button><button type="button" class="quiet-action danger-action" data-action="war" data-contact="${contact.id}" ${contact.anexado || contact.atWar ? 'disabled' : ''}>Guerra</button></div></article>`).join('')}</div></section>`;
}

function riskDiplomacyView(state) {
  const onuTone = state.geopolitics.onuScore < 25 ? 'negative' : state.geopolitics.onuScore >= 60 ? 'positive' : '';
  const arsenal = Math.max(0, Number(state.military.armasNucleares) || 0);
  return `<section class="panel"><div class="panel-heading"><div><p class="eyebrow">Painel mundial</p><h2>Diplomacia de risco</h2></div><span class="country-code ${onuTone}">ONU ${state.geopolitics.onuScore}/100</span></div><div class="onu-meter"><div><span>Reputacao global</span><strong class="${onuTone}">${state.geopolitics.internationalSanctions ? 'Sancoes internacionais ativas' : 'Sem sancoes internacionais'}</strong></div><div class="meter-track"><span style="width:${state.geopolitics.onuScore}%"></span></div></div><div class="bloc-list">${state.geopolitics.contacts.map((contact) => { const nuclearReady = contact.atWar && arsenal > 0 && !contact.anexado; return `<article class="bloc-row ${contact.anexado ? 'annexed-contact' : ''}"><div><strong>${contact.name} ${nuclearBadge(contact)}</strong><span>${contact.anexado ? 'Territorio anexado' : `Relacao ${formatRelation(contact.relation)} | Poder ${Number(contact.militaryPower).toFixed(0)} | Populacao ${formatNumber.format(contact.population || 0)}${contact.sancionado_por_jogador ? ' | Sancionado' : ''}`}</span></div><div class="action-row"><button type="button" class="quiet-action" data-action="treaty" data-contact="${contact.id}" ${contact.anexado || contact.tradeTreaty || contact.atWar || contact.relation <= 20 ? 'disabled' : ''}>Comercio</button><button type="button" class="quiet-action" data-action="alliance" data-contact="${contact.id}" ${contact.anexado || contact.alliance || contact.atWar || !contact.tradeTreaty || contact.relation <= 45 ? 'disabled' : ''}>Alianca</button><button type="button" class="quiet-action" data-action="sanction" data-contact="${contact.id}" ${contact.anexado || contact.sancionado_por_jogador ? 'disabled' : ''}>Impor sancao</button><button type="button" class="quiet-action" data-action="ultimatum" data-contact="${contact.id}" ${contact.anexado ? 'disabled' : ''}>Exigir anexacao</button><button type="button" class="quiet-action danger-action" data-action="war" data-contact="${contact.id}" ${contact.anexado || contact.atWar ? 'disabled' : ''}>Guerra</button>${nuclearReady ? `<button type="button" class="quiet-action nuclear-action" data-action="nuclear-strike" data-contact="${contact.id}">Ataque nuclear</button>` : ''}</div></article>`; }).join('')}</div></section>`;
}

export function diplomacyView(state, searchQuery = '') {
  if (state.is_wasteland) {
    return `<section class="panel wasteland-diplomacy"><div class="panel-heading"><div><p class="eyebrow">Superficie devastada</p><h2>Faccoes do Ermo</h2></div><span class="country-code">SUCATA ${formatNumber.format(state.scrap ?? 0)}</span></div><p class="notice">A diplomacia antiga morreu. Envie batedores, negocie com os sobreviventes e defenda o Vault.</p><div class="diplomacy-list">${(state.geopolitics.contacts ?? []).map((contact) => `<article class="bloc-row"><div><strong>${escapeHtml(contact.name)}</strong><span>Relacao ${formatRelation(contact.relation)} | Poder ${Number(contact.militaryPower).toFixed(0)}</span></div><button type="button" class="quiet-action" data-action="wasteland-scout" data-contact="${contact.id}" ${state.scrap >= 25 ? '' : 'disabled'}>[ ENVIAR BATEDORES ]</button></article>`).join('')}</div></section>`;
  }
  const treaty = state.geopolitics.peaceTreaty;
  const target = treaty && state.geopolitics.contacts.find((contact) => contact.id === treaty.targetId);
  const contacts = (state.world ?? state.geopolitics.contacts)
    .filter((contact) => !contact.destruido && contact.id !== state.country.id);
  const league = state.geopolitics.league;
  const union = state.regime.type === 'communist_dictatorship';
  const unlockedTechs = new Set(state.unlocked_techs ?? []);
  const cyberReady = unlockedTechs.has('cyber');
  const bioReady = unlockedTechs.has('bio');
  const nuclearReady = unlockedTechs.has('nuke') && canAutorizarAniquilacaoNuclear(state);
  const peacePanel = `${target ? '<p class="notice">Um tratado de paz aguarda decisão no painel bloqueante.</p>' : ''}<p class="notice">Operação: Infiltrar Sósia do Líder em regimes não democráticos.</p>`;
  const leaguePanel = league ? `<div class="ledger-row"><span>${league.name}</span><strong>${league.memberIds.length} membros</strong></div>` : `<button type="button" class="quiet-action" data-action="league-create">Criar Nova Liga Global</button>`;
  return `<section class="panel"><div class="panel-heading"><div><p class="eyebrow">Diplomacia</p><h2>Relações Internacionais</h2></div><span class="country-code">ONU ${state.geopolitics.onuScore}/100</span></div>${peacePanel}${leaguePanel}<label class="diplomacy-search"><span>Buscar país</span><input type="search" data-action="diplomacy-search" value="${escapeHtml(searchQuery)}" placeholder="Ex.: Argentina" autocomplete="off"></label><div class="diplomacy-list" aria-label="Lista de países diplomáticos">${contacts.map((contact) => `<article class="bloc-row ${contact.wasteland ? 'wasteland-contact' : ''}" data-diplomacy-row data-country-name="${escapeHtml(contact.name)}"><div><strong>${contact.name} ${nuclearBadge(contact)}</strong><span>${contact.wasteland ? 'ZONA DE ANIQUILAÇÃO NUCLEAR' : `Relação ${formatRelation(contact.relation)} | Poder ${Number(contact.militaryPower).toFixed(0)} | Defesa digital ${Number(contact.cyber_defense).toFixed(0)} | ${contact.trait}${contact.puppet ? ' | Fantoche' : ''}`}</span></div><div class="action-row"><button type="button" class="quiet-action" data-action="treaty" data-contact="${contact.id}" ${contact.wasteland || contact.tradeTreaty || contact.atWar || contact.relation <= 30 ? 'disabled' : ''}>Propor Acordo Comercial</button><button type="button" class="quiet-action" data-action="resource-import" data-contact="${contact.id}" data-resource="steel" data-amount="500" ${contact.wasteland || contact.atWar || contact.relation <= 20 ? 'disabled' : ''}>Importar aço</button><button type="button" class="quiet-action" data-action="alliance" data-contact="${contact.id}" ${contact.wasteland || contact.alliance || contact.atWar || contact.relation < 50 ? 'disabled' : ''}>Propor Aliança</button>${cyberReady ? `<button type="button" class="quiet-action danger-action" data-action="cyber-attack" data-contact="${contact.id}" ${contact.wasteland || (Number(contact.cyber_paralyzed_until) || 0) > (Number(state.monthCounter) || 0) ? 'disabled' : ''}>Lançar Ciberataque</button>` : ''}${bioReady ? `<button type="button" class="quiet-action danger-action" data-action="synthetic-virus" data-contact="${contact.id}" ${contact.wasteland || contact.bio_infected ? 'disabled' : ''}>Lançar Vírus Sintético</button>` : ''}<button type="button" class="quiet-action danger-action" data-action="false-flag" data-contact="${contact.id}" ${contact.wasteland || contact.atWar || contact.anexado ? 'disabled' : ''}>Orquestrar Falsa Bandeira</button><button type="button" class="quiet-action danger-action" data-action="insult" data-contact="${contact.id}" ${contact.wasteland || contact.atWar || contact.anexado ? 'disabled' : ''}>[ INSULTAR LÍDER ESTRANGEIRO ]</button>${union ? `<button type="button" class="quiet-action" data-action="union-absorb" data-contact="${contact.id}" ${contact.wasteland || contact.relation > 80 || contact.puppet ? '' : 'disabled'}>Absorver pela União</button>` : ''}<button type="button" class="quiet-action danger-action" data-action="fund-rebels" data-contact="${contact.id}" ${contact.wasteland ? 'disabled' : ''}>Financiar Rebeldes</button>${nuclearReady && contact.atWar && !contact.wasteland ? `<button type="button" class="quiet-action nuclear-action" data-action="nuclear-codes" data-contact="${contact.id}">CÓDIGOS NUCLEARES</button>` : ''}<button type="button" class="quiet-action danger-action" data-action="war" data-contact="${contact.id}" ${contact.wasteland || contact.atWar ? 'disabled' : ''}>${contact.atWar ? 'Em guerra' : 'Guerra'}</button></div></article>`).join('')}<p class="notice" data-diplomacy-empty hidden>Nenhum país corresponde à busca.</p></div></section>`;
}

export function filterDiplomacyRows(root, query = '') {
  if (!root?.querySelectorAll) return 0;
  const normalized = query.trim().toLocaleLowerCase('pt-BR');
  const rows = [...root.querySelectorAll('[data-diplomacy-row]')];
  let visible = 0;
  rows.forEach((row) => {
    const name = (row.dataset.countryName ?? '').toLocaleLowerCase('pt-BR');
    const matches = !normalized || name.includes(normalized);
    row.hidden = !matches;
    row.style.display = matches ? '' : 'none';
    if (matches) visible += 1;
  });
  const empty = root.querySelector('[data-diplomacy-empty]');
  if (empty) {
    empty.hidden = visible > 0;
    empty.style.display = visible > 0 ? 'none' : '';
  }
  return visible;
}

export function renderAllianceInvocation(state) {
  const pending = state.pendingAllianceInvocation;
  if (!pending) return '';
  return `<section class="alliance-invocation" role="dialog" aria-modal="true" aria-labelledby="alliance-invocation-title"><p class="eyebrow">/// INVOCAÇÃO DA ALIANÇA ///</p><h2 id="alliance-invocation-title">Artigo 5 acionado</h2><pre>&gt; O NOSSO ALIADO ${escapeHtml(pending.allyName)} FOI ATACADO POR ${escapeHtml(pending.attackerName)}.\n&gt; A ALIANÇA EXIGE DEFESA.</pre><div class="modal-actions"><button type="button" class="primary-action" data-action="article5" data-decision="send-troops">[ ENVIAR TROPAS E CAIXA (+100 RELAÇÃO) ]</button><button type="button" class="quiet-action danger-action" data-action="article5" data-decision="verbal-condemnation">[ CONDENAÇÃO VERBAL APENAS ]</button><button type="button" class="quiet-action" data-action="article5" data-decision="fulfill-duty">[ CUMPRIR DEVER ]</button></div></section>`;
}

export function renderHostileAlert(state) {
  const alert = state.pendingHostileAlert;
  if (!alert) return '';
  const nuclear = alert.type === 'nuclear';
  const message = nuclear
    ? `&gt; A DOUTRINA DE DESTRUIÇÃO FOI ATIVADA.\n&gt; ORIGEM: ${escapeHtml(alert.targetName)}. O VAULT SERÁ TESTADO.`
    : `&gt; O PAÍS ${escapeHtml(alert.targetName)} NÃO TOLEROU O INSULTO E DECLAROU GUERRA CONTRA NÓS!\n&gt; O GABINETE DEVE RESPONDER.`;
  return `<section class="hostile-alert ${nuclear ? 'hostile-alert--nuclear' : ''}" role="alertdialog" aria-modal="true" aria-labelledby="hostile-alert-title"><p class="eyebrow">/// ALERTA DE INTELIGÊNCIA ///</p><h2 id="hostile-alert-title">${nuclear ? 'ATAQUE NUCLEAR DETECTADO' : 'DECLARAÇÃO DE GUERRA DETECTADA'}</h2><pre>${message}</pre><button type="button" class="quiet-action danger-action" data-action="dismiss-hostile-alert">[ RECONHECER ALERTA ]</button></section>`;
}

export function projectsView(state) {
  if (state.is_wasteland) {
    const buildings = state.wastelandBuildings ?? {};
    return `<section class="panel projects-panel wasteland-projects"><div class="panel-heading"><div><p class="eyebrow">Ano Zero Pos-Bomba</p><h2>Economia de Sucata</h2></div><span class="country-code">SUCATA ${formatNumber.format(state.scrap ?? 0)}</span></div><p class="notice">A superficie morreu. O Vault agora mede o tempo em filtros, geradores e invasoes.</p><div class="internal-metrics"><span>POPULACAO ${formatNumber.format(state.country.populacao_base)}</span><span>PURIFICADORES ${buildings.waterPurifiers ?? 0}</span><span>GERADORES ${buildings.geothermalGenerators ?? 0}</span></div><article class="project-row"><div><strong>Purificador de Agua</strong><span>Custo: 50 sucatas | Mantem o Vault vivo.</span></div><button type="button" class="primary-action" data-action="wasteland-project" data-project="water-purifier" ${state.scrap >= 50 ? '' : 'disabled'}>[ CONSTRUIR ]</button></article><article class="project-row"><div><strong>Gerador Geotermico</strong><span>Custo: 100 sucatas | Alimenta as portas de metal.</span></div><button type="button" class="primary-action" data-action="wasteland-project" data-project="geothermal-generator" ${state.scrap >= 100 ? '' : 'disabled'}>[ CONSTRUIR ]</button></article></section>`;
  }
  const automated = Boolean(state.country.industry_automated);
  const canAutomate = state.economy.cash >= 200_000_000_000 && state.technology.points >= 250;
  const deadHand = state.megaprojects?.deadHand;
  const deadHandUnlocked = state.unlocked_techs?.includes('dead_hand');
  const deadHandReady = deadHandUnlocked && state.economy.cash >= 1_000_000_000_000 && state.technology.points >= 1_000 && state.country.uranium >= 250;
  const deadHandLabel = state.dead_hand_active ? 'Rede ativa: retaliacao automatica armada.' : deadHand?.remainingMonths > 0 ? `Construcao em curso: ${deadHand.remainingMonths} meses.` : 'Custo: R$ 1 tri, 1.000 PP e 250 uranio. Prazo: 12 meses.';
  const deadHandProject = deadHandUnlocked ? `<article class="project-row ${state.dead_hand_active ? 'completed' : ''}"><div><strong>Construir Rede Mao Morta (IA)</strong><span>${deadHandLabel}</span></div><button type="button" class="quiet-action danger-action" data-action="dead-hand-project" ${state.dead_hand_active || deadHand?.remainingMonths > 0 || !deadHandReady ? 'disabled' : ''}>${state.dead_hand_active ? 'Rede ativa' : deadHand?.remainingMonths > 0 ? 'Em construcao' : 'Iniciar Rede'}</button></article>` : '';
  const vaultReady = state.economy.cash >= 500_000_000_000 && state.country.steel >= 50_000;
  const vaultProject = `<article class="project-row ${state.vault_built ? 'completed' : ''}"><div><strong>MEGA-VAULT DE CONTENCAO</strong><span>${state.vault_built ? 'Bunker operacional: a civilizacao ainda pode sobreviver.' : 'Custo: R$ 500 bi e 50.000 aco. Protege contra o colapso nuclear global.'}</span></div><button type="button" class="${state.vault_built ? 'quiet-action' : 'danger-action'}" data-action="mega-vault" ${state.vault_built || !vaultReady ? 'disabled' : ''}>${state.vault_built ? 'Vault operacional' : '[ CONSTRUIR VAULT ]'}</button></article>`;
  const internalMaintenance = calculateInternalMaintenance(state);
  const internalProjects = INTERNAL_PROJECTS.map((project) => {
    const count = Number(state[project.target]?.[project.field]) || 0;
    const affordable = state.economy.cash >= project.cost;
    return `<article class="project-row"><div><strong>${project.title}</strong><span>${project.description} | Custo: ${formatMoney(project.cost)} | Construidos: ${count}</span></div><button type="button" class="${affordable ? 'primary-action' : 'quiet-action'}" data-action="internal-project" data-project="${project.id}" ${affordable ? '' : 'disabled'}>${affordable ? '[ CONSTRUIR ]' : '[ CAIXA INSUFICIENTE ]'}</button></article>`;
  }).join('');
  const infrastructure = state.infrastructure ?? {};
  const health = state.health ?? {};
  const industry = state.industry ?? {};
  return `<section class="panel projects-panel"><div class="panel-heading"><div><p class="eyebrow">Capacidade nacional</p><h2>Projetos Internos</h2></div><span class="country-code">ACO ${formatNumber.format(state.country.steel)}</span></div><div class="internal-metrics"><span>AMBIENTE ${Number(state.environment_health ?? 100).toFixed(0)}%</span><span>MANUTENCAO ${formatMoney(internalMaintenance)}/mes</span><span>ESTRADAS ${infrastructure.roads ?? 0} | FERROVIAS ${infrastructure.railways ?? 0} | AEROPORTOS ${infrastructure.airports ?? 0}</span><span>HOSPITAIS ${health.hospitals ?? 0} | CLINICAS ${health.clinics ?? 0}</span><span>FABRICAS ${industry.factories ?? 0} | USINAS ${industry.power_plants ?? 0}</span></div>${internalProjects}<article class="project-row ${automated ? 'completed' : ''}"><div><strong>Automatizar Parque Industrial</strong><span>${automated ? 'Industria 4.0 ativa: +3.000 aco por mes e pressao constante sobre trabalhadores.' : 'Custo: R$ 200 bi e 250 PP. Triplica a producao mensal de aco.'}</span></div><button type="button" class="${automated ? 'quiet-action' : 'primary-action'}" data-action="automate-industry" ${automated || !canAutomate ? 'disabled' : ''}>${automated ? 'Automatizado' : 'Automatizar'}</button></article>${vaultProject}${deadHandProject}</section>`;
}

export function bunkerView(state) {
  if (state.president_selection_pending) {
    return `<section class="president-selection-screen"><p class="eyebrow">/// PREPARAÇÃO DO VAULT ///</p><h2>Seleção de Presidente</h2><p>Escolha uma profissão e os seus sprites originais para assumir o comando.</p><canvas id="presidentSelectCanvas" class="president-select-canvas" width="960" height="600" tabindex="0" aria-label="Seleção de Presidente: escolha Operário, Comandante, Doutor ou Sobrevivente."></canvas><div class="president-choice-buttons">${PRESIDENT_CLASSES.map((profile) => `<button type="button" class="president-choice" data-action="select-president" data-class="${profile.id}"><strong>${escapeHtml(profile.name)}</strong><span><b>Bônus:</b> ${escapeHtml(profile.buff)} <b>Penalidade:</b> ${escapeHtml(profile.flaw)}</span></button>`).join('')}</div></section>`;
  }
  const grid = state.shelter_grid ?? INITIAL_SHELTER_GRID;
  const modules = Object.entries(SHELTER_TYPES).filter(([id]) => id !== 'vault');
  const buildCostMultiplier = getPresidentClassModifiers(state.presidentClass).buildCostMultiplier;
  const rooms = grid.flat().filter(Boolean);
  const turnBlocked = state.pendingExpeditionReports?.some((report) => !report.success) || state.pendingBunkerEvent || state.pendingLoot;
  const lootNotice = state.pendingLoot
    ? state.lootbox_opened
      ? `<span class="lootbox-progress" role="status">COFRE DO ERMO · ${Math.min(3, Number(state.lootbox_click_count) || 0)}/3</span>`
      : '<button type="button" class="loot-alert" data-action="open-expedition-lootbox">[!] NOVA CARGA DETETADA NO PORTÃO [!]</button>'
    : '';
  return `<section class="bunker-chamber">
    <div class="bunker-header"><div><p class="eyebrow">/// CORTE TRANSVERSAL / SETOR VAULT ///</p><h2>Colónia Subterrânea</h2></div><div class="bunker-header-actions">${lootNotice}<button type="button" class="primary-action" data-action="advance" ${turnBlocked ? 'disabled' : ''}>[ AVANÇAR MÊS ]</button><button type="button" class="quiet-action bunker-build-toggle" data-action="shelter-build-mode" aria-pressed="false">[ EXPANDIR VAULT ]</button></div></div>
    <div class="bunker-hud"><span>SUCATA ${formatNumber.format(state.scrap ?? 0)} / ${formatNumber.format(getRoomStorageCapacity(grid, 'scrap'))}</span><span>CIÊNCIA ${formatNumber.format(state.science ?? 0)} / ${formatNumber.format(getRoomStorageCapacity(grid, 'science'))}</span><span>COMIDA ${formatNumber.format(state.shelter_supplies?.food ?? 0)} / ${formatNumber.format(getRoomStorageCapacity(grid, 'food'))}</span><span>ENERGIA ${formatNumber.format(state.shelter_supplies?.energy ?? 0)} / ${formatNumber.format(getRoomStorageCapacity(grid, 'energy'))}</span><span class="oxygen-resource ${state.oxygen_deprived ? 'oxygen-deprived' : ''}" aria-label="Oxigênio ${formatNumber.format(state.shelter_supplies?.oxygen ?? 0)} de ${formatNumber.format(getRoomStorageCapacity(grid, 'oxygen'))}${state.oxygen_deprived ? ', produção insuficiente' : ''}">💨 O₂ ${formatNumber.format(state.shelter_supplies?.oxygen ?? 0)} / ${formatNumber.format(getRoomStorageCapacity(grid, 'oxygen'))}${state.oxygen_deprived ? ' · ALERTA' : ''}</span><span>SALAS ${rooms.length}</span><span>CAPACIDADE ${formatNumber.format(calculateShelterCapacity(grid))}</span><span>ARMAS ${formatNumber.format(state.shelter_supplies?.weapons ?? 0)} / ${formatNumber.format(getRoomStorageCapacity(grid, 'weapons'))}</span><span>GUARDAS ${formatNumber.format(state.shelter_guards ?? 0)}</span><span>CURATIVOS ${formatNumber.format(state.shelter_supplies?.medkits ?? 0)} / ${formatNumber.format(getRoomStorageCapacity(grid, 'medkits'))}</span><span>RADIAÇÃO ${formatNumber.format(state.shelter_radiation ?? 0)}%</span></div>
    <div class="bunker-build-controls" hidden aria-label="Módulos de construção">${modules.map(([id, module]) => { const cost = getShelterBuildCost(id, 0, state.presidentClass); return `<button type="button" class="bunker-module-button" data-action="shelter-module" data-module="${id}" aria-pressed="${id === 'dormitory'}" ${state.scrap < cost ? 'disabled' : ''}>${module.name}<small>${formatNumber.format(cost)} sucatas${buildCostMultiplier < 1 ? ' · DESCONTO DO OPERÁRIO' : ''}</small></button>`; }).join('')}<div class="bunker-slot-controls"><label for="shelter-build-slot">Setor livre</label><select id="shelter-build-slot" class="bunker-build-slot"></select><button type="button" class="primary-action" data-action="shelter-place">[ CONSTRUIR ]</button></div></div>
    <div class="bunker-stage"><canvas id="shelterCanvas" class="bunker-canvas" width="960" height="600" tabindex="0" aria-label="Bunker lateral. A e D movem o Presidente, W e S operam o elevador, E interage. Na construção, clique num setor livre."></canvas>${bunkerEnvironmentHudView(state.environment, state.isNight, state.inhabitants, state.shelter_guards, state.presidentClass, state.weather)}<div class="bunker-tooltip" data-bunker-tooltip role="status" hidden></div>${renderDialogueView(null)}</div>
    <div class="bunker-foot"><div><p class="bunker-status" data-shelter-status role="status">PRESIDENTE EM PATRULHA</p><p class="bunker-notice ${/SINAL DO EXPLORADOR|ALERTA CRÍTICO|ASFIXIA|oxigênio insuficiente/i.test(state.notice ?? '') ? 'danger' : ''}" role="status">${escapeHtml(state.notice ?? '')}</p></div><div class="shelter-room-controls"><label for="shelter-room-select">Setor</label><select id="shelter-room-select" class="bunker-build-slot">${rooms.map((room) => `<option value="${room.floor}:${room.column}">${SHELTER_TYPES[room.type].name} · A${room.floor + 1} S${room.column}</option>`).join('')}</select><button type="button" class="quiet-action" data-action="shelter-open-room">[ GERIR SALA ]</button></div></div>
  </section>`;
}

function formatEnvironmentClock(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

export function bunkerEnvironmentHudView(environment = {}, isNight = environment?.isNight === true, inhabitants = [], shelterGuards = 0, presidentClass = null, weatherState = null) {
  const cycle = advanceEnvironmentCycle({ ...environment, isNight }, 0);
  const phaseName = cycle.isNight ? 'NOITE' : 'DIA';
  const phaseElapsed = cycle.isNight ? cycle.elapsedMs - 300_000 : cycle.elapsedMs;
  const remaining = 300_000 - phaseElapsed;
  const progressPercent = Math.max(0, Math.min(100, cycle.progress * 100));
  const security = calculateSuppression({ inhabitants, shelter_guards: shelterGuards, presidentClass });
  const weather = getWeather(weatherState);
  const weatherBadge = weather.id === 'clear' ? ''
    : `<span class="environment-weather" data-weather="${weather.id}" aria-label="Clima: ${weather.label.toLowerCase()}">${weather.icon} ${weather.label}</span>`;
  return `<aside class="bunker-environment-hud ${cycle.isNight ? 'is-night' : 'is-day'}" data-environment-hud role="status" aria-label="Ciclo ${phaseName.toLowerCase()} e segurança do bunker"><span class="environment-phase-icon" aria-hidden="true">${cycle.isNight ? '☾' : '☼'}</span><span class="environment-phase-label">${phaseName}</span><span class="environment-phase-clock">${formatEnvironmentClock(remaining)}</span><span class="environment-progress" role="meter" aria-label="Progresso do turno ${phaseName.toLowerCase()}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progressPercent.toFixed(0)}"><span style="width:${progressPercent.toFixed(2)}%"></span></span>${weatherBadge}<span class="environment-security" aria-label="Segurança ${security.percent} por cento, ${security.totalSoldiers} soldados">🛡 SEGURANÇA ${security.percent}% · ${security.totalSoldiers} SOLDADOS</span></aside>`;
}

export function renderRoomManagement(state, room) {
  if (!room || !SHELTER_TYPES[room.type]) return '';
  const profile = getRoomEconomyProfile(state, room);
  const productionText = profile.production
    ? `${formatNumber.format(profile.production.amount)} ${profile.production.label}/mês`
    : 'Sem produção mensal direta';
  const nextText = profile.nextLevel?.production
    ? `Nível ${profile.nextLevel.level}: ${formatNumber.format(profile.nextLevel.production.amount)} ${profile.nextLevel.production.label}/mês`
    : 'Nível máximo atingido';
  const costs = getRoomUpgradeCosts(room, state.presidentClass);
  const scrapAvailable = Number(state.scrap) || 0;
  const scienceAvailable = Number(state.science) || 0;
  const oxygenDetails = `<div><dt>Dreno de oxigênio desta sala</dt><dd>${formatNumber.format(profile.oxygen.roomDrain)} O₂/mês · profundidade ${room.floor + 1}</dd></div>${profile.oxygen.energyMaintenance ? `<div><dt>Manutenção do suporte</dt><dd>${formatNumber.format(profile.oxygen.energyMaintenance)} energia/mês</dd></div>` : ''}`;
  const upgradeControl = costs === null
    ? ['vault', 'elevator', 'presidential_suite'].includes(room.type)
      ? ''
      : '<button type="button" class="primary-action" disabled>[ NÍVEL MÁXIMO ATINGIDO ]</button>'
    : `<div class="upgrade-costs"><span class="resource-cost ${scrapAvailable >= costs.scrap ? 'resource-cost--enough' : 'resource-cost--short'}">SUCATA: ${formatNumber.format(costs.scrap)} (SALDO ${formatNumber.format(scrapAvailable)})</span><span class="resource-cost ${scienceAvailable >= costs.science ? 'resource-cost--enough' : 'resource-cost--short'}">CIÊNCIA: ${formatNumber.format(costs.science)} (SALDO ${formatNumber.format(scienceAvailable)})</span></div><button type="button" class="primary-action" data-action="upgrade-shelter-room" data-floor="${room.floor}" data-column="${room.column}" ${scrapAvailable < costs.scrap || scienceAvailable < costs.science ? 'disabled' : ''}>[ MELHORAR SALA ]</button>`;
  return `<h2 id="bunker-room-title">${SHELTER_TYPES[room.type].name} (NÍVEL ${profile.level})</h2>
    <dl class="room-economy-stats"><div><dt>Produção atual</dt><dd>${productionText}</dd></div><div><dt>Trabalhadores ativos</dt><dd>${profile.workers.active} / ${profile.workers.assigned}</dd></div><div><dt>Consumo populacional do Vault</dt><dd>${formatNumber.format(profile.consumption.food)} comida + ${formatNumber.format(profile.consumption.energy)} energia/mês</dd></div>${oxygenDetails}<div><dt>Projeção de melhoria</dt><dd>${nextText}</dd></div><div><dt>Sucata disponível</dt><dd>${formatNumber.format(scrapAvailable)}</dd></div><div><dt>Ciência disponível</dt><dd>${formatNumber.format(scienceAvailable)}</dd></div></dl>${upgradeControl}`;
}

export function renderWardrobeView(state) {
  const scrap = Math.max(0, Number(state.scrap) || 0);
  const unlocked = new Set(state.unlockedSkins ?? ['default']);
  const cards = PRESIDENT_SKINS.map((skin) => {
    const owned = unlocked.has(skin.id);
    const equipped = state.equippedSkin === skin.id;
    const action = owned ? 'skin-equip' : 'skin-buy';
    const label = equipped ? '[ EQUIPADA ]' : owned ? '[ EQUIPAR ]' : `[ COMPRAR · ${formatNumber.format(skin.cost)} SUCATAS ]`;
    const disabled = equipped || (!owned && scrap < skin.cost);
    return `<article class="wardrobe-skin ${equipped ? 'wardrobe-skin--equipped' : ''}" style="--skin-filter:${skin.filter}"><div class="wardrobe-preview" aria-hidden="true"><span>◆</span></div><h3>${escapeHtml(skin.name)}</h3><p>${skin.cost ? `${formatNumber.format(skin.cost)} sucatas` : 'Sem custo'}</p><button type="button" class="${owned ? 'quiet-action' : 'primary-action'}" data-action="${action}" data-skin="${skin.id}" ${disabled ? 'disabled' : ''}>${label}</button></article>`;
  }).join('');
  return `<section class="bunker-dialog wardrobe-dialog" role="dialog" aria-modal="true" aria-labelledby="wardrobe-title"><p class="eyebrow">/// ACERVO PESSOAL DO COMANDANTE ///</p><h2 id="wardrobe-title">Guarda-Roupa</h2><p class="wardrobe-balance">SUCATA DISPONÍVEL: ${formatNumber.format(scrap)}</p><div class="wardrobe-grid">${cards}</div><p class="wardrobe-note">As vestimentas são cosméticas e não alteram atributos.</p><button type="button" class="quiet-action" data-action="wardrobe-back">[ VOLTAR À SUÍTE ]</button></section>`;
}

export function expeditionLogisticsView(state) {
  const inhabitants = state.inhabitants ?? [];
  if (!inhabitants.length) return '<p class="shelter-empty">Nenhum habitante disponível para expedição.</p>';
  const location = state.expeditionLocation ?? createExpeditionLocation();
  const weather = getWeather(state);
  const attribution = location.source === 'geolocation'
    ? '<small class="expedition-attribution">Localização aproximada por <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>.</small>'
    : '<small class="expedition-attribution">Localização indisponível; destinos genéricos em uso.</small>';
  return `<section class="expedition-logistics" aria-label="Logística de expedição"><h3>LOGÍSTICA DE EXPEDIÇÃO</h3><p>Missões de três meses. A superfície não oferece garantias de retorno.</p>${weather.blocksExpeditions ? `<p class="expedition-weather-warning" role="alert">${weather.icon} ${weather.label}: expedições suspensas até o tempo abrir.</p>` : ''}<p class="expedition-privacy">A posição aproximada é consultada no serviço OpenStreetMap Nominatim; apenas o nome da cidade é salvo.</p><p class="expedition-location">SETOR EXTERNO: ${escapeHtml(location.city)}</p>${attribution}<label class="expedition-route-label" for="expedition-destination">Destino</label><select id="expedition-destination" class="bunker-build-slot" data-expedition-destination>${location.nodes.map((node) => `<option value="${escapeHtml(node)}">${escapeHtml(node)}</option>`).join('')}</select><ul>${inhabitants.map((npc) => {
    const unavailable = weather.blocksExpeditions || npc.currentState === 'rebel' || npc.is_prisoner || npc.is_on_expedition;
    const status = npc.is_on_expedition ? `EM EXPEDIÇÃO · ${npc.expedition_timer} MESES`
      : npc.is_prisoner ? 'DETIDO' : npc.currentState === 'rebel' ? 'REBELDE' : 'SAUDÁVEL';
    return `<li><span>${npc.isVIP ? '⭐ ' : ''}${escapeHtml(npc.name || npc.id)} — ${status}</span><button type="button" class="primary-action" data-action="start-expedition" data-inhabitant="${escapeHtml(npc.id)}" ${unavailable ? 'disabled' : ''}>[ ENVIAR PARA A SUPERFÍCIE ]</button></li>`;
  }).join('')}</ul></section>`;
}

export function expeditionReportView(state) {
  if (state.pendingLoot) return state.lootbox_revealed && state.lootbox_cards_visible ? expeditionLootView(state) : '';
  const report = state.pendingExpeditionReports?.[0];
  if (!report) return '';
  const message = report.success
    ? `> ${escapeHtml(report.inhabitantId)} regressou da superfície.${report.destination ? `\n> DESTINO: ${escapeHtml(report.destination)}.` : ''}${report.vipFound ? `\n> ESPECIALISTA RESGATADO: ⭐ ${escapeHtml(report.vipName)} (MODIFICADOR x2).` : ''}`
    : `> O SINAL DE ${escapeHtml(report.inhabitantId)} FOI PERDIDO NO WASTELAND.`;
  return `<section class="bunker-dialog expedition-report" role="dialog" aria-modal="true" aria-labelledby="expedition-report-title"><p class="eyebrow">/// RELATÓRIO DE MISSÃO ///</p><h2 id="expedition-report-title">${report.success ? 'Explorador retornou' : 'Sinal perdido'}</h2><pre>${message}</pre><button type="button" class="primary-action" data-action="dismiss-expedition-report">[ ARQUIVAR RELATÓRIO ]</button></section>`;
}

export function expeditionLootView(state) {
  if (!state.pendingLoot || !state.lootbox_revealed || !state.lootbox_cards_visible) return '';
  const cards = (state.currentLoot ?? []).map((item, index) => `<article class="loot-card loot-card--${['common', 'rare', 'epic'].includes(item.rarity) ? item.rarity : 'common'}" style="--loot-delay:${index * 110}ms"><span class="loot-card-rarity">${item.rarity === 'epic' ? 'RECUPERAÇÃO EXCEPCIONAL' : item.rarity === 'rare' ? 'ACHADO RARO' : 'SUPRIMENTO'}</span><strong>${escapeHtml(item.label || item.resource)}</strong><span class="loot-card-amount">+${formatNumber.format(Math.max(0, Math.floor(Number(item.amount) || 0)))}</span></article>`).join('');
  const missionNotes = (state.pendingExpeditionReports ?? []).filter((report) => report.success).map((report) => {
    const destination = report.destination ? ` · DESTINO: ${escapeHtml(report.destination)}` : '';
    const specialist = report.vipFound ? ` · ESPECIALISTA RESGATADO: ⭐ ${escapeHtml(report.vipName || 'Especialista')} (x2)` : '';
    return `<p class="loot-mission-note">EXPLORADOR ${escapeHtml(report.inhabitantId)} RETORNOU${destination}${specialist}</p>`;
  }).join('');
  return `<section class="bunker-dialog expedition-report loot-reveal" role="dialog" aria-modal="true" aria-labelledby="loot-reveal-title"><p class="eyebrow">/// CARGA DO ERMO ///</p><h2 id="loot-reveal-title">Materiais recuperados</h2><p class="loot-reveal-copy">A equipe abriu o cofre. Confira a carga e recolha os itens para armazená-los no Vault.</p>${missionNotes}<div class="loot-cards">${cards}</div><button type="button" class="primary-action loot-collect" data-action="collect-expedition-loot">[ RECOLHER TUDO ]</button></section>`;
}

export function renderDeadHandTerminal(state) {
  if (!state.dead_hand_triggered) return '';
  return `<section class="dead-hand-dialog" role="dialog" aria-modal="true" aria-labelledby="dead-hand-title"><pre id="dead-hand-title" class="ascii-dead-hand">[!] ERRO CRÍTICO NO GOVERNO CENTRAL [!]
CONEXÃO PERDIDA. GOVERNO DEPOSTO.
=======================================
INICIANDO DIRETRIZ ÔMEGA: "MÃO MORTA"
=======================================
&gt; ASSUMINDO CONTROLE DOS SILOS...
&gt; ALVOS: TODOS.
&gt; STATUS: LANÇAMENTO MÚLTIPLO EFETUADO.
DESTRUIÇÃO MÚTUA ASSEGURADA. FIM DE JOGO.</pre><button type="button" class="arcade-nuke-launch" data-action="dead-hand-reset">[ REINICIAR SIMULACAO ]</button></section>`;
}

export function renderEscapeEnding(state) {
  if (!state.escape_ending_triggered) return '';
  return `<section class="escape-dialog" role="dialog" aria-modal="true"><pre>       __|__
--o--o--(_)--o--o--
     /     \\</pre><p class="escape-status">&gt; O PAIS CAIU. MAS O SEU HELICOPTERO PRIVADO DECOLOU.</p><p class="escape-status">&gt; CONTA OFFSHORE: ${formatMoney(state.slush_fund)}. VITORIA PESSOAL ATINGIDA.</p><button type="button" class="arcade-vote-yes" data-action="escape-reset">[ REINICIAR SIMULACAO ]</button></section>`;
}

export function renderFinalDilemma(state) {
  if (!state.pendingFinalDilemma) return '';
  return `<section class="modal-arcade-dialog" role="dialog" aria-modal="true"><pre class="ascii-constitution">/!\\ COLAPSO EMINENTE DO GOVERNO /!\\
O INIMIGO ESTA NOS PORTOES.
SEU HELICOPTERO ESTA NO TELHADO COM R$ 50 BILHOES.
A IA "MAO MORTA" AGUARDA SUA ORDEM FINAL.</pre><div class="action-row"><button type="button" class="arcade-vote-yes" data-action="final-escape">[ FUGIR EM SILENCIO ]</button><button type="button" class="arcade-vote-abandon" data-action="final-dead-hand">[ AFUNDAR COM O NAVIO ]</button><button type="button" class="arcade-nuke-launch" data-action="final-both">[ DESTRUIR O MUNDO DO HELICOPTERO ]</button></div></section>`;
}

export function renderInterrogation(state) {
  const pending = state.pendingInterrogation;
  if (!pending) return '';
  const actions = pending.phase === 'reward'
    ? '<button type="button" class="arcade-vote-yes" data-action="interrogation-reward" data-reward="extract-secrets">[ EXTRAIR SEGREDOS ]</button><button type="button" class="quiet-action" data-action="interrogation-reward" data-reward="turn-double-agent">[ RECRUTAR AGENTE DUPLO ]</button>'
    : '<button type="button" class="arcade-vote-yes" data-action="interrogation-method" data-method="soro">[ SORO DA VERDADE ]</button><button type="button" class="quiet-action" data-action="interrogation-method" data-method="tortura">[ TORTURA PSICOLOGICA ]</button><button type="button" class="quiet-action" data-action="interrogation-method" data-method="suborno">[ SUBORNO: R$ 1 BI ]</button>';
  return `<section class="terminal-dialog" role="dialog" aria-modal="true"><pre>&gt; PRISIONEIRO #847 ADQUIRIDO.
&gt; INICIANDO INTERROGATORIO.</pre><div class="action-row">${actions}</div></section>`;
}

function legacyMilitaryView(state) {
  const military = { soldiers: 0, equipmentMultiplier: 1, nuclear: {}, ...state.military };
  const nuclear = { civilProgress: 0, militaryProgress: 0, ...military.nuclear };
  const canCoup = state.regime.type === 'democracy' && military.support >= 85 && state.budget.defenseSpend >= 0.06;
  return `<section class="view-grid budget-grid"><section class="panel"><p class="eyebrow">Forcas Armadas</p><h2>Poder ${Number(military.power || 0).toFixed(0)}</h2><p class="notice">${state.notice}</p><div class="ledger-row"><span>Soldados</span><strong>${formatNumber.format(military.soldiers)}</strong></div><div class="ledger-row"><span>Equipamento</span><strong>x${Number(military.equipmentMultiplier).toFixed(2)}</strong></div><div class="ledger-row"><span>Apoio militar</span><strong>${Number(military.support || 0).toFixed(0)}%</strong></div><div class="action-row"><button type="button" class="quiet-action" data-action="recruit">Recrutar Soldados</button><button type="button" class="quiet-action" data-action="equipment" data-kind="tanks">Comprar Blindados</button><button type="button" class="quiet-action" data-action="equipment" data-kind="jets">Comprar Cacas</button></div><button type="button" class="quiet-action danger-action" data-action="coup" ${canCoup ? '' : 'disabled'}>Decretar estado de sitio</button></section><section class="panel"><p class="eyebrow">Programa nuclear</p><h2>Projetos especiais</h2><div class="ledger-row"><span>Energia civil</span><strong>${Number(nuclear.civilProgress).toFixed(0)}%</strong></div><div class="ledger-row"><span>Dissuasao militar</span><strong>${Number(nuclear.militaryProgress).toFixed(0)}%</strong></div><div class="action-row"><button type="button" class="quiet-action" data-action="nuclear" data-kind="civil" data-amount="5000000000">Energia 5 bi</button><button type="button" class="quiet-action" data-action="nuclear" data-kind="military" data-amount="5000000000">Dissuasao 5 bi</button></div></section></section>`;
}

export function renderMilitaryResearchProjects(state) {
  const points = Math.max(0, Number(state.military_research_points) || 0);
  const unlocked = new Set(state.unlocked_techs ?? []);
  return `<section class="panel military-research-panel"><div class="panel-heading"><div><p class="eyebrow">Projetos especiais</p><h2>/// PROJETOS ESPECIAIS ///</h2></div></div><p class="military-research-points">[ PONTOS DE PESQUISA MILITAR DISPONIVEIS: ${formatNumber.format(points)} ]</p><div class="military-tech-list">${MILITARY_TECHNOLOGIES.map((technology) => {
    const completed = unlocked.has(technology.id);
    const dependenciesMet = technology.requires.every((requiredId) => unlocked.has(requiredId));
    const affordable = points >= technology.cost;
    const requirements = technology.requires.length ? `Requer: ${technology.requires.join(', ')}` : 'Sem dependencia';
    const status = completed ? 'CONCLUÍDO' : !dependenciesMet ? 'DEPENDENCIA PENDENTE' : !affordable ? 'PP INSUFICIENTES' : 'PRONTO PARA INICIAR';
    return `<article class="military-tech-row ${completed ? 'completed' : ''}"><div><strong>${technology.title}</strong><span>Custo: ${formatNumber.format(technology.cost)} PP | ${requirements}</span><em>${status}</em></div><button type="button" class="${completed ? 'quiet-action' : 'primary-action'}" data-action="military-research" data-technology="${technology.id}" ${completed || !dependenciesMet || !affordable ? 'disabled' : ''}>${completed ? '[ CONCLUÍDO ]' : '[ INICIAR PROJETO ]'}</button></article>`;
  }).join('')}</div></section>`;
}

export function militaryView(state) {
  const military = state.military;
  const exercito = military.exercito ?? { soldados: military.soldiers ?? 0, blindados: 0 };
  const marinha = military.marinha ?? { navios: 0 };
  const aeronautica = military.aeronautica ?? { cacas: 0 };
  const nuclear = military.nuclear ?? {};
  const maintenance = calculateMilitaryMaintenance(military, state.military_tech_level);
  const canCoup = state.regime.type === 'democracy' && military.support >= 85 && state.budget.defenseSpend >= 0.06;
  return `<section class="view-grid budget-grid"><section class="panel"><p class="eyebrow">Tríade militar</p><h2>Poder total ${Number(military.power || 0).toFixed(1)}</h2><p class="notice">${state.notice}</p><div class="branch-list"><article class="branch-row"><div><strong>Exercito</strong><span>${formatNumber.format(exercito.soldados)} soldados | ${formatNumber.format(exercito.blindados)} blindados</span></div><div class="action-row"><button type="button" class="quiet-action" data-action="recruit">Recrutar soldados</button><button type="button" class="quiet-action" data-action="buy-tank">Comprar blindado</button></div></article><article class="branch-row"><div><strong>Marinha</strong><span>${formatNumber.format(marinha.navios)} navios operacionais</span></div><button type="button" class="quiet-action" data-action="buy-ship">Comprar navio</button></article><article class="branch-row"><div><strong>Aeronautica</strong><span>${formatNumber.format(aeronautica.cacas)} cacas operacionais</span></div><button type="button" class="quiet-action" data-action="buy-jet">Comprar caca</button></article></div><div class="ledger-row"><span>Apoio militar</span><strong>${Number(military.support || 0).toFixed(0)}%</strong></div><div class="ledger-row"><span>CUSTO DE MANUTENÇÃO MENSAL</span><strong>${formatMoney(maintenance)}</strong></div><button type="button" class="quiet-action danger-action" data-action="coup" ${canCoup ? '' : 'disabled'}>Decretar estado de sitio</button></section><section class="panel"><p class="eyebrow">Arsenal estrategico</p><h2>Programa nuclear</h2><div class="ledger-row"><span>Energia civil</span><strong>${Number(nuclear.civilProgress || 0).toFixed(0)}%</strong></div><div class="ledger-row"><span>Dissuasao militar</span><strong>${Number(nuclear.militaryProgress || 0).toFixed(0)}%</strong></div><div class="ledger-row"><span>Armas nucleares</span><strong>${Number(military.armasNucleares || 0)}</strong></div><div class="action-row"><button type="button" class="quiet-action" data-action="nuclear" data-kind="civil" data-amount="5000000000">Energia 5 bi</button><button type="button" class="quiet-action" data-action="nuclear" data-kind="military" data-amount="5000000000">Dissuasao 5 bi</button></div></section>${renderMilitaryResearchProjects(state)}</section>`;
}

function cabinetView(state) {
  const coupAvailable = state.government === 'republic' && state.economy.cash >= 500_000_000_000;
  const governmentCard = state.government === 'republic'
    ? `<article class="minister-row coup-row"><div><strong>Auto-Golpe de Estado</strong><span>Abandona a Republica por um Imperio Nacional ou Sindicato Corporativo.</span></div><button type="button" class="danger-action" data-action="auto-coup-open" ${coupAvailable ? '' : 'disabled'}>[ EXECUTAR AUTO-GOLPE (R$ 500 BI) ]</button></article>`
    : `<article class="minister-row completed"><div><strong>${state.title}</strong><span>Regime ativo: ${state.government === 'empire' ? 'hostilidade imperial crescente' : 'tributacao corporativa duplicada'}.</span></div></article>`;
  return `<section class="panel cabinet-panel"><div class="panel-heading"><div><p class="eyebrow">Equipe de governo</p><h2>Gabinete de Ministros</h2></div></div><div class="minister-list">${governmentCard}${MINISTERS.map((minister) => {
    const active = Boolean(state.ministers?.[minister.id]);
    return `<article class="minister-row"><div><strong>${minister.title}</strong><span>${minister.description}</span></div>${active ? `<button type="button" class="quiet-action" data-action="minister-dismiss" data-minister="${minister.id}">Demitir (+3 aprovacao)</button>` : `<button type="button" class="quiet-action" data-action="minister-hire" data-minister="${minister.id}">Contratar ${formatMoney(minister.cost)}</button>`}</article>`;
  }).join('')}</div></section>`;
}

function renderGovernmentModal(state) {
  if (!state.pendingGovernmentChoice) return '';
  return `<section class="modal-arcade-dialog" role="dialog" aria-modal="true" aria-labelledby="government-choice-title"><p class="modal-arcade-header">/// AUTO-GOLPE: NOVA ORDEM ///</p><h2 id="government-choice-title">ESCOLHA O DONO DO ESTADO</h2><pre class="ascii-constitution">A REPUBLICA FOI SILENCIADA.
O CAIXA PAGOU PELA MUDANCA.
ESCOLHA O REGIME QUE SOBREVIVERA.</pre><div class="constitution-options"><button type="button" class="constitution-choice" data-action="government-select" data-government="empire">[ IMPERIO NACIONAL ]<span>Exercito brutal. ONU ignorada. O mundo se torna hostil.</span></button><button type="button" class="constitution-choice" data-action="government-select" data-government="corporate">[ SINDICATO CORPORATIVO ]<span>Impostos em dobro. Se o caixa quebrar, vem a aquisicao hostil.</span></button></div></section>`;
}

function technologyView(state) {
  return `<section class="panel technology-panel"><div class="panel-heading"><div><p class="eyebrow">Inovacao nacional</p><h2>Tecnologia</h2></div><span class="country-code">${state.technology.points} PP</span></div><div class="technology-list">${TECHNOLOGIES.map((technology) => {
    const unlocked = state.technology.unlocked.includes(technology.id);
    const affordable = state.technology.points >= technology.cost;
    return `<article class="technology-card ${unlocked ? 'unlocked' : ''}"><p class="eyebrow">${technology.branch}</p><h3>${technology.title}</h3><p>${technology.description}</p><div><span>${technology.cost} PP</span><button type="button" class="quiet-action" data-action="research" data-technology="${technology.id}" ${unlocked || !affordable ? 'disabled' : ''}>${unlocked ? 'Concluida' : 'Pesquisar'}</button></div></article>`;
  }).join('')}</div></section>`;
}

function countriesView(state) {
  const selection = COUNTRIES.slice().sort((left, right) => left.nome.localeCompare(right.nome, 'pt-BR'));
  return `<section class="panel countries-panel"><div class="panel-heading"><div><p class="eyebrow">Banco mundial</p><h2>200 nacoes jogaveis</h2></div><span class="country-code">${selection.length}</span></div><div class="country-table"><div class="country-table-head"><span>Pais</span><span>Area territorial</span><span></span></div>${selection.map((country) => `<div class="country-row ${country.id === state.country.id ? 'selected' : ''}"><span><strong>${country.nome}</strong><small>${country.id.toUpperCase()}</small></span><span>${formatNumber.format(country.area_km2)} km²</span><button type="button" class="quiet-action" data-action="country" data-country="${country.id}">Governar</button></div>`).join('')}</div></section>`;
}

export function historyView(state) {
  const entries = state.history_log ?? [];
  return `<section id="tab-historico" class="panel historical-register"><div class="panel-heading"><div><p class="eyebrow">Arquivo presidencial</p><h2>&gt; DIARIO DA NACAO</h2></div><span class="country-code">${entries.length} CRONICAS</span></div><div id="history-log" class="history-terminal" aria-live="polite">${entries.length ? entries.map((entry) => {
    const month = MONTHS[(entry.month ?? 1) - 1]?.toUpperCase() ?? 'MES DESCONHECIDO';
    const mandateYear = Math.max(1, (entry.year ?? 2026) - 2025);
    const type = escapeHtml(entry.type);
    return `<article class="history-entry history-entry--${type}"><p>[ ${month}, ANO ${mandateYear} ] -- ${type.toUpperCase()}</p><span>&gt; ${escapeHtml(entry.text)}</span></article>`;
  }).join('') : '<p class="notice">&gt; Nenhum evento marcante foi registrado.</p>'}</div></section>`;
}

export function storyModeView(state) {
  const chapterIds = Array.isArray(state.unlocked_chapters) && state.unlocked_chapters.length
    ? state.unlocked_chapters
    : ['cap_1_origem'];
  const chapters = chapterIds.map((id) => LORE_CHAPTERS[id]).filter(Boolean);
  return `<section id="tab-modo-historia" class="panel story-manifesto"><div class="panel-heading"><div><p class="eyebrow">Arquivo pessoal // acesso do chefe de Estado</p><h2>&gt; MODO HISTÓRIA</h2></div><span class="country-code">${chapters.length} CAPÍTULO${chapters.length === 1 ? '' : 'S'}</span></div><p class="story-intro">Este é o meu manifesto. Cada capítulo foi desbloqueado por uma decisão que mudou o destino da nação.</p><div id="story-manifesto" class="story-book" aria-live="polite">${chapters.map((chapter, index) => `<article class="story-chapter ${index === chapters.length - 1 ? 'latest' : ''}"><p class="story-chapter-number">/// ARQUIVO ${String(index + 1).padStart(2, '0')} ///</p><h2>${escapeHtml(chapter.title)}</h2><p class="story-chapter-text">${escapeHtml(chapter.text)}</p><p class="story-signature">— O Presidente</p></article>`).join('')}</div></section>`;
}

export function renderNews(state) {
  const news = (state.news ?? []).slice(0, 5);
  return `<aside class="news-feed" aria-label="Giro de Noticias"><div class="panel-heading"><div><p class="eyebrow">Giro de Noticias</p><h2>Ultimas manchetes</h2></div></div><ol>${news.length ? news.map((item) => `<li><span>${MONTHS[(item.calendar?.month ?? 1) - 1]} ${item.calendar?.year ?? ''}</span>${item.text}</li>`).join('') : '<li><span>Agora</span>O gabinete aguarda a primeira decisao.</li>'}</ol></aside>`;
}

export function renderPeaceTreaty(state) {
  const treaty = state.geopolitics.peaceTreaty;
  const target = treaty?.status === 'pending'
    ? state.geopolitics.contacts.find((contact) => contact.id === treaty.targetId)
    : null;
  if (!target) return '';
  return `<section class="peace-dialog" role="dialog" aria-modal="true" aria-labelledby="tratado-titulo">
    <p class="eyebrow">Tratado de Paz Obrigatorio</p>
    <h2 id="tratado-titulo">${target.name} foi derrotado</h2>
    <p class="notice">Decida o destino do territorio antes de encerrar outro mes.</p>
    <div class="action-row"><button type="button" class="quiet-action danger-action" data-action="ui-annex">Anexar</button><button type="button" class="primary-action" data-action="ui-loot">Saquear Tesouro</button><button type="button" class="quiet-action" data-action="ui-puppet">Instalar Fantoche</button><button type="button" class="quiet-action" data-action="ui-demilitarize">Desmilitarizar</button><button type="button" class="quiet-action" data-action="ui-reparations">Reparacoes</button></div>
  </section>`;
}

export function renderCrisis(state) {
  const event = state.pendingEvent;
  if (!event) return '';
  return `<section class="peace-dialog crisis-dialog" role="dialog" aria-modal="true" aria-labelledby="crise-titulo"><p class="eyebrow">Crise Nacional</p><h2 id="crise-titulo">${event.title}</h2><p class="notice">${event.description}</p><div class="action-row">${event.options.map((option) => `<button type="button" class="${option.id === 'protect' || option.id === 'enforce-operation' ? 'quiet-action danger-action' : 'primary-action'}" data-action="crisis-option" data-option="${option.id}">${option.label}</button>`).join('')}</div></section>`;
}

export function renderUnAssembly(state) {
  const pending = state.pendingUnVote;
  const resolution = RESOLUTIONS.find((item) => item.id === pending?.resolutionId);
  if (!resolution) return '';
  return `<section class="peace-dialog un-dialog" role="dialog" aria-modal="true" aria-labelledby="onu-titulo"><p class="eyebrow">Assembleia Geral da ONU</p><h2 id="onu-titulo">${resolution.title}</h2><p class="notice">${resolution.description}</p><p class="notice">O Secretario da ONU chamou a votacao. Registre a posicao do seu governo.</p><div class="action-row"><button type="button" class="primary-action" data-action="un-vote" data-vote="yes">Votar SIM</button><button type="button" class="quiet-action danger-action" data-action="un-vote" data-vote="no">Votar NAO</button><button type="button" class="quiet-action" data-action="un-vote" data-vote="abstain">ABSTER</button></div></section>`;
}

export function renderSoftPower(state) {
  if (!state.pendingGlobalBid) return '';
  return `<section class="peace-dialog soft-power-dialog" role="dialog" aria-modal="true" aria-labelledby="jogos-titulo"><p class="eyebrow">Diplomacia Cultural</p><h2 id="jogos-titulo">Candidatura para os Jogos Mundiais</h2><p class="notice">A ONU abriu a selecao da proxima sede. A candidatura custa R$ 50 bi; vencer garante turismo por 12 meses e reputacao ONU de 100 por 36 meses.</p><div class="action-row"><button type="button" class="primary-action" data-action="global-games-bid">Candidatar R$ 50 bi</button><button type="button" class="quiet-action" data-action="global-games-decline">Recusar</button></div></section>`;
}

export function renderStoryCard(state) {
  const story = state.pendingStory ? getStoryEvent(state.currentStory) : null;
  if (story) {
    return `<section class="story-dialog" role="dialog" aria-modal="true" aria-labelledby="story-title">
      <p class="story-classification">/// DOSSIÊ CONFIDENCIAL // NÍVEL ÔMEGA ///</p>
      <h2 id="story-title">${escapeHtml(story.title)}</h2>
      <p class="story-typewriter">${escapeHtml(story.text)}</p>
      <button type="button" class="arcade-vote-yes story-dismiss" data-action="dismiss-story">${escapeHtml(story.button_label)}</button>
    </section>`;
  }
  const event = state.pendingBunkerEvent ? getWastelandEvent(state.pendingBunkerEvent.id) : null;
  if (!event) return '';
  return `<section class="story-dialog" role="dialog" aria-modal="true" aria-labelledby="story-title">
      <p class="story-classification">/// DILEMA DO VAULT · MÊS ${Number(state.wastelandMonthCounter) || 0} ///</p>
      <h2 id="story-title">${escapeHtml(event.title)}</h2>
      <p class="story-typewriter">${escapeHtml(event.description)}</p>
      <div class="action-row">${event.options.map((option, index) => `<button type="button" class="${index === 0 ? 'arcade-vote-yes' : 'arcade-vote-abandon'}" data-action="resolve-story-card" data-option="${escapeHtml(option.id)}" ${canResolveWastelandEvent(state, event.id, option.id) ? '' : 'disabled'}>${escapeHtml(option.label)}</button>`).join('')}</div>
  </section>`;
}

export function resolveStoryCardAction(state, action, optionId = null) {
  if (action === 'dismiss-story' && state.pendingStory) return dispensarHistoria(state);
  if (action === 'resolve-story-card' && state.pendingBunkerEvent && optionId) return resolveWastelandEvent(state, optionId);
  return state;
}

export function renderWastelandCinematic(state) {
  if (!state.is_wasteland || !state.wasteland_cinematic_ready) return '';
  return `<section class="wasteland-cinematic-card" role="dialog" aria-modal="true" aria-labelledby="wasteland-cinematic-title">
    <div class="radiation-symbol" aria-hidden="true">☢️</div>
    <p id="wasteland-cinematic-title" class="wasteland-cinematic-label">/// TRANSIÇÃO DE SOBREVIVÊNCIA ///</p>
    <pre class="wasteland-cinematic-text">[ ALERTA DE SISTEMA: SENSORES EXTERNOS DESTRUÍDOS ]
&gt; Nível de radiação exterior letal.
&gt; As superpotências não existem mais. A ONU não existe mais. O sol foi tapado pelas cinzas.
&gt; Bem-vindo à Nova Era, Líder. Os portões do Bunker foram selados. Sobreviva.</pre>
    <button type="button" class="wasteland-command-button" data-action="dismiss-wasteland-cinematic">[ ASSUMIR COMANDO DO VAULT ]</button>
  </section>`;
}

export function triggerNuclearFallout({ onThemeChange, onComplete } = {}) {
  if (typeof document === 'undefined' || !document.body) return false;
  document.getElementById('flash-nuclear')?.remove();
  const flash = document.createElement('div');
  flash.id = 'flash-nuclear';
  flash.setAttribute('aria-hidden', 'true');
  document.body.appendChild(flash);
  void flash.offsetWidth;
  document.body.classList.add('theme-wasteland', 'wasteland-mode');
  onThemeChange?.();
  requestAnimationFrame(() => flash.classList.add('flash-nuclear--fade'));
  window.setTimeout(() => {
    flash.remove();
    onComplete?.();
  }, 4000);
  return true;
}

export function mountDashboard(root) {
  if (!root) {
    throw new Error('Elemento raiz do dashboard nao encontrado.');
  }
  let state = loadState();
  let activeTab = 'overview';
  let storageNotice = '';
  let diplomacyQuery = '';
  const treatyModal = document.getElementById('modal-tratado');
  const crisisModal = document.getElementById('modal-crise');
  const unModal = document.getElementById('modal-onu');
  const softPowerModal = document.getElementById('modal-soft-power');
  const nukeModal = document.getElementById('modal-nuke');
  const nukeTarget = document.getElementById('nuke-target');
  const nukeCode = document.getElementById('nuke-code');
  const nukeFeedback = document.getElementById('nuke-feedback');
  const congressModal = document.getElementById('modal-congresso');
  const constitutionModal = document.getElementById('modal-constituicao');
  const deadHandModal = document.getElementById('modal-dead-hand');
  const escapeModal = document.getElementById('modal-fuga');
  const dilemmaModal = document.getElementById('modal-dilema-final');
  const interrogationModal = document.getElementById('modal-interrogatorio');
  const storyModal = document.getElementById('modal-historia');
  const allianceModal = document.getElementById('modal-alianca');
  const hostileAlertModal = document.getElementById('modal-alerta-hostil');
  const governmentModal = document.getElementById('modal-auto-golpe');
  const wastelandCinematicModal = document.getElementById('modal-wasteland-cinematic');
  const bunkerGeneratorModal = document.getElementById('modal-bunker-gerador');
  const expeditionReportModal = document.getElementById('modal-expedition-report');
  const congressLawTitle = document.getElementById('congresso-lei-titulo');
  const congressLawDescription = document.getElementById('congresso-lei-descricao');
  let pendingCongressLawId = null;
  let pendingNukeTargetId = null;
  let falloutCinematicStarted = false;
  let bunkerController = null;
  let bunkerBuildMode = false;
  let bunkerBuildType = 'dormitory';
  let locationRequestPending = false;
  let activeShelterRoom = null;
  let presidentSelectionMenu = null;
  let dialogueTimer = null;
  let dialogueTextComplete = false;
  let dialogueFullText = '';
  let dialogueCharactersRendered = 0;

  function openShelterRoom(room, { requestLocation = true } = {}) {
    if (!room || !bunkerGeneratorModal) return;
    activeShelterRoom = room;
    const isGenerator = room.type === 'generator';
    const description = {
      vault: 'Porta blindada e centro de comando dos sobreviventes.',
      elevator: 'Ligação vertical entre os andares habitados.',
      dormitory: 'Leitos modulares. Capacidade de abrigo ampliada.',
      generator: room.operational ? 'Unidade energética operacional.' : 'Unidade energética aguardando manutenção.',
      greenhouse: 'Cultivo hidropônico para sustentar o Vault.',
      laboratory: 'Centro de pesquisa científica. Produz Ciência conforme o nível e os especialistas alocados.',
      life_support: 'Unidade de ventilação e refrigeração. Produz oxigênio e consome energia para manter os setores habitáveis.',
      arsenal: 'Produz 1 arma por nível a cada mês. Equipamento para a defesa do Vault.',
      medical: 'Produz 2 curativos por nível e melhora o crescimento da população.',
      radio: 'Transmite sinais para atrair 3 sobreviventes por nível a cada mês.',
      office: 'Coordena operações e gera 5 sucatas por nível a cada mês.',
      detention: 'Cela reforçada para conter habitantes em rebelião. Dissidentes presos deixam de sabotar o Vault.',
      presidential_suite: 'Alojamento do comandante. O guarda-roupa permite adquirir e equipar vestimentas cosméticas.',
    }[room.type];
    bunkerGeneratorModal.innerHTML = `<section class="bunker-dialog" role="dialog" aria-modal="true" aria-labelledby="bunker-room-title"><p class="eyebrow">/// GESTÃO DO VAULT ///</p>${renderRoomManagement(state, room)}<pre>&gt; ANDAR ${room.floor + 1} / SETOR ${room.column}
&gt; ${description}</pre>${room.type === 'vault' ? expeditionLogisticsView(state) : ''}<div class="action-row">${room.type === 'presidential_suite' ? '<button type="button" class="primary-action" data-action="open-wardrobe">[ ABRIR GUARDA-ROUPA ]</button>' : ''}${isGenerator && !room.operational ? `<button type="button" class="primary-action" data-action="repair-generator" data-floor="${room.floor}" data-column="${room.column}" ${state.scrap >= 25 ? '' : 'disabled'}>[ REPARAR: 25 SUCATAS ]</button>` : ''}${room.type === 'arsenal' ? `<button type="button" class="primary-action" data-action="equip-guard" ${state.shelter_supplies?.weapons > 0 ? '' : 'disabled'}>[ EQUIPAR GUARDA: 1 ARMA ]</button>` : ''}${room.type === 'medical' ? `<button type="button" class="primary-action" data-action="treat-radiation" ${state.shelter_supplies?.medkits > 0 ? '' : 'disabled'}>[ TRATAR RADIAÇÃO: 1 CURATIVO ]</button>` : ''}${room.type === 'radio' ? `<button type="button" class="primary-action" data-action="broadcast-radio" ${state.scrap >= 10 ? '' : 'disabled'}>[ TRANSMITIR SINAL: 10 SUCATAS ]</button>` : ''}${room.type === 'office' ? (state.geopolitics?.contacts ?? []).map((contact) => `<button type="button" class="quiet-action" data-action="vault-scout" data-contact="${escapeHtml(contact.id)}" ${state.scrap >= 25 ? '' : 'disabled'}>[ BATEDORES: ${escapeHtml(contact.name)} ]</button>`).join('') : ''}<button type="button" class="quiet-action" data-action="close-bunker-modal">[ VOLTAR AO VAULT ]</button></div></section>`;
    bunkerGeneratorModal.hidden = false;
    bunkerController?.pause();
    if (requestLocation && room.type === 'vault' && !state.expeditionLocation && !locationRequestPending) {
      locationRequestPending = true;
      void resolveExpeditionLocation().then((location) => {
        state = { ...state, expeditionLocation: location };
        storageNotice = saveState(state);
        if (activeShelterRoom?.type === 'vault' && !bunkerGeneratorModal.hidden) {
          openShelterRoom(activeShelterRoom, { requestLocation: false });
        }
      }).finally(() => { locationRequestPending = false; });
    }
  }

  function openWardrobe() {
    if (!bunkerGeneratorModal || activeShelterRoom?.type !== 'presidential_suite') return;
    bunkerGeneratorModal.innerHTML = renderWardrobeView(state);
    bunkerGeneratorModal.hidden = false;
    bunkerController?.pause();
  }

  function refreshShelterSlots() {
    const select = root.querySelector('#shelter-build-slot');
    if (!select) return;
    const slots = findBuildSlots(state.shelter_grid, bunkerBuildType);
    const previous = select.value;
    select.innerHTML = slots.map(({ floor, column }) => `<option value="${floor}:${column}">Andar ${floor + 1} · setor ${column === 0 ? 'elevador' : column} · ${formatNumber.format(getShelterBuildCost(bunkerBuildType, floor, state.presidentClass))} sucatas</option>`).join('');
    if (slots.some(({ floor, column }) => `${floor}:${column}` === previous)) select.value = previous;
    const [floor] = select.value.split(':').map(Number);
    const selectedCost = slots.length && Number.isInteger(floor) ? getShelterBuildCost(bunkerBuildType, floor, state.presidentClass) : null;
    const place = root.querySelector('[data-action="shelter-place"]');
    if (place) {
      place.textContent = selectedCost === null ? '[ SEM SETOR DISPONÍVEL ]' : `[ CONSTRUIR: ${formatNumber.format(selectedCost)} SUCATAS ]`;
      place.disabled = !slots.length || state.scrap < selectedCost;
    }
  }

  function render() {
    const bunkerSnapshot = bunkerController?.getSnapshot();
    bunkerController?.destroy();
    bunkerController = null;
    presidentSelectionMenu?.destroy();
    presidentSelectionMenu = null;
    if (typeof document !== 'undefined' && document.body) {
      const flashPending = Boolean(state.is_wasteland && state.wasteland_cinematic_pending);
      document.body.classList.toggle('wasteland-mode', Boolean(state.is_wasteland && !flashPending));
      document.body.classList.toggle('theme-wasteland', Boolean(state.is_wasteland && !flashPending));
    }
    const projection = projectBudget(state.economy, state.budget);
    const tabs = [
      ['overview', 'Visao geral'],
      ['budget', 'Orcamento'],
      ['diplomacy', 'Diplomacia'],
      ['military', 'Forcas Armadas'],
      ['cabinet', 'Gabinete'],
      ['technology', 'Tecnologia'],
      ['projects', 'Projetos Internos'],
      ['congress', 'Congresso'],
      ['history', '> MODO HISTÓRIA'],
      ['countries', 'Paises'],
    ];
    const content = state.is_wasteland ? bunkerView(state)
      : activeTab === 'budget' ? budgetView(state, projection)
      : activeTab === 'diplomacy' ? diplomacyView(state, diplomacyQuery)
        : activeTab === 'military' ? militaryView(state)
          : activeTab === 'cabinet' ? cabinetView(state)
          : activeTab === 'technology' ? technologyView(state)
            : activeTab === 'projects' ? projectsView(state)
      : activeTab === 'congress' ? congressView(state)
        : activeTab === 'history' ? storyModeView(state)
        : activeTab === 'countries' ? countriesView(state)
          : overviewView(state, projection);
    const topbarActions = state.is_wasteland
      ? `<span class="bunker-era">${state.country.nome}</span><button type="button" class="quiet-action" data-action="reset">Nova partida</button>`
      : `<label class="country-picker"><span>Pais</span><select data-action="select-country" aria-label="Selecionar pais">${COUNTRIES.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map((country) => `<option value="${country.id}" ${country.id === state.country.id ? 'selected' : ''}>${country.nome}</option>`).join('')}</select></label><button type="button" class="quiet-action" data-action="reset">Reiniciar</button>`;
    root.innerHTML = `<div class="app-shell">
      <aside class="sidebar"><div class="brand"><span class="brand-mark">SP</span><div><strong>Simulador</strong><small>de Presidente</small></div></div><nav class="tab-list" aria-label="Navegacao principal">${tabs.map(([id, label]) => `<button type="button" class="tab-button ${activeTab === id ? 'active' : ''}" data-action="tab" data-tab="${id}">${label}</button>`).join('')}</nav><div class="sidebar-footer"><span>Mandato em curso</span><strong>${state.calendar.year}</strong></div></aside>
      <section class="workspace"><header class="topbar"><div><p class="eyebrow">${state.title ?? 'Presidente'}</p><h1>${state.is_wasteland ? 'ANO ZERO PÓS-BOMBA' : `${MONTHS[state.calendar.month - 1]} de ${state.calendar.year}`}</h1></div><div class="topbar-actions">${topbarActions}</div></header>
      <section class="metrics">${metric('PIB', formatMoney(state.economy.gdp))}${metric('Inflacao', formatPercent(state.economy.inflation), state.economy.inflation > 0.1 ? 'negative' : '')}${metric('Desemprego', formatPercent(state.economy.unemployment))}${metric('Apoio interno', `${getFactionSupport(state.factions).toFixed(0)}%`, getFactionSupport(state.factions) >= 55 ? 'positive' : '')}${metric('Caixa nacional', formatMoney(state.economy.cash))}${metric('DEFCON', `DEFCON: ${state.global_defcon}`, `defcon-${state.global_defcon}`)}${metric('Saldo projetado', formatMoney(projection.monthlyBalance), projection.monthlyBalance >= 0 ? 'positive' : 'negative')}</section>
      ${storageNotice ? `<p class="storage-notice">${storageNotice}</p>` : ''}
      ${state.notice === STORY_NOTICE ? `<p class="storage-notice story-notification" role="status">${STORY_NOTICE}</p>` : ''}
      <section class="content-area">${content}</section>${renderNews(state)}
    </section></div>`;
    if (state.is_wasteland) {
      if (state.president_selection_pending) {
        presidentSelectionMenu = createPresidentSelectionMenu(root.querySelector('#presidentSelectCanvas'), (classId) => {
          const next = startGame(state, classId);
          if (next !== state) commit(next);
        });
      } else {
        bunkerController = createRpgBunkerEngine(root.querySelector('#shelterCanvas'), {
          grid: state.shelter_grid,
          player: bunkerSnapshot?.player ?? state.rpg_player,
          inhabitants: state.inhabitants,
          cabinFloor: bunkerSnapshot?.cabinFloor,
          environment: bunkerSnapshot?.environment ?? state.environment,
          weather: bunkerSnapshot?.weather ?? state.weather,
          isNight: state.isNight,
          oxygenDeprived: state.oxygen_deprived,
          currentDay: state.currentDay,
          presidentClass: state.presidentClass,
          equippedSkin: state.equippedSkin,
          lootbox: {
            opened: Boolean(state.pendingLoot && state.lootbox_opened),
            clickCount: state.lootbox_click_count,
            revealed: state.lootbox_revealed,
            revealedAt: state.lootbox_revealed_at,
            shakeStartedAt: state.lootbox_shake_started_at,
          },
          onLootboxClick: () => {
            const next = advanceLootboxClick(state, performance.now());
            if (next.lootbox_click_count !== state.lootbox_click_count) playLootboxSound(next.lootbox_click_count);
            const revealCardsAfterBurst = next.lootbox_revealed && !next.lootbox_cards_visible;
            commit(next);
            if (revealCardsAfterBurst) {
              window.setTimeout(() => {
                if (state.pendingLoot && state.lootbox_revealed && !state.lootbox_cards_visible) {
                  commit({ ...state, lootbox_cards_visible: true });
                }
              }, 900);
            }
          },
          onBuild: (type, floor, column) => commit(buildShelterRoom(state, type, floor, column)),
          onPlayerChanged: (player) => {
            state = { ...state, rpg_player: player };
            storageNotice = saveState(state);
          },
          onInhabitantsChanged: (inhabitants) => {
            state = { ...state, inhabitants };
            storageNotice = saveState(state);
          },
          onEnvironmentChanged: (environment, { persist, weatherChanged }) => {
            state = { ...state, environment: { elapsedMs: environment.elapsedMs }, isNight: environment.isNight,
              ...(environment.weather ? { weather: environment.weather } : {}) };
            const hud = root.querySelector('[data-environment-hud]');
            if (hud) hud.outerHTML = bunkerEnvironmentHudView(environment, environment.isNight, state.inhabitants, state.shelter_guards, state.presidentClass, state.weather);
            if (weatherChanged && activeShelterRoom?.type === 'vault' && !bunkerGeneratorModal.hidden) {
              openShelterRoom(activeShelterRoom, { requestLocation: false });
            }
            if (persist) storageNotice = saveState(state);
          },
          onDayPassed: (days) => {
            state = { ...state, currentDay: Math.max(1, (Number(state.currentDay) || 1) + days) };
            storageNotice = saveState(state);
          },
          onDialogue: (npc, text) => {
            if (dialogueTimer !== null) window.clearInterval(dialogueTimer);
            dialogueTextComplete = false;
            dialogueFullText = String(text ?? '');
            dialogueCharactersRendered = 0;
            const modal = root.querySelector('[data-dialogue-modal]');
            if (!modal) return;
            modal.outerHTML = renderDialogueView(npc);
            const activeModal = root.querySelector('[data-dialogue-modal]');
            activeModal.hidden = false;
            const textNode = activeModal.querySelector('[data-dialogue-text]');
            dialogueTimer = window.setInterval(() => {
              if (!textNode) {
                window.clearInterval(dialogueTimer);
                dialogueTimer = null;
                dialogueTextComplete = true;
                return;
              }
              textNode.textContent += dialogueFullText[dialogueCharactersRendered++];
              if (isDialogueTextComplete(dialogueCharactersRendered, dialogueFullText.length)) {
                window.clearInterval(dialogueTimer);
                dialogueTimer = null;
                dialogueTextComplete = true;
              }
            }, DIALOGUE_CHAR_INTERVAL_MS);
          },
          onDialogueAdvance: () => {
            if (dialogueTextComplete || isDialogueTextComplete(dialogueCharactersRendered, dialogueFullText.length)) return false;
            if (dialogueTimer !== null) window.clearInterval(dialogueTimer);
            dialogueTimer = null;
            dialogueTextComplete = true;
            const textNode = root.querySelector('[data-dialogue-text]');
            if (textNode) textNode.textContent = dialogueFullText;
            return true;
          },
          onDialogueClose: (npc) => {
            if (dialogueTimer !== null) window.clearInterval(dialogueTimer);
            dialogueTimer = null;
            dialogueTextComplete = false;
            dialogueFullText = '';
            const modal = root.querySelector('[data-dialogue-modal]');
            if (modal) modal.hidden = true;
            const result = applyDialoguePacification(state, npc.id);
            if (result.pacified) {
              state = result.state;
              storageNotice = saveState(state);
            }
            return result.pacified ? {
              loyalty: result.npc.loyalty,
              revoltChance: result.npc.revoltChance,
              lastTalkedDay: result.npc.lastTalkedDay,
              rebellionCheckDone: result.npc.rebellionCheckDone,
              needs: result.npc.needs,
            } : false;
          },
          onRoom: openShelterRoom,
          onDetain: (inhabitantId) => commit(detainRebel(state, inhabitantId)),
          onHint: (hint) => {
            const tooltip = root.querySelector('[data-bunker-tooltip]');
            if (!tooltip) return;
            tooltip.textContent = hint;
            tooltip.hidden = !hint;
          },
          onAssetsReady: (failed) => {
            if (!failed.length) return;
            const status = root.querySelector('[data-shelter-status]');
            if (status) status.textContent = `TEXTURAS INDISPONÍVEIS: ${failed.join(', ')}`;
          },
        });
        bunkerController?.setBuildType(bunkerBuildType);
        bunkerController?.setBuildMode(bunkerBuildMode);
        const buildToggle = root.querySelector('[data-action="shelter-build-mode"]');
        if (buildToggle) buildToggle.setAttribute('aria-pressed', String(bunkerBuildMode));
        const buildControls = root.querySelector('.bunker-build-controls');
        if (buildControls) buildControls.hidden = !bunkerBuildMode;
        root.querySelectorAll('[data-action="shelter-module"]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.module === bunkerBuildType)));
        if (state.pendingExpeditionReports?.length || state.pendingBunkerEvent || state.pendingLoot) bunkerController?.pause();
        refreshShelterSlots();
      }
    }
    if (expeditionReportModal) {
      const reportMarkup = state.pendingBunkerEvent ? '' : expeditionReportView(state);
      expeditionReportModal.innerHTML = reportMarkup;
      expeditionReportModal.hidden = !reportMarkup;
    }
    if (treatyModal) {
      const treatyMarkup = renderPeaceTreaty(state);
      treatyModal.hidden = !treatyMarkup;
      treatyModal.innerHTML = treatyMarkup;
    }
    if (crisisModal) {
      const crisisMarkup = renderCrisis(state);
      crisisModal.hidden = !crisisMarkup;
      crisisModal.innerHTML = crisisMarkup;
    }
    if (unModal) {
      const unMarkup = renderUnAssembly(state);
      unModal.hidden = !unMarkup;
      unModal.innerHTML = unMarkup;
    }
    if (softPowerModal) {
      const softPowerMarkup = renderSoftPower(state);
      softPowerModal.hidden = !softPowerMarkup;
      softPowerModal.innerHTML = softPowerMarkup;
    }
    if (deadHandModal) {
      const deadHandMarkup = renderDeadHandTerminal(state);
      deadHandModal.hidden = !deadHandMarkup;
      deadHandModal.innerHTML = deadHandMarkup;
    }
    if (escapeModal) { const markup = renderEscapeEnding(state); escapeModal.hidden = !markup; escapeModal.innerHTML = markup; }
    if (dilemmaModal) { const markup = renderFinalDilemma(state); dilemmaModal.hidden = !markup; dilemmaModal.innerHTML = markup; }
    if (interrogationModal) { const markup = renderInterrogation(state); interrogationModal.hidden = !markup; interrogationModal.style.display = markup ? '' : 'none'; interrogationModal.innerHTML = markup; }
    if (storyModal) { const markup = renderStoryCard(state); storyModal.hidden = !markup; storyModal.innerHTML = markup; }
    if (allianceModal) { const markup = renderAllianceInvocation(state); allianceModal.hidden = !markup; allianceModal.innerHTML = markup; }
    if (hostileAlertModal) { const markup = renderHostileAlert(state); hostileAlertModal.hidden = !markup; hostileAlertModal.innerHTML = markup; }
    if (governmentModal) { const markup = renderGovernmentModal(state); governmentModal.hidden = !markup; governmentModal.innerHTML = markup; }
    if (wastelandCinematicModal) {
      const markup = renderWastelandCinematic(state);
      wastelandCinematicModal.hidden = !markup;
      wastelandCinematicModal.innerHTML = markup;
    }
    if (activeTab === 'history') {
      const historyLog = root.querySelector('#story-manifesto, #history-log');
      if (historyLog) historyLog.scrollTop = historyLog.scrollHeight;
    }
    if (activeTab === 'diplomacy') filterDiplomacyRows(root, diplomacyQuery);
  }

  function startFalloutCinematicIfNeeded() {
    if (!state.wasteland_cinematic_pending || falloutCinematicStarted) return;
    falloutCinematicStarted = true;
    triggerNuclearFallout({
      onComplete: () => commit({ ...state, wasteland_cinematic_pending: false, wasteland_cinematic_ready: true, notice: 'Os portoes do Vault estao selados. Assuma o comando.' }),
    });
  }

  function commit(nextState) {
    state = nextState;
    storageNotice = saveState(state);
    render();
    startFalloutCinematicIfNeeded();
  }

  window.logHistoryEvent = (type, text) => commit(registrarEventoHistorico(state, type, text));
  window.criarLiga = (targetId) => commit(criarLiga(state, targetId));

  function fecharModalVotacao() {
    pendingCongressLawId = null;
    if (congressModal) congressModal.hidden = true;
  }

  function abrirModalVotacao(lawId) {
    const law = LAWS.find((item) => item.id === lawId);
    const lawState = law ? state.laws[law.stateKey] : null;
    if (!law || lawState?.voteCompleted || !congressModal) return;

    pendingCongressLawId = lawId;
    congressLawTitle.textContent = law.title;
    congressLawDescription.textContent = law.description;
    congressModal.hidden = false;
  }

  function confirmarVotoCongresso() {
    if (!pendingCongressLawId) return;
    const lawId = pendingCongressLawId;
    fecharModalVotacao();
    commit(confirmarVotoLei(state, lawId));
  }

  window.abrirModalVotacao = abrirModalVotacao;
  window.confirmarVotoSim = confirmarVotoCongresso;

  function fecharModalConstituicao() {
    if (constitutionModal) constitutionModal.hidden = true;
  }

  function abrirModalConstituicao() {
    if (!canPromulgarConstituicao(state) || !constitutionModal) return;
    constitutionModal.hidden = false;
  }

  function fecharModalNuclear() {
    pendingNukeTargetId = null;
    if (nukeModal) nukeModal.hidden = true;
  }

  function abrirCodigosNucleares(contactId) {
    const target = state.geopolitics.contacts.find((contact) => contact.id === contactId);
    if (!target?.atWar || !canAutorizarAniquilacaoNuclear(state) || !nukeModal) return;

    pendingNukeTargetId = contactId;
    nukeTarget.textContent = target.name;
    nukeCode.value = '';
    nukeFeedback.textContent = '';
    nukeModal.hidden = false;
    nukeCode.focus();
  }

  function confirmarAniquilacaoNuclear() {
    if (!pendingNukeTargetId) return;
    if (nukeCode.value.trim() !== 'KABOOM') {
      nukeFeedback.textContent = 'CODIGO INVALIDO. SISTEMA BLOQUEADO.';
      return;
    }

    const nextState = autorizarAniquilacaoNuclear(state, pendingNukeTargetId, nukeCode.value.trim());
    if (nextState.is_wasteland) {
      fecharModalNuclear();
      commit(nextState);
      return;
    }
    const target = nextState.geopolitics.contacts.find((contact) => contact.id === pendingNukeTargetId);
    if (!target?.wasteland) {
      nukeFeedback.textContent = nextState.notice;
      return;
    }

    fecharModalNuclear();
    commit(nextState);
  }

  function resolvePendingTreaty(choice) {
    const targetId = state.geopolitics.peaceTreaty?.targetId;
    if (targetId) commit(resolvePeaceTreaty(state, targetId, choice));
  }

  window.uiAnexar = () => resolvePendingTreaty('annex');
  window.uiSaquear = () => resolvePendingTreaty('loot');
  window.uiFantoche = () => resolvePendingTreaty('puppet');

  treatyModal?.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'ui-annex') window.uiAnexar();
    if (action === 'ui-loot') window.uiSaquear();
    if (action === 'ui-puppet') window.uiFantoche();
    if (action === 'ui-demilitarize') resolvePendingTreaty('demilitarize');
    if (action === 'ui-reparations') resolvePendingTreaty('reparations');
  });

  crisisModal?.addEventListener('click', (event) => {
    const optionId = event.target.closest('[data-action="crisis-option"]')?.dataset.option;
    if (optionId) commit(resolveEvent(state, optionId));
  });

  unModal?.addEventListener('click', (event) => {
    const vote = event.target.closest('[data-action="un-vote"]')?.dataset.vote;
    if (vote) commit(votarNaONU(state, vote));
  });

  softPowerModal?.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'global-games-bid') commit(candidatarJogosMundiais(state));
    if (action === 'global-games-decline') commit(recusarJogosMundiais(state));
  });

  congressModal?.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'confirm-congress-vote') window.confirmarVotoSim();
    if (action === 'abandon-congress-vote') fecharModalVotacao();
  });

  constitutionModal?.addEventListener('click', (event) => {
    const control = event.target.closest('[data-action]');
    if (!control) return;
    if (control.dataset.action === 'constitution-cancel') fecharModalConstituicao();
    if (control.dataset.action === 'constitution-select') {
      fecharModalConstituicao();
      commit(promulgarNovaConstituicao(state, control.dataset.pillar));
    }
  });

  nukeModal?.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'confirm-nuke-launch') confirmarAniquilacaoNuclear();
    if (action === 'cancel-nuke-launch') fecharModalNuclear();
  });

  deadHandModal?.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="dead-hand-reset"]')) {
      activeTab = 'overview';
      commit(createGameState(state.country.id));
    }
  });

  escapeModal?.addEventListener('click', (event) => { if (event.target.closest('[data-action="escape-reset"]')) { activeTab = 'overview'; commit(createGameState(state.country.id)); } });
  dilemmaModal?.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'final-escape') commit(fugirEmSilencio(state));
    if (action === 'final-dead-hand') commit(afundarComONavio(state));
    if (action === 'final-both') commit(destruirDoHelicoptero(state));
  });
  interrogationModal?.addEventListener('click', (event) => {
    const control = event.target.closest('[data-action]');
    if (control?.dataset.action === 'interrogation-method') {
      interrogationModal.style.display = 'none';
      commit(escolherSitioNegro(state, control.dataset.method));
    }
    if (control?.dataset.action === 'interrogation-reward') commit(reivindicarSitioNegro(state, control.dataset.reward));
  });

  storyModal?.addEventListener('click', (event) => {
    const control = event.target.closest('[data-action]');
    const action = control?.dataset.action;
    if (!action) return;
    const nextState = resolveStoryCardAction(state, action, control.dataset.option ?? null);
    if (nextState === state) return;
    commit(nextState);
    if (action === 'resolve-story-card') root.querySelector('#shelterCanvas')?.focus();
  });

  allianceModal?.addEventListener('click', (event) => {
    const decision = event.target.closest('[data-action="article5"]')?.dataset.decision;
    if (decision) commit(respondArticle5(state, decision));
  });

  hostileAlertModal?.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="dismiss-hostile-alert"]')) commit(dispensarAlertaHostil(state));
  });

  governmentModal?.addEventListener('click', (event) => {
    const government = event.target.closest('[data-action="government-select"]')?.dataset.government;
    if (government) commit(resolverAutoGolpe(state, government));
  });

  wastelandCinematicModal?.addEventListener('click', (event) => {
    if (!event.target.closest('[data-action="dismiss-wasteland-cinematic"]')) return;
    falloutCinematicStarted = false;
    commit({ ...state, wasteland_cinematic_pending: false, wasteland_cinematic_ready: false, notice: 'Comando do Vault assumido. A superficie aguarda.' });
  });

  bunkerGeneratorModal?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    const action = button?.dataset.action;
    if (action === 'open-wardrobe') { openWardrobe(); return; }
    if (action === 'wardrobe-back') { openShelterRoom(activeShelterRoom, { requestLocation: false }); return; }
    if (action === 'skin-buy' || action === 'skin-equip') {
      const next = action === 'skin-buy' ? purchaseSkin(state, button.dataset.skin) : equipSkin(state, button.dataset.skin);
      if (next !== state) commit(next);
      openWardrobe();
      return;
    }
    if (action === 'upgrade-shelter-room') {
      const floor = Number(button.dataset.floor);
      const column = Number(button.dataset.column);
      commit(upgradeShelterRoom(state, floor, column));
      openShelterRoom(getRoom(state.shelter_grid, floor, column));
      return;
    }
    if (action === 'close-bunker-modal') {
      bunkerGeneratorModal.hidden = true;
      activeShelterRoom = null;
      bunkerController?.resume();
    }
    if (action === 'start-expedition') {
      const destination = root.querySelector('[data-expedition-destination]')?.value ?? null;
      bunkerGeneratorModal.hidden = true;
      activeShelterRoom = null;
      bunkerController?.resume();
      commit(startExpedition(state, button.dataset.inhabitant, destination));
      root.querySelector('#shelterCanvas')?.focus();
    }
    if (action === 'repair-generator' || action === 'equip-guard' || action === 'treat-radiation' || action === 'broadcast-radio' || action === 'vault-scout') {
      bunkerGeneratorModal.hidden = true;
      activeShelterRoom = null;
      bunkerController?.resume();
      const floor = Number(button.dataset.floor);
      const column = Number(button.dataset.column);
      const next = action === 'repair-generator' ? repairShelterGenerator(state, floor, column)
        : action === 'equip-guard' ? equipShelterGuard(state)
            : action === 'treat-radiation' ? useShelterMedkit(state)
              : action === 'broadcast-radio' ? broadcastShelterSignal(state)
                : enviarBatedoresWasteland(state, button.dataset.contact);
      commit(next);
    }
  });

  expeditionReportModal?.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="collect-expedition-loot"]')) {
      commit(collectExpeditionLoot(state));
      root.querySelector('#shelterCanvas')?.focus();
      return;
    }
    if (!event.target.closest('[data-action="dismiss-expedition-report"]')) return;
    commit(dismissExpeditionReport(state));
    root.querySelector('#shelterCanvas')?.focus();
  });

  root.addEventListener('click', (event) => {
    if (event.target.closest('.bunker-stage') && bunkerController?.isDialogueOpen()) {
      bunkerController?.advanceDialogue();
      return;
    }
    const control = event.target.closest('[data-action]');
    if (!control || control.disabled) return;
    const { action } = control.dataset;
    if (action === 'close-dialogue') { bunkerController?.advanceDialogue(); return; }
    if (action === 'open-expedition-lootbox') {
      const next = openExpeditionLootbox(state);
      if (next === state) return;
      commit(next);
      root.querySelector('#shelterCanvas')?.focus();
      return;
    }
    if (action === 'shelter-build-mode') {
      bunkerBuildMode = !bunkerBuildMode;
      control.setAttribute('aria-pressed', String(bunkerBuildMode));
      root.querySelector('.bunker-build-controls').hidden = !bunkerBuildMode;
      bunkerController?.setBuildMode(bunkerBuildMode);
      return;
    }
    if (action === 'shelter-module') {
      bunkerBuildType = control.dataset.module;
      root.querySelectorAll('[data-action="shelter-module"]').forEach((button) => button.setAttribute('aria-pressed', String(button === control)));
      bunkerController?.setBuildType(bunkerBuildType);
      refreshShelterSlots();
      return;
    }
    if (action === 'shelter-place') {
      const [floor, column] = root.querySelector('#shelter-build-slot')?.value.split(':').map(Number) ?? [];
      const next = buildShelterRoom(state, bunkerBuildType, floor, column);
      commit(next);
      if (getRoom(next.shelter_grid, floor, column)?.type === 'presidential_suite') {
        openShelterRoom(getRoom(next.shelter_grid, floor, column), { requestLocation: false });
      }
      return;
    }
    if (action === 'select-president') { commit(startGame(state, control.dataset.class)); return; }
    if (action === 'shelter-open-room') {
      const [floor, column] = root.querySelector('#shelter-room-select')?.value.split(':').map(Number) ?? [];
      openShelterRoom(getRoom(state.shelter_grid, floor, column));
      return;
    }
    if (action === 'tab') { activeTab = control.dataset.tab; render(); return; }
    if (action === 'tax') { commit(changeTax(state, control.dataset.tax, Number(control.dataset.delta))); return; }
    if (action === 'slush-fund') { commit(desviarFundosParaCaixa2(state)); return; }
    if (action === 'leader-double') { commit(infiltrarSosiaLider(state, control.dataset.contact)); return; }
    if (action === 'treaty') { commit(proposeTreaty(state, control.dataset.contact)); return; }
    if (action === 'resource-import') { commit(importarRecursos(state, control.dataset.contact, control.dataset.resource, Number(control.dataset.amount))); return; }
    if (action === 'alliance') { window.criarLiga(control.dataset.contact); return; }
    if (action === 'war') { commit(startWar(state, control.dataset.contact)); return; }
    if (action === 'insult') { commit(insultarNacao(state, control.dataset.contact)); return; }
    if (action === 'peace') { commit(resolvePeaceTreaty(state, control.dataset.contact, control.dataset.choice)); return; }
    if (action === 'league-create') { commit(createLeague(state, 'Liga Global')); return; }
    if (action === 'league-invite') { commit(inviteToLeague(state, control.dataset.contact)); return; }
    if (action === 'sabotage') { commit(sabotar(state, control.dataset.contact)); return; }
    if (action === 'fund-rebels') { commit(financiarRebeldes(state, control.dataset.contact)); return; }
    if (action === 'cyber-attack') { commit(lancarCiberataque(state, control.dataset.contact)); return; }
    if (action === 'synthetic-virus') { commit(lancarVirusSintetico(state, control.dataset.contact)); return; }
    if (action === 'false-flag') { commit(executarFalsaBandeira(state, control.dataset.contact)); return; }
    if (action === 'nuclear-codes') { abrirCodigosNucleares(control.dataset.contact); return; }
    if (action === 'union-absorb') { commit(absorverPaisParaUniao(state, control.dataset.contact)); return; }
    if (action === 'socialist-revolution') { commit(decretarRevolucaoSocialista(state)); return; }
    if (action === 'constitution-open') { abrirModalConstituicao(); return; }
    if (action === 'auto-coup-open') { commit(executarAutoGolpe(state)); return; }
    if (action === 'sanction') { commit(imporSancao(state, control.dataset.contact)); return; }
    if (action === 'ultimatum') { commit(exigirAnexacao(state, control.dataset.contact)); return; }
    if (action === 'nuclear-strike') { commit(lancarAtaqueNuclear(state, control.dataset.contact)); return; }
    if (action === 'recruit') { commit(recrutarSoldado(state)); return; }
    if (action === 'equipment') { commit(comprarMaterialMilitar(state, control.dataset.kind)); return; }
    if (action === 'buy-tank') { commit(comprarBlindado(state)); return; }
    if (action === 'buy-ship') { commit(comprarNavio(state)); return; }
    if (action === 'buy-jet') { commit(comprarCaca(state)); return; }
    if (action === 'nuclear') { commit(fundNuclear(state, control.dataset.kind, Number(control.dataset.amount))); return; }
    if (action === 'minister-hire') { commit(hireMinister(state, control.dataset.minister)); return; }
    if (action === 'minister-dismiss') { commit(dismissMinister(state, control.dataset.minister)); return; }
    if (action === 'coup') { commit(attemptAutogolpe(state)); return; }
    if (action === 'research') { commit(researchTechnology(state, control.dataset.technology)); return; }
    if (action === 'military-research') { commit(pesquisarTecnologiaMilitar(state, control.dataset.technology)); return; }
    if (action === 'automate-industry') { commit(automatizarIndustria(state)); return; }
    if (action === 'internal-project') { commit(construirProjetoInterno(state, control.dataset.project)); return; }
    if (action === 'mega-vault') { commit(construirMegaVault(state)); return; }
    if (action === 'wasteland-project') { commit(construirProjetoWasteland(state, control.dataset.project)); return; }
    if (action === 'wasteland-scout') { commit(enviarBatedoresWasteland(state, control.dataset.contact)); return; }
    if (action === 'dead-hand-project') { commit(iniciarProjetoMaoMorta(state)); return; }
    if (action === 'nationalize-megacorps') { commit(estatizarMegacorporacoes(state)); return; }
    if (action === 'negotiate') { commit(negotiate(state, control.dataset.bloc)); return; }
    if (action === 'vote') { commit(voteLaborLaw(state)); return; }
    if (action === 'open-law-vote') { window.abrirModalVotacao(control.dataset.law); return; }
    if (action === 'advance') { commit(advanceMonth(state)); return; }
    if (action === 'country') { activeTab = 'overview'; commit(createGameState(control.dataset.country)); return; }
    if (action === 'reset') { activeTab = 'overview'; commit(createGameState(state.country.id)); }
  });

  root.addEventListener('change', (event) => {
    if (event.target.matches('#shelter-build-slot')) {
      refreshShelterSlots();
      return;
    }
    if (event.target.matches('[data-action="budget"]')) {
      commit(setBudget(state, event.target.dataset.budget, Number(event.target.value)));
      return;
    }
    if (event.target.matches('[data-action="select-country"]')) {
      activeTab = 'overview';
      commit(createGameState(event.target.value));
    }
  });

  root.addEventListener('input', (event) => {
    if (event.target.matches('[data-action="diplomacy-search"]')) {
      diplomacyQuery = event.target.value;
      filterDiplomacyRows(root, diplomacyQuery);
    }
  });

  render();
  startFalloutCinematicIfNeeded();
}
