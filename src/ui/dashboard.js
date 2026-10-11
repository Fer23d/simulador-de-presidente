import { COUNTRIES } from '../data/countries.js';
import { getVoteForecast } from '../core/congress.js';
import { BUDGET_LIMITS, projectBudget } from '../core/economy.js';
import {
  advanceMonth,
  attemptAutogolpe,
  changeTax,
  createGameState,
  fundNuclear,
  hydrateGameState,
  negotiate,
  proposeAlliance,
  proposeTreaty,
  setBudget,
  startWar,
  voteLaborLaw,
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
  const approved = state.laws.laborReform.approved;
  const completed = state.laws.laborReform.voteCompleted;
  return `<section class="view-grid congress-grid">
    <section class="panel bill-panel">
      <div class="panel-heading"><div><p class="eyebrow">Projeto de lei</p><h2>Lei Trabalhista</h2></div><span class="bill-state ${approved ? 'approved' : completed ? 'rejected' : ''}">${approved ? 'Aprovada' : completed ? 'Rejeitada' : 'Em pauta'}</span></div>
      <p class="notice">Amplia qualificacao profissional e atualiza garantias de trabalho.</p>
      <div class="vote-meter"><div class="meter-track"><span style="width:${percentage((forecast.votesFor / forecast.requiredVotes) * 100)}%"></span></div><strong>${forecast.votesFor} / ${forecast.requiredVotes} votos</strong></div>
      <button type="button" class="primary-action" data-action="vote" ${completed ? 'disabled' : ''}>${completed ? 'Votacao encerrada' : 'Levar a votacao'} <span aria-hidden="true">→</span></button>
    </section>
    <section class="panel bloc-panel">
      <div class="panel-heading"><div><p class="eyebrow">Bancadas</p><h2>Articulacao</h2></div></div>
      <div class="bloc-list">${state.congress.blocs.map((bloc) => `<article class="bloc-row"><div><strong>${bloc.label}</strong><span>${bloc.seats} assentos</span></div><button type="button" class="quiet-action" data-action="negotiate" data-bloc="${bloc.id}" ${bloc.negotiated ? 'disabled' : ''}>${bloc.negotiated ? 'Apoio obtido' : `Negociar ${formatMoney(bloc.negotiationCost)}`}</button></article>`).join('')}</div>
    </section>
  </section>`;
}

function diplomacyView(state) {
  return `<section class="panel"><div class="panel-heading"><div><p class="eyebrow">Painel mundial</p><h2>Diplomacia</h2></div><span class="country-code">${formatPercent(state.geopolitics.sanctionSeverity, 0)} sancoes</span></div><div class="bloc-list">${state.geopolitics.contacts.map((contact) => `<article class="bloc-row"><div><strong>${contact.name}</strong><span>Relacao ${formatRelation(contact.relation)} | ${contact.atWar ? 'Em guerra' : contact.alliance ? 'Aliado' : contact.tradeTreaty ? 'Acordo comercial' : 'Sem tratado'}</span></div><div class="action-row"><button type="button" class="quiet-action" data-action="treaty" data-contact="${contact.id}" ${contact.tradeTreaty || contact.atWar || contact.relation <= 20 ? 'disabled' : ''}>Comercio</button><button type="button" class="quiet-action" data-action="alliance" data-contact="${contact.id}" ${contact.alliance || contact.atWar || !contact.tradeTreaty || contact.relation <= 45 ? 'disabled' : ''}>Alianca</button><button type="button" class="quiet-action danger-action" data-action="war" data-contact="${contact.id}" ${contact.atWar ? 'disabled' : ''}>Guerra</button></div></article>`).join('')}</div></section>`;
}

function militaryView(state) {
  const nuclear = state.military.nuclear;
  const canCoup = state.regime.type === 'democracy' && state.military.support >= 85 && state.budget.defenseSpend >= 0.06;
  return `<section class="view-grid budget-grid"><section class="panel"><p class="eyebrow">Forcas Armadas</p><h2>Poder ${state.military.power.toFixed(0)}</h2><div class="ledger-row"><span>Apoio militar</span><strong>${state.military.support.toFixed(0)}%</strong></div><div class="ledger-row"><span>Risco institucional</span><strong>${formatPercent(state.regime.type === 'dictatorship' ? state.regime.revolutionRisk : state.regime.coupRisk, 0)}</strong></div><button type="button" class="quiet-action danger-action" data-action="coup" ${canCoup ? '' : 'disabled'}>Decretar estado de sitio</button></section><section class="panel"><p class="eyebrow">Programa nuclear</p><h2>Projetos especiais</h2><div class="ledger-row"><span>Energia civil</span><strong>${nuclear.civilProgress.toFixed(0)}%</strong></div><div class="ledger-row"><span>Dissuasao militar</span><strong>${nuclear.militaryProgress.toFixed(0)}%</strong></div><div class="action-row"><button type="button" class="quiet-action" data-action="nuclear" data-kind="civil" data-amount="5000000000">Energia 5 bi</button><button type="button" class="quiet-action" data-action="nuclear" data-kind="military" data-amount="5000000000">Dissuasao 5 bi</button></div></section></section>`;
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
      ['congress', 'Congresso'],
      ['countries', 'Paises'],
    ];
    const content = activeTab === 'budget' ? budgetView(state, projection)
      : activeTab === 'diplomacy' ? diplomacyView(state)
        : activeTab === 'military' ? militaryView(state)
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
    if (action === 'tax') { commit(changeTax(state, control.dataset.tax, Number(control.dataset.delta))); return; }
    if (action === 'treaty') { commit(proposeTreaty(state, control.dataset.contact)); return; }
    if (action === 'alliance') { commit(proposeAlliance(state, control.dataset.contact)); return; }
    if (action === 'war') { commit(startWar(state, control.dataset.contact)); return; }
    if (action === 'nuclear') { commit(fundNuclear(state, control.dataset.kind, Number(control.dataset.amount))); return; }
    if (action === 'coup') { commit(attemptAutogolpe(state)); return; }
    if (action === 'negotiate') { commit(negotiate(state, control.dataset.bloc)); return; }
    if (action === 'vote') { commit(voteLaborLaw(state)); return; }
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
