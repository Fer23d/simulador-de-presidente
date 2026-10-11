import { COUNTRIES, createCountryProfile, getCountryById } from '../data/countries.js';
import { getVoteForecast } from '../core/congress.js';
import { BUDGET_LIMITS, projectBudget } from '../core/economy.js';
import { LAWS } from '../core/laws.js';
import { TECHNOLOGIES } from '../core/technology.js';
import {
  advanceMonth,
  comprarBlindado,
  comprarCaca,
  comprarMaterialMilitar,
  comprarNavio,
  attemptAutogolpe,
  changeTax,
  createGameState,
  fundNuclear,
  exigirAnexacao,
  hydrateGameState,
  negotiate,
  proposeAlliance,
  proposeTreaty,
  researchTechnology,
  recrutarSoldado,
  imporSancao,
  lancarAtaqueNuclear,
  sabotar,
  setBudget,
  startWar,
  voteLaborLaw,
  voteLaw,
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
  return `<section class="view-grid overview-grid">
    <section class="panel agenda-panel">
      <div class="panel-heading"><div><p class="eyebrow">Agenda presidencial</p><h2>Proximo movimento</h2></div><span class="status-dot"></span></div>
      <p class="notice">${state.notice}</p>
      <div class="agenda-stats">
        <div><span>Saldo mensal</span><strong class="${budgetTone}">${formatMoney(projection.monthlyBalance)}</strong></div>
        <div><span>Maioria exigida</span><strong>${Math.floor(state.congress.totalSeats / 2) + 1} votos</strong></div>
        <div><span>Lei Trabalhista</span><strong>${state.laws.laborReform.approved ? 'Aprovada' : state.laws.laborReform.voteCompleted ? 'Rejeitada' : 'Pendente'}</strong></div>
      </div>
      <button type="button" class="primary-action" data-action="advance">Avancar mes <span aria-hidden="true">→</span></button>
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

function budgetView(state, projection) {
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
    </section>
  </section>`;
}

function congressView(state) {
  if (state.regime.type === 'dictatorship') return `<section class="panel"><p class="eyebrow">Instituicoes</p><h2>Congresso suspenso</h2><p class="notice">Leis sao aprovadas por decreto enquanto durar o estado de sitio.</p></section>`;
  const forecast = getVoteForecast({
    ...state.congress,
    blocs: state.congress.blocs.map((bloc) => ({
      ...bloc,
      support: bloc.baseSupport ? Math.min(1, 0.01 + (bloc.id === 'left' ? 0.82 : bloc.id === 'center' ? 0.58 : bloc.id === 'right' ? 0.28 : 0.36) + bloc.support) : bloc.support,
    })),
  }, state.economy.popularity);
  return `<section class="view-grid congress-grid">
    <section class="panel bill-panel"><div class="panel-heading"><div><p class="eyebrow">Projetos de lei</p><h2>Pauta do Congresso</h2></div></div><div class="law-list">${LAWS.map((law) => { const lawState = state.laws[law.stateKey]; const approved = lawState.approved; const completed = lawState.voteCompleted; return `<article class="law-row"><div><strong>${law.title}</strong><span>${law.description}</span></div><span class="bill-state ${approved ? 'approved' : completed ? 'rejected' : ''}">${approved ? 'Aprovada' : completed ? 'Rejeitada' : 'Em pauta'}</span><button type="button" class="quiet-action" data-action="vote-law" data-law="${law.id}" ${completed ? 'disabled' : ''}>${completed ? 'Encerrada' : 'Votar'}</button></article>`; }).join('')}</div><div class="vote-meter"><div class="meter-track"><span style="width:${percentage((forecast.votesFor / forecast.requiredVotes) * 100)}%"></span></div><strong>${forecast.votesFor} / ${forecast.requiredVotes} votos estimados</strong></div></section>
    <section class="panel bloc-panel">
      <div class="panel-heading"><div><p class="eyebrow">Bancadas</p><h2>Articulacao</h2></div></div>
      <div class="bloc-list">${state.congress.blocs.map((bloc) => `<article class="bloc-row"><div><strong>${bloc.label}</strong><span>${bloc.seats} assentos</span></div><button type="button" class="quiet-action" data-action="negotiate" data-bloc="${bloc.id}" ${bloc.negotiated ? 'disabled' : ''}>${bloc.negotiated ? 'Apoio obtido' : `Negociar ${formatMoney(bloc.negotiationCost)}`}</button></article>`).join('')}</div>
    </section>
  </section>`;
}

