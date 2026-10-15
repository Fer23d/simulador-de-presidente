import { COUNTRIES, createCountryProfile, getCountryById } from '../data/countries.js';
import { getVoteForecast } from '../core/congress.js';
import { BUDGET_LIMITS, projectBudget } from '../core/economy.js';
import { LAWS } from '../core/laws.js';
import { TECHNOLOGIES } from '../core/technology.js';
import { MILITARY_TECHNOLOGIES } from '../core/tech_tree.js';
import { calculateMilitaryMaintenance } from '../core/military.js';
import { calculateInternalMaintenance } from '../core/infrastructure.js';
import { MINISTERS } from '../core/ministers.js';
import { getFactionSupport } from '../core/factions.js';
import { canPromulgarConstituicao } from '../core/constitution.js';
import { RESOLUTIONS } from '../core/un_assembly.js';
import { getStoryEvent } from '../core/story_engine.js';
import { LORE_CHAPTERS, STORY_NOTICE } from '../core/story_lore.js';
import { INTERNAL_PROJECTS } from '../core/infrastructure.js';
import { renderMap, selectMapCountry } from '../core/map_engine.js';
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

export function warRoomView(state) {
  const selectedId = state.ui?.selectedMapCountryId ?? state.country.id;
  const selected = selectedId === state.country.id
    ? state.country
    : state.geopolitics.contacts.find((contact) => contact.id === selectedId) ?? createCountryProfile(getCountryById(selectedId) ?? state.country);
  const selectedRelation = selected.id === state.country.id ? null : selected.relation;
  const selectedStatus = selected.id === state.country.id
    ? 'Nacao natal'
    : selected.anexado || selected.destruido
      ? 'Territorio neutralizado'
      : selected.atWar
        ? 'Teatro de guerra ativo'
        : selectedRelation > 50
          ? 'Relacao favoravel'
          : selectedRelation < 20
            ? 'Tensao diplomatica'
            : 'Relacao estavel';
  const mapCountry = (id, label, path) => `<path id="${id}" data-map-country="" d="${path}" class="map-country" data-action="map-country" data-country="${id}" role="button" tabindex="0" aria-label="Selecionar ${label}"></path>`;

  return `<section class="panel war-room-panel">
    <div class="panel-heading"><div><p class="eyebrow">/// SALA DE GUERRA ///</p><h2>Mapa Global</h2></div><span class="country-code">${state.is_wasteland ? 'MUNDO EM CINZAS' : 'MAPA OPERACIONAL'}</span></div>
    <p class="notice">Os IDs dos polígonos SVG devem corresponder exatamente aos IDs de <code>state.world</code>. Neste banco, eles são minúsculos: <code>usa</code>, <code>rus</code>, <code>bra</code> e <code>chn</code>.</p>
    <div class="map-layout">
      <svg class="world-map war-map" data-war-map viewBox="0 0 800 360" role="img" aria-label="Mapa mundial operacional">
        <path class="map-ocean" d="M0 0H800V360H0Z"></path>
        ${mapCountry('usa', 'Estados Unidos', 'M105 92h126l35 32-23 48-98 6-46-38z')}
        ${mapCountry('bra', 'Brasil', 'M270 191l71-12 47 48-19 84-65 7-44-61z')}
        ${mapCountry('rus', 'Rússia', 'M420 64h235l65 35-38 47-174-2-88-39z')}
        ${mapCountry('chn', 'China', 'M570 164l93-6 56 43-37 62-92 3-42-55z')}
        <circle class="radiation-marker" data-radiation-marker cx="702" cy="280" r="9" hidden></circle>
        <circle class="vault-marker" data-vault-marker cx="312" cy="245" r="7" hidden></circle>
        <text x="142" y="132">EUA</text><text x="312" y="245">BR</text><text x="545" y="105">RÚSSIA</text><text x="615" y="214">CHINA</text>
      </svg>
      <aside class="map-selection">
        <p class="eyebrow">Nação selecionada</p>
        <h3>${escapeHtml(selected.name ?? selected.nome ?? selected.id)} ${nuclearBadge(selected)}</h3>
        <div class="ledger-row"><span>Status</span><strong>${selectedStatus}</strong></div>
        <div class="ledger-row"><span>Área</span><strong>${formatNumber.format(selected.area_km2 ?? 0)} km²</strong></div>
        <div class="ledger-row"><span>População</span><strong>${formatNumber.format(selected.population ?? selected.populacao_base ?? 0)}</strong></div>
        ${selectedRelation === null ? '<p class="notice">Clique numa nação para abrir a sua ficha diplomática.</p>' : `<div class="ledger-row"><span>Relação</span><strong>${formatRelation(selectedRelation)}</strong></div><button type="button" class="primary-action" data-action="open-diplomacy" data-country="${selected.id}">Abrir diplomacia</button>`}
      </aside>
    </div>
    <p class="map-legend"><span class="legend-player">Nação natal</span><span class="legend-ally">Aliança</span><span class="legend-war">Guerra</span><span class="legend-tense">Tensão</span><span class="legend-nuclear">Ameaça nuclear</span></p>
  </section>`;
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
  if (!story) return '';
  return `<section class="story-dialog" role="dialog" aria-modal="true" aria-labelledby="story-title">
    <p class="story-classification">/// DOSSIÊ CONFIDENCIAL // NÍVEL ÔMEGA ///</p>
    <h2 id="story-title">${escapeHtml(story.title)}</h2>
    <p class="story-typewriter">${escapeHtml(story.text)}</p>
    <button type="button" class="arcade-vote-yes story-dismiss" data-action="dismiss-story">${escapeHtml(story.button_label)}</button>
  </section>`;
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
  const congressLawTitle = document.getElementById('congresso-lei-titulo');
  const congressLawDescription = document.getElementById('congresso-lei-descricao');
  let pendingCongressLawId = null;
  let pendingNukeTargetId = null;
  let falloutCinematicStarted = false;

  function render() {
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
      ['war-room', '> SALA DE GUERRA (MAPA GLOBAL)'],
      ['military', 'Forcas Armadas'],
      ['cabinet', 'Gabinete'],
      ['technology', 'Tecnologia'],
      ['projects', 'Projetos Internos'],
      ['congress', 'Congresso'],
      ['history', '> MODO HISTÓRIA'],
      ['countries', 'Paises'],
    ];
    const content = activeTab === 'budget' ? budgetView(state, projection)
      : activeTab === 'diplomacy' ? diplomacyView(state, diplomacyQuery)
        : activeTab === 'war-room' ? warRoomView(state)
        : activeTab === 'military' ? militaryView(state)
          : activeTab === 'cabinet' ? cabinetView(state)
          : activeTab === 'technology' ? technologyView(state)
            : activeTab === 'projects' ? projectsView(state)
      : activeTab === 'congress' ? congressView(state)
        : activeTab === 'history' ? storyModeView(state)
        : activeTab === 'countries' ? countriesView(state)
          : overviewView(state, projection);
    root.innerHTML = `<div class="app-shell">
      <aside class="sidebar"><div class="brand"><span class="brand-mark">SP</span><div><strong>Simulador</strong><small>de Presidente</small></div></div><nav class="tab-list" aria-label="Navegacao principal">${tabs.map(([id, label]) => `<button type="button" class="tab-button ${activeTab === id ? 'active' : ''}" data-action="tab" data-tab="${id}">${label}</button>`).join('')}</nav><div class="sidebar-footer"><span>Mandato em curso</span><strong>${state.calendar.year}</strong></div></aside>
      <section class="workspace"><header class="topbar"><div><p class="eyebrow">${state.title ?? 'Presidente'}</p><h1>${state.is_wasteland ? 'ANO ZERO POS-BOMBA' : `${MONTHS[state.calendar.month - 1]} de ${state.calendar.year}`}</h1></div><div class="topbar-actions"><label class="country-picker"><span>Pais</span><select data-action="select-country" aria-label="Selecionar pais">${COUNTRIES.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map((country) => `<option value="${country.id}" ${country.id === state.country.id ? 'selected' : ''}>${country.nome}</option>`).join('')}</select></label><button type="button" class="quiet-action" data-action="reset">Reiniciar</button></div></header>
      <section class="metrics">${metric('PIB', formatMoney(state.economy.gdp))}${metric('Inflacao', formatPercent(state.economy.inflation), state.economy.inflation > 0.1 ? 'negative' : '')}${metric('Desemprego', formatPercent(state.economy.unemployment))}${metric('Apoio interno', `${getFactionSupport(state.factions).toFixed(0)}%`, getFactionSupport(state.factions) >= 55 ? 'positive' : '')}${metric('Caixa nacional', formatMoney(state.economy.cash))}${metric('DEFCON', `DEFCON: ${state.global_defcon}`, `defcon-${state.global_defcon}`)}${metric('Saldo projetado', formatMoney(projection.monthlyBalance), projection.monthlyBalance >= 0 ? 'positive' : 'negative')}</section>
      ${storageNotice ? `<p class="storage-notice">${storageNotice}</p>` : ''}
      ${state.notice === STORY_NOTICE ? `<p class="storage-notice story-notification" role="status">${STORY_NOTICE}</p>` : ''}
      <section class="content-area">${content}</section>${renderNews(state)}
    </section></div>`;
    const map = root.querySelector('[data-war-map]');
    if (map) renderMap(state, map);
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
    if (event.target.closest('[data-action="dismiss-story"]')) commit(dispensarHistoria(state));
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

  root.addEventListener('click', (event) => {
    const control = event.target.closest('[data-action]');
    if (!control || control.disabled) return;
    const { action } = control.dataset;
    if (action === 'tab') { activeTab = control.dataset.tab; render(); return; }
    if (action === 'map-country') { if (state.is_wasteland) return; activeTab = 'diplomacy'; state = selectMapCountry(state, control.dataset.country); render(); return; }
    if (action === 'open-diplomacy') { activeTab = 'diplomacy'; state = selectMapCountry(state, control.dataset.country); render(); return; }
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