function legacyDiplomacyView(state) {
  const onuTone = state.geopolitics.onuScore < 25 ? 'negative' : state.geopolitics.onuScore >= 60 ? 'positive' : '';
  const selectedId = state.ui?.selectedMapCountryId ?? state.country.id;
  const selected = createCountryProfile(getCountryById(selectedId) ?? getCountryById(state.country.id));
  const annexed = new Set(state.geopolitics.annexedCountryIds ?? []);
  const mapCountry = (id, label, path) => `<path d="${path}" class="map-country ${selected.id === id ? 'selected' : ''} ${annexed.has(id) ? 'annexed' : ''}" ${annexed.has(id) ? '' : `data-action="map-country" data-country="${id}" role="button" tabindex="0" aria-label="Selecionar ${label}"`}></path>`;
  return `<section class="panel"><div class="panel-heading"><div><p class="eyebrow">Painel mundial</p><h2>Diplomacia e Mapa</h2></div><span class="country-code ${onuTone}">ONU ${state.geopolitics.onuScore}/100</span></div><div class="onu-meter"><div><span>Reputacao global</span><strong class="${onuTone}">${state.geopolitics.internationalSanctions ? 'Sancoes internacionais ativas' : 'Sem sancoes internacionais'}</strong></div><div class="meter-track"><span style="width:${state.geopolitics.onuScore}%"></span></div></div><div class="map-layout"><svg class="world-map" viewBox="0 0 800 360" aria-label="Mapa mundial simplificado de teste"><path class="map-ocean" d="M0 0H800V360H0Z"></path>${mapCountry('usa', 'Estados Unidos', 'M105 92h126l35 32-23 48-98 6-46-38z')}${mapCountry('bra', 'Brasil', 'M270 191l71-12 47 48-19 84-65 7-44-61z')}${mapCountry('rus', 'Rússia', 'M420 64h235l65 35-38 47-174-2-88-39z')}${mapCountry('chn', 'China', 'M570 164l93-6 56 43-37 62-92 3-42-55z')}<text x="142" y="132">EUA</text><text x="312" y="245">BR</text><text x="545" y="105">RÚSSIA</text><text x="615" y="214">CHINA</text></svg><aside class="map-selection"><p class="eyebrow">Nacao selecionada</p><h3>${selected.nome}</h3><div class="ledger-row"><span>Area</span><strong>${formatNumber.format(selected.area_km2)} km²</strong></div><div class="ledger-row"><span>Populacao</span><strong>${formatNumber.format(selected.populacao_base)}</strong></div><div class="ledger-row"><span>Governo</span><strong>${selected.tipo_governo}</strong></div></aside></div><div class="bloc-list">${state.geopolitics.contacts.map((contact) => `<article class="bloc-row ${contact.anexado ? 'annexed-contact' : ''}"><div><strong>${contact.name}</strong><span>${contact.anexado ? 'Territorio anexado' : `Relacao ${formatRelation(contact.relation)} | Poder ${contact.militaryPower.toFixed(0)} | ${contact.atWar ? 'Em guerra' : contact.alliance ? 'Aliado' : contact.tradeTreaty ? 'Acordo comercial' : 'Sem tratado'}`}</span></div><div class="action-row"><button type="button" class="quiet-action" data-action="treaty" data-contact="${contact.id}" ${contact.anexado || contact.tradeTreaty || contact.atWar || contact.relation <= 20 ? 'disabled' : ''}>Comercio</button><button type="button" class="quiet-action" data-action="alliance" data-contact="${contact.id}" ${contact.anexado || contact.alliance || contact.atWar || !contact.tradeTreaty || contact.relation <= 45 ? 'disabled' : ''}>Alianca</button><button type="button" class="quiet-action" data-action="sabotage" data-contact="${contact.id}" ${contact.anexado || contact.atWar ? 'disabled' : ''}>Sabotar</button><button type="button" class="quiet-action danger-action" data-action="war" data-contact="${contact.id}" ${contact.anexado || contact.atWar ? 'disabled' : ''}>Guerra</button></div></article>`).join('')}</div></section>`;
}

function diplomacyView(state) {
  const onuTone = state.geopolitics.onuScore < 25 ? 'negative' : state.geopolitics.onuScore >= 60 ? 'positive' : '';
  const arsenal = Math.max(0, Number(state.military.armasNucleares) || 0);
  return `<section class="panel"><div class="panel-heading"><div><p class="eyebrow">Painel mundial</p><h2>Diplomacia de risco</h2></div><span class="country-code ${onuTone}">ONU ${state.geopolitics.onuScore}/100</span></div><div class="onu-meter"><div><span>Reputacao global</span><strong class="${onuTone}">${state.geopolitics.internationalSanctions ? 'Sancoes internacionais ativas' : 'Sem sancoes internacionais'}</strong></div><div class="meter-track"><span style="width:${state.geopolitics.onuScore}%"></span></div></div><div class="bloc-list">${state.geopolitics.contacts.map((contact) => { const nuclearReady = contact.atWar && arsenal > 0 && !contact.anexado; return `<article class="bloc-row ${contact.anexado ? 'annexed-contact' : ''}"><div><strong>${contact.name}</strong><span>${contact.anexado ? 'Territorio anexado' : `Relacao ${formatRelation(contact.relation)} | Poder ${Number(contact.militaryPower).toFixed(0)} | Populacao ${formatNumber.format(contact.population || 0)}${contact.sancionado_por_jogador ? ' | Sancionado' : ''}`}</span></div><div class="action-row"><button type="button" class="quiet-action" data-action="treaty" data-contact="${contact.id}" ${contact.anexado || contact.tradeTreaty || contact.atWar || contact.relation <= 20 ? 'disabled' : ''}>Comercio</button><button type="button" class="quiet-action" data-action="alliance" data-contact="${contact.id}" ${contact.anexado || contact.alliance || contact.atWar || !contact.tradeTreaty || contact.relation <= 45 ? 'disabled' : ''}>Alianca</button><button type="button" class="quiet-action" data-action="sanction" data-contact="${contact.id}" ${contact.anexado || contact.sancionado_por_jogador ? 'disabled' : ''}>Impor sancao</button><button type="button" class="quiet-action" data-action="ultimatum" data-contact="${contact.id}" ${contact.anexado ? 'disabled' : ''}>Exigir anexacao</button><button type="button" class="quiet-action danger-action" data-action="war" data-contact="${contact.id}" ${contact.anexado || contact.atWar ? 'disabled' : ''}>Guerra</button>${nuclearReady ? `<button type="button" class="quiet-action nuclear-action" data-action="nuclear-strike" data-contact="${contact.id}">Ataque nuclear</button>` : ''}</div></article>`; }).join('')}</div></section>`;
}

function legacyMilitaryView(state) {
  const military = { soldiers: 0, equipmentMultiplier: 1, nuclear: {}, ...state.military };
  const nuclear = { civilProgress: 0, militaryProgress: 0, ...military.nuclear };
  const canCoup = state.regime.type === 'democracy' && military.support >= 85 && state.budget.defenseSpend >= 0.06;
  return `<section class="view-grid budget-grid"><section class="panel"><p class="eyebrow">Forcas Armadas</p><h2>Poder ${Number(military.power || 0).toFixed(0)}</h2><p class="notice">${state.notice}</p><div class="ledger-row"><span>Soldados</span><strong>${formatNumber.format(military.soldiers)}</strong></div><div class="ledger-row"><span>Equipamento</span><strong>x${Number(military.equipmentMultiplier).toFixed(2)}</strong></div><div class="ledger-row"><span>Apoio militar</span><strong>${Number(military.support || 0).toFixed(0)}%</strong></div><div class="action-row"><button type="button" class="quiet-action" data-action="recruit">Recrutar Soldados</button><button type="button" class="quiet-action" data-action="equipment" data-kind="tanks">Comprar Blindados</button><button type="button" class="quiet-action" data-action="equipment" data-kind="jets">Comprar Cacas</button></div><button type="button" class="quiet-action danger-action" data-action="coup" ${canCoup ? '' : 'disabled'}>Decretar estado de sitio</button></section><section class="panel"><p class="eyebrow">Programa nuclear</p><h2>Projetos especiais</h2><div class="ledger-row"><span>Energia civil</span><strong>${Number(nuclear.civilProgress).toFixed(0)}%</strong></div><div class="ledger-row"><span>Dissuasao militar</span><strong>${Number(nuclear.militaryProgress).toFixed(0)}%</strong></div><div class="action-row"><button type="button" class="quiet-action" data-action="nuclear" data-kind="civil" data-amount="5000000000">Energia 5 bi</button><button type="button" class="quiet-action" data-action="nuclear" data-kind="military" data-amount="5000000000">Dissuasao 5 bi</button></div></section></section>`;
}

function militaryView(state) {
  const military = state.military;
  const exercito = military.exercito ?? { soldados: military.soldiers ?? 0, blindados: 0 };
  const marinha = military.marinha ?? { navios: 0 };
  const aeronautica = military.aeronautica ?? { cacas: 0 };
  const nuclear = military.nuclear ?? {};
  const canCoup = state.regime.type === 'democracy' && military.support >= 85 && state.budget.defenseSpend >= 0.06;
  return `<section class="view-grid budget-grid"><section class="panel"><p class="eyebrow">Tríade militar</p><h2>Poder total ${Number(military.power || 0).toFixed(1)}</h2><p class="notice">${state.notice}</p><div class="branch-list"><article class="branch-row"><div><strong>Exercito</strong><span>${formatNumber.format(exercito.soldados)} soldados | ${formatNumber.format(exercito.blindados)} blindados</span></div><div class="action-row"><button type="button" class="quiet-action" data-action="recruit">Recrutar soldados</button><button type="button" class="quiet-action" data-action="buy-tank">Comprar blindado</button></div></article><article class="branch-row"><div><strong>Marinha</strong><span>${formatNumber.format(marinha.navios)} navios operacionais</span></div><button type="button" class="quiet-action" data-action="buy-ship">Comprar navio</button></article><article class="branch-row"><div><strong>Aeronautica</strong><span>${formatNumber.format(aeronautica.cacas)} cacas operacionais</span></div><button type="button" class="quiet-action" data-action="buy-jet">Comprar caca</button></article></div><div class="ledger-row"><span>Apoio militar</span><strong>${Number(military.support || 0).toFixed(0)}%</strong></div><button type="button" class="quiet-action danger-action" data-action="coup" ${canCoup ? '' : 'disabled'}>Decretar estado de sitio</button></section><section class="panel"><p class="eyebrow">Arsenal estrategico</p><h2>Programa nuclear</h2><div class="ledger-row"><span>Energia civil</span><strong>${Number(nuclear.civilProgress || 0).toFixed(0)}%</strong></div><div class="ledger-row"><span>Dissuasao militar</span><strong>${Number(nuclear.militaryProgress || 0).toFixed(0)}%</strong></div><div class="ledger-row"><span>Armas nucleares</span><strong>${Number(military.armasNucleares || 0)}</strong></div><div class="action-row"><button type="button" class="quiet-action" data-action="nuclear" data-kind="civil" data-amount="5000000000">Energia 5 bi</button><button type="button" class="quiet-action" data-action="nuclear" data-kind="military" data-amount="5000000000">Dissuasao 5 bi</button></div></section></section>`;
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

export function mountDashboard(root) {
  if (!root) {
    throw new Error('Elemento raiz do dashboard nao encontrado.');
  }
  let state = loadState();
  let activeTab = 'overview';
  let storageNotice = '';

  function render() {
    const projection = projectBudget(state.economy, state.budget);
    const tabs = [
      ['overview', 'Visao geral'],
      ['budget', 'Orcamento'],
      ['diplomacy', 'Diplomacia'],
      ['military', 'Forcas Armadas'],
      ['technology', 'Tecnologia'],
      ['congress', 'Congresso'],
      ['countries', 'Paises'],
    ];
    const content = activeTab === 'budget' ? budgetView(state, projection)
      : activeTab === 'diplomacy' ? diplomacyView(state)
        : activeTab === 'military' ? militaryView(state)
          : activeTab === 'technology' ? technologyView(state)
      : activeTab === 'congress' ? congressView(state)
        : activeTab === 'countries' ? countriesView(state)
          : overviewView(state, projection);
    root.innerHTML = `<div class="app-shell">
      <aside class="sidebar"><div class="brand"><span class="brand-mark">SP</span><div><strong>Simulador</strong><small>de Presidente</small></div></div><nav class="tab-list" aria-label="Navegacao principal">${tabs.map(([id, label]) => `<button type="button" class="tab-button ${activeTab === id ? 'active' : ''}" data-action="tab" data-tab="${id}">${label}</button>`).join('')}</nav><div class="sidebar-footer"><span>Mandato em curso</span><strong>${state.calendar.year}</strong></div></aside>
      <section class="workspace"><header class="topbar"><div><p class="eyebrow">Mandato presidencial</p><h1>${MONTHS[state.calendar.month - 1]} de ${state.calendar.year}</h1></div><div class="topbar-actions"><label class="country-picker"><span>Pais</span><select data-action="select-country" aria-label="Selecionar pais">${COUNTRIES.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map((country) => `<option value="${country.id}" ${country.id === state.country.id ? 'selected' : ''}>${country.nome}</option>`).join('')}</select></label><button type="button" class="quiet-action" data-action="reset">Reiniciar</button></div></header>
      <section class="metrics">${metric('PIB', formatMoney(state.economy.gdp))}${metric('Inflacao', formatPercent(state.economy.inflation), state.economy.inflation > 0.1 ? 'negative' : '')}${metric('Desemprego', formatPercent(state.economy.unemployment))}${metric('Popularidade', `${state.economy.popularity.toFixed(0)}%`, state.economy.popularity >= 55 ? 'positive' : '')}${metric('Caixa nacional', formatMoney(state.economy.cash))}${metric('Saldo projetado', formatMoney(projection.monthlyBalance), projection.monthlyBalance >= 0 ? 'positive' : 'negative')}</section>
      ${storageNotice ? `<p class="storage-notice">${storageNotice}</p>` : ''}
      <section class="content-area">${content}</section>
    </section></div>`;
  }

  function commit(nextState) {
    state = nextState;
    storageNotice = saveState(state);
    render();
  }

  root.addEventListener('click', (event) => {
    const control = event.target.closest('[data-action]');
    if (!control || control.disabled) return;
    const { action } = control.dataset;
    if (action === 'tab') { activeTab = control.dataset.tab; render(); return; }
    if (action === 'map-country') { state = { ...state, ui: { ...state.ui, selectedMapCountryId: control.dataset.country } }; render(); return; }
    if (action === 'tax') { commit(changeTax(state, control.dataset.tax, Number(control.dataset.delta))); return; }
    if (action === 'treaty') { commit(proposeTreaty(state, control.dataset.contact)); return; }
    if (action === 'alliance') { commit(proposeAlliance(state, control.dataset.contact)); return; }
    if (action === 'war') { commit(startWar(state, control.dataset.contact)); return; }
    if (action === 'sabotage') { commit(sabotar(state, control.dataset.contact)); return; }
    if (action === 'sanction') { commit(imporSancao(state, control.dataset.contact)); return; }
    if (action === 'ultimatum') { commit(exigirAnexacao(state, control.dataset.contact)); return; }
    if (action === 'nuclear-strike') { commit(lancarAtaqueNuclear(state, control.dataset.contact)); return; }
    if (action === 'recruit') { commit(recrutarSoldado(state)); return; }
    if (action === 'equipment') { commit(comprarMaterialMilitar(state, control.dataset.kind)); return; }
    if (action === 'buy-tank') { commit(comprarBlindado(state)); return; }
    if (action === 'buy-ship') { commit(comprarNavio(state)); return; }
    if (action === 'buy-jet') { commit(comprarCaca(state)); return; }
    if (action === 'nuclear') { commit(fundNuclear(state, control.dataset.kind, Number(control.dataset.amount))); return; }
    if (action === 'coup') { commit(attemptAutogolpe(state)); return; }
    if (action === 'research') { commit(researchTechnology(state, control.dataset.technology)); return; }
    if (action === 'negotiate') { commit(negotiate(state, control.dataset.bloc)); return; }
    if (action === 'vote') { commit(voteLaborLaw(state)); return; }
    if (action === 'vote-law') { commit(voteLaw(state, control.dataset.law)); return; }
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

  render();
}
