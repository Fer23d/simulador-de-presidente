import { COUNTRY_PATHS, COUNTRY_POINTS, LAND_BACKGROUND, MAP_REGIONS } from '../data/world_map.js';
import { WAR_COUNTRY_COUNT } from '../data/war_countries.js';
import { BOT_DIFFICULTIES } from '../core/war_ai.js';
import { getBattleOdds } from '../core/war_odds.js';
import { modeSwitchRow } from './mode_switch_ui.js';
import { allCountries, canAttackTerritory, getAdjacentAttackOrigins, getAdjacentAttackTargets, getCompetitivePlayer, getCountryOwner, getCurrentMissionPlayer, getMissionProgress, getRegionLabel, territoryCounts } from '../core/mission_mode.js';

const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export const isWarPhase = (state) => !state?.city && !state?.is_wasteland;
const nameOf = (country) => country?.name ?? country?.nome ?? '';

const DIE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const percent = (value) => `${Math.round(value * 100)}%`;
const oneDecimal = (value) => value.toFixed(1).replace('.', ',');

// Probabilidades mostradas antes de atacar (e atualizadas ao mexer em tropas e dados).
export function battleOddsHtml(attacking, defending, fortified, diceCount) {
  if (!(attacking > 0)) return '<p class="war-fine">Envie ao menos 1 tropa para ver as chances.</p>';
  if (!(defending > 0)) return '<p><strong>Território sem defensores: conquista garantida.</strong></p>';
  const odds = getBattleOdds({ attacking, defending, fortified, diceCount });
  const tone = odds.win >= 0.65 ? 'is-good' : odds.win >= 0.4 ? 'is-even' : 'is-bad';
  const rounds = odds.round.map((item) => `<li>${item.attackerLosses ? `você perde ${item.attackerLosses}` : 'você não perde nada'} · ${item.defenderLosses ? `defesa perde ${item.defenderLosses}` : 'defesa não perde nada'} <b>${percent(item.p)}</b></li>`).join('');
  return `<p class="war-odds-main ${tone}"><strong>Chance de conquistar lutando até o fim: ${percent(odds.win)}</strong></p><p>Perda média: ${oneDecimal(odds.expectedAttackerLosses)} sua(s) · ${oneDecimal(odds.expectedDefenderLosses)} defensora(s)${odds.win > 0.005 ? ` · sobram cerca de ${oneDecimal(odds.expectedSurvivors)} se vencer` : ''}.</p><details class="war-odds-round"><summary>Esta rodada (${odds.dice} dado(s) de ataque${fortified ? ', defesa fortificada' : ''})</summary><ul>${rounds}</ul></details>`;
}

function diceChoice(name, selected = 3) {
  const buttons = [1, 2, 3].map((n) => `<button type="button" class="war-dice-pick${n === selected ? ' is-selected' : ''}" role="radio" aria-checked="${n === selected}" data-dice-pick="${n}" title="${n} dado${n > 1 ? 's' : ''} (tecla ${n})">${DIE_FACES.slice(1, n + 1).join('')}<small>${n} dado${n > 1 ? 's' : ''}${n === 3 ? ' (máx.)' : ''}</small></button>`).join('');
  return `<div class="war-field war-dice-field"><span>Dados de ataque <small>· atalhos 1, 2 e 3</small></span><div class="war-dice-picker" role="radiogroup" aria-label="Dados de ataque">${buttons}</div><input type="hidden" ${name} value="${selected}"></div><p class="war-fine">Menos dados arriscam menos tropas; mais dados causam mais baixas, nos dois lados.</p>`;
}

// Animacao mostrada enquanto os dados rolam: cada dado trava no seu valor real, um por vez.
function rollingView(roll) {
  if (!roll || typeof roll !== 'object') return '<div class="war-dice-rolling" role="status" aria-live="assertive"><span data-dice-faces>⚀　⚄　⚂</span><strong>OS DADOS ESTÃO ROLANDO…</strong></div>';
  const dice = (side, count) => Array.from({ length: count }, (_, i) => `<span class="war-die is-rolling" data-die-side="${side}" data-die-index="${i}">⚅</span>`).join('');
  return `<button type="button" class="war-dice-stage" data-action="war-skip-dice" role="status" aria-live="assertive" title="Clique para ver o resultado agora"><span class="war-stage-label">ATAQUE</span><div class="war-dice-side">${dice('attack', roll.attack)}</div><b>×</b><span class="war-stage-label">DEFESA</span><div class="war-dice-side war-die-defense">${dice('defense', roll.defense)}</div><strong>OS DADOS ESTÃO ROLANDO… <small>(clique para pular)</small></strong></button>`;
}

function battleChips(battle, mode) {
  const attacker = escape(getCompetitivePlayer(mode, battle.attackerId)?.name ?? 'Atacante');
  return `<div class="war-battle-chips"><span class="is-loss">${attacker} perdeu ${battle.attackerLosses ?? 0}</span><span class="is-win">Defesa perdeu ${battle.defenderLosses ?? 0}</span></div>`;
}

const HISTORY_ICONS = { info: '📜', battle: '🎲', conquest: '🚩', retreat: '↩️', reinforce: '➕', fortify: '🛡️', turn: '⏭️', timeout: '⏱️', eliminate: '💀', victory: '🏆' };
function historyView(mode, ui) {
  if (!mode?.active) return '';
  const items = (mode.history ?? []).slice(0, 40);
  const color = (id) => mode.players.find((player) => player.id === id)?.color ?? '#6f8a8f';
  const collapsed = ui.historyCollapsed === true;
  const rows = items.map((item) => `<li class="is-${item.type}" style="--command-color:${escape(color(item.playerId))}"><span class="war-history-turn">R${item.turn}</span><i></i><span>${HISTORY_ICONS[item.type] ?? ''} ${escape(item.text)}</span></li>`).join('');
  return `<section class="war-history" aria-label="Histórico de jogadas"><header><strong>Histórico de jogadas</strong><span>${(mode.history ?? []).length} registro(s)</span><button type="button" class="quiet-action" data-action="war-history-toggle" aria-expanded="${!collapsed}">${collapsed ? '[ + MOSTRAR ]' : '[ − OCULTAR ]'}</button></header>${collapsed ? '' : rows ? `<ol>${rows}</ol>` : '<p class="war-fine">Nenhuma jogada ainda.</p>'}</section>`;
}

// Cada dado de ataque disputa com um da defesa: o vencedor brilha e o perdedor esmaece.
function battleDiceHtml(battle) {
  const attack = battle.attackDice ?? [];
  const defense = battle.defenseDice ?? [];
  const pairs = Math.min(attack.length, defense.length);
  let order = 0;
  const die = (value, state, note = '') => `<span class="war-die-wrap"><span class="war-die ${state}" style="--i:${order++}">${DIE_FACES[value] ?? value}</span><small>${note || value}</small></span>`;
  const attackHtml = attack.map((value, i) => die(value, i < pairs ? (value > defense[i] ? 'is-win' : 'is-loss') : 'is-idle')).join('');
  const defenseHtml = defense.map((value, i) => die(value, i < pairs ? (attack[i] > value ? 'is-loss' : 'is-win') : 'is-idle', i === 0 && battle.fortifyFrom ? `${battle.fortifyFrom}+1` : '')).join('') || '<span class="war-die-wrap"><span class="war-die is-idle">—</span><small>sem tropas</small></span>';
  return `<div class="war-dice-pair war-dice-compare"><div class="war-dice-side" aria-label="Dados de ataque ${attack.join(', ')}">${attackHtml}</div><b>×</b><div class="war-dice-side war-die-defense" aria-label="Dados de defesa ${defense.join(', ') || 'nenhum'}">${defenseHtml}</div></div>`;
}

function setupView(state, ui) {
  const style = ui.setupMode ?? 'local';
  if (ui.online) return onlineView(ui.online);
  const chooser = `<label class="war-field">Como jogar<select data-war-style><option value="local" ${style === 'local' ? 'selected' : ''}>Neste dispositivo</option><option value="bots" ${style === 'bots' ? 'selected' : ''}>Contra IA</option><option value="online" ${style === 'online' ? 'selected' : ''}>Online por link</option></select></label>`;
  if (style === 'online') return `<section class="war-panel war-setup"><p class="eyebrow">SALA ONLINE · 2–6 PESSOAS</p><h2>Convide seus amigos.</h2>${chooser}<label class="war-field">Seu nome<input data-war-online-name maxlength="32" value="${escape(state.playerProfile?.name ?? '')}" placeholder="Seu nome"></label><button class="primary-action" data-action="war-online-create">CRIAR SALA E GERAR LINK</button><label class="war-field">Já tem um convite?<input data-war-invite placeholder="Cole o link da sala" type="url"></label><button class="quiet-action" data-action="war-online-join">ENTRAR COM LINK</button><p class="war-fine">Cada jogador usa seu dispositivo. O criador precisa manter esta aba aberta; a partida online dura enquanto a sala existir.</p>${ui.setupError ? `<p role="alert">${escape(ui.setupError)}</p>` : ''}</section>`;
  return `<section class="war-panel war-setup"><p class="eyebrow">02 — PREPARE A PARTIDA</p><h2>Cada jogador.<br>Uma missão secreta.</h2><p>${WAR_COUNTRY_COUNT} países. Quem cumprir seu objetivo primeiro vence.</p>${chooser}
    ${style === 'bots' ? `<label class="war-field">Dificuldade<select data-war-difficulty>${Object.entries(BOT_DIFFICULTIES).map(([id, item]) => `<option value="${id}" ${id === 'medium' ? 'selected' : ''}>${item.label} — ${item.description}</option>`).join('')}</select></label><p class="war-fine">Você enfrenta de 1 a 5 bots. Todos usam o mesmo dado e têm as mesmas chances de conquista.</p>` : ''}
    <label class="war-field">Jogadores <select data-war-count aria-label="Quantidade de jogadores">${[2, 3, 4, 5, 6].map((count) => `<option value="${count}">${count} jogadores</option>`).join('')}</select></label>
    <div class="war-names">${Array.from({ length: 6 }, (_, index) => `<label class="war-field" data-war-name-row="${index}" ${index > (style === 'bots' ? 0 : 1) ? 'hidden' : ''}>Jogador ${index + 1}<input data-war-name="${index}" maxlength="32" value="${index === 0 ? escape(state.playerProfile?.name ?? '') : style === 'bots' ? 'Bot ' + index : ''}" placeholder="Jogador ${index + 1}"></label>`).join('')}</div>
    <button type="button" class="primary-action" data-action="war-start">SORTEAR MISSÕES E COMEÇAR</button><p class="war-fine">Os territórios são distribuídos igualmente. A missão só aparece quando seu dono assume o turno.</p></section>`;
}

function onlineView(online) {
  const invite = online.status === 'invite';
  return `<section class="war-panel war-online"><p class="eyebrow">SALA ONLINE</p><h2>${invite ? 'Você foi convidado.' : online.status === 'connecting' ? 'Conectando…' : 'Seu esquadrão'}</h2>
    ${invite ? '<label class="war-field">Seu nome<input data-war-online-name maxlength="32" placeholder="Seu nome"></label><button class="primary-action" data-action="war-online-accept">ENTRAR NA SALA</button>' : ''}
    ${online.link ? `<label class="war-field">Link do convite<input data-war-share readonly value="${escape(online.link)}"></label><button class="quiet-action" data-action="war-online-copy">COPIAR LINK</button>` : ''}
    <ul class="war-score">${(online.members ?? []).map((member) => `<li><span>${escape(member.name)}${member.id === online.playerId ? ' (você)' : ''}</span><strong>${member.bot ? 'Bot joga por ele' : member.connected ? 'Conectado' : Number.isFinite(online.takeoverIn) ? `Ausente · bot assume em ${online.takeoverIn}s` : 'Ausente'}</strong></li>`).join('')}</ul>
    ${online.host && !online.started ? `<button class="primary-action" data-action="war-online-start" ${online.status !== 'connected' || online.members.length < 2 ? 'disabled' : ''}>INICIAR PARTIDA</button>` : ''}
    ${!online.host && online.status === 'connected' && !online.started ? '<p>Aguardando o criador iniciar a partida.</p>' : ''}
    ${online.error ? `<p class="war-network-error" role="alert">${escape(online.error)}</p>` : ''}
    ${online.status === 'error' && !online.host ? '<button class="primary-action" data-action="war-online-reconnect">RECONECTAR</button>' : ''}
    <button class="quiet-action" data-action="war-online-leave">SAIR DA SALA</button>
    <p class="war-fine">Mantenha a aba aberta. Sua partida local fica preservada. Use o site publicado para compartilhar o link entre dispositivos.</p></section>`;
}

function turnView(state, ui) {
  const mode = state.missionMode;
  const player = getCurrentMissionPlayer(state);
  const viewer = getCompetitivePlayer(mode, ui.online?.playerId ?? (mode.playStyle === 'bots' ? 'player-1' : player.id));
  const mayPlay = viewer?.id === player.id && !player.isBot && (!ui.online || (ui.online.status === 'connected' && !ui.online.paused && !ui.online.pending));
  const counts = territoryCounts(state);
  const selected = allCountries(state).find((country) => country.id === ui.selected);
  const owner = selected && getCompetitivePlayer(mode, getCountryOwner(state, selected.id));
  const allOrigins = selected ? getAdjacentAttackOrigins(state, selected.id, viewer?.id) : [];
  const chosenOrigin = allOrigins.find((country) => country.id === ui.attackSourceId);
  const origins = ui.attackSourceId ? (chosenOrigin ? [chosenOrigin] : []) : allOrigins;
  const sourceId = chosenOrigin?.id ?? (!ui.attackSourceId ? origins[0]?.id : undefined);
  const maxAttackTroops = Math.max(0, ...origins.map((country) => (Number(mode.troopsByCountry?.[country.id]) || 0) - 1));
  const attack = selected && sourceId && canAttackTerritory(state, selected.id, sourceId, 1);
  const chosenSource = ui.attackSourceId && viewer?.id === player.id && allCountries(state).find((country) => country.id === ui.attackSourceId);
  const chosenSourceTroops = Number(mode.troopsByCountry?.[chosenSource?.id]) || 0;
  const attackableTargets = chosenSource ? getAdjacentAttackTargets(state, chosenSource.id, viewer?.id) : [];
  const progress = getMissionProgress(state, viewer?.id);
  const missionVisible = ui.missionVisible && !mode.handoffRequired;
  const battle = mode.lastBattle;
  const battleCountry = battle && allCountries(state).find((country) => country.id === battle.targetId);
  const ongoingTarget = mode.activeBattle && allCountries(state).find((country) => country.id === mode.activeBattle.targetId);
  const winner = mode.finished && getCompetitivePlayer(mode, mode.winnerId);
  const stationed = Number(mode.troopsByCountry?.[selected?.id]) || 0;
  const isFortified = Boolean(mode.fortifiedCountries?.[selected?.id]);
  const deadlineMs = mode.turnDeadline ? Math.max(0, mode.turnDeadline - Date.now()) : null;
  if (winner) return `<section class="war-panel war-victory"><p class="eyebrow">MISSÃO CUMPRIDA</p><h2>${escape(winner.name)} venceu!</h2><p>${escape(winner.mission.description)}</p><p>Vitória na rodada ${mode.turnNumber}.</p><button type="button" class="primary-action" data-action="war-new">JOGAR NOVAMENTE</button>${modeSwitchRow(state)}</section>`;
  return `<section class="war-panel" style="--command-color:${escape(player.color)}"><p class="eyebrow">02 — TURNO ATUAL</p><h2>${escape(player.name)}</h2><div class="war-turn-clock" data-turn-deadline="${mode.turnDeadline ?? ''}" data-turn-limit="${mode.turnLimitSeconds}">${deadlineMs === null ? 'TEMPO: 60s' : `TEMPO: ${Math.ceil(deadlineMs / 1000)}s`}</div><p class="war-reinforcement-copy">Reforços nesta rodada: <strong>${mode.troopsPerTurn - mode.mobilizedThisTurn} / ${mode.troopsPerTurn}</strong> · colocados: ${mode.mobilizedThisTurn}</p><p class="war-turn-status">${player.isBot ? 'IA ' + BOT_DIFFICULTIES[mode.difficulty].label + ': planejando a ofensiva…' : !mayPlay ? 'Aguarde seu turno ou a reconexão dos jogadores.' : mode.actionUsed ? 'Você pode atacar novamente enquanto houver tropas e tempo.' : 'Selecione um território rival e escolha de onde sairá o ataque.'}</p>
    <button type="button" class="quiet-action war-secret-button" data-action="war-mission" aria-expanded="${Boolean(missionVisible)}">${missionVisible ? 'OCULTAR MISSÃO' : 'REVELAR MINHA MISSÃO'}</button>
    ${missionVisible ? `<div class="war-secret"><h3>${escape(viewer?.mission.title)}</h3><p>${escape(viewer?.mission.description)}</p><strong>${escape(progress.label)}</strong></div>` : '<p class="war-fine">Missão protegida. Revele apenas o seu objetivo.</p>'}
    ${chosenSource ? `<div class="war-source-panel"><p><strong>ORIGEM: ${escape(nameOf(chosenSource))}</strong> · ${chosenSourceTroops} tropa(s)</p><button type="button" class="quiet-action" data-action="war-source-clear">TROCAR ORIGEM</button><p>Vizinhos que você pode atacar:</p><div class="war-adjacent-targets">${attackableTargets.map((country) => `<button type="button" class="quiet-action" data-action="war-select-target" data-country="${escape(country.id)}">${escape(nameOf(country))} · ${Number(mode.troopsByCountry?.[country.id]) || 0} tropas</button>`).join('') || `<span>${chosenSourceTroops < 2 ? 'É preciso deixar ao menos 1 tropa na origem; mobilize reforços para poder atacar.' : 'Nenhum país rival faz fronteira com esta origem.'}</span>`}</div>${mayPlay && !mode.actionUsed && !mode.activeBattle ? `<div class="war-mobilize"><label class="war-field">Reforçar ${escape(nameOf(chosenSource))}<select data-war-troops>${Array.from({length:Math.max(0,mode.troopsPerTurn-mode.mobilizedThisTurn)},(_,i)=>`<option value="${i+1}">${i+1} tropa(s)</option>`).join('')}</select></label><button class="quiet-action" data-action="war-mobilize" data-country="${escape(chosenSource.id)}" ${mode.mobilizedThisTurn>=mode.troopsPerTurn?'disabled':''}>POSICIONAR REFORÇOS</button>${!mode.fortifiedCountries?.[chosenSource.id] ? `<button class="quiet-action" data-action="war-fortify" data-country="${escape(chosenSource.id)}" ${mode.mobilizedThisTurn+2>mode.troopsPerTurn?'disabled':''}>FORTIFICAR · 2 REFORÇOS</button>` : '<p>FORTIFICAÇÃO ATIVA · +1 DEFESA</p>'}</div>` : ''}</div>` : ''}
    <div class="war-target"><p class="eyebrow">TERRITÓRIO SELECIONADO</p><h3>${selected ? escape(nameOf(selected)) : 'Escolha seu alvo'}</h3><p>${owner ? `Comando: ${escape(owner.name)}` : 'Clique no mapa ou escolha um país na lista.'}</p>
      ${selected && origins.length && !chosenSource ? `<label class="war-field">Atacar a partir de<select data-war-source>${origins.map((country) => `<option value="${escape(country.id)}">${escape(nameOf(country))} · ${Number(mode.troopsByCountry[country.id])} tropas (deixe 1)</option>`).join('')}</select></label>` : ''}
      ${selected && sourceId && !mode.activeBattle ? `<label class="war-field">Tropas enviadas<input data-war-attack-troops type="number" min="1" max="${maxAttackTroops}" value="1" inputmode="numeric"></label>${diceChoice('data-war-attack-dice')}<div class="war-odds" data-war-odds data-mode="attack" data-defenders="${stationed}" data-fortified="${isFortified ? 1 : 0}">${battleOddsHtml(1, stationed, isFortified, 3)}</div>` : ''}
      <button type="button" class="primary-action" data-action="competitive-attack" data-contact="${escape(selected?.id)}" ${attack?.ok && mayPlay ? '' : 'disabled'}>ROLAR DADO E ATACAR</button>
      <p class="war-fine">${selected && ui.attackSourceId && !origins.length ? 'Esse território de origem não faz fronteira direta com o alvo escolhido.' : selected && !origins.length ? 'Nenhum território vizinho seu tem pelo menos 2 tropas. Reforce uma fronteira antes de atacar.' : selected && !attack?.ok ? escape(attack?.reason) : `Você escolhe quantas tropas enviar e deixa ao menos 1 na origem. Cada rodada rola até 3 dados de ataque e 2 de defesa; empate favorece a defesa. Fortificação soma +1 aos dados defensivos.`}</p>
      ${selected && getCountryOwner(state, selected.id) === viewer?.id && !mode.actionUsed && !player.isBot && (!ui.online || (ui.online.status === 'connected' && !ui.online.paused && !ui.online.pending)) ? `<div class="war-mobilize"><label class="war-field">Reforçar este território<select data-war-troops>${Array.from({length:Math.max(0,mode.troopsPerTurn-mode.mobilizedThisTurn)},(_,i)=>`<option value="${i+1}">${i+1} tropa(s)</option>`).join('')}</select></label><button class="quiet-action" data-action="war-mobilize" data-country="${escape(selected.id)}" ${mode.mobilizedThisTurn>=mode.troopsPerTurn?'disabled':''}>POSICIONAR REFORÇOS</button>${!isFortified ? `<button class="quiet-action" data-action="war-fortify" data-country="${escape(selected.id)}" ${mode.mobilizedThisTurn+2>mode.troopsPerTurn?'disabled':''}>FORTIFICAR · 2 REFORÇOS</button>` : '<p>FORTIFICAÇÃO ATIVA · +1 DEFESA</p>'}</div>` : ''}</div>
    ${ui.rolling ? rollingView(ui.rolling) : battle ? `<div class="war-battle" role="status">${battleDiceHtml(battle)}<div><strong>${battle.won ? 'Território conquistado' : battle.defeated ? 'Força atacante eliminada' : battle.retreated ? 'Ataque interrompido' : 'Rodada resolvida'}</strong><p>${escape(nameOf(allCountries(state).find((country) => country.id === battle.sourceId)))} → ${escape(nameOf(battleCountry))} · ataque ${battle.attackDice?.join(', ') ?? battle.roll} × defesa ${battle.defenseDice?.join(', ') || 'sem tropas'} · perdas: ${battle.attackerLosses ?? 0} suas / ${battle.defenderLosses ?? 0} defensoras · ${escape(getCompetitivePlayer(mode, battle.attackerId)?.name)}</p>${battleChips(battle, mode)}</div></div>` : ''}
    ${mode.activeBattle ? `<div class="war-battle-continuation"><p><strong>Batalha em andamento · ${escape(nameOf(ongoingTarget))}</strong></p><p>Suas tropas restantes: ${mode.activeBattle.attackingRemaining} · defensoras: ${mode.activeBattle.defendersRemaining}. Rodada ${mode.activeBattle.round}.</p><p>Escolha continuar a ofensiva ou recuar. Se o tempo acabar, as sobreviventes recuam automaticamente.</p>${diceChoice('data-war-continue-dice', mode.activeBattle.diceCount ?? 3)}<div class="war-odds" data-war-odds data-mode="continue" data-attacking="${mode.activeBattle.attackingRemaining}" data-defenders="${mode.activeBattle.defendersRemaining}" data-fortified="${mode.fortifiedCountries?.[mode.activeBattle.targetId] ? 1 : 0}">${battleOddsHtml(mode.activeBattle.attackingRemaining, mode.activeBattle.defendersRemaining, Boolean(mode.fortifiedCountries?.[mode.activeBattle.targetId]), mode.activeBattle.diceCount ?? 3)}</div><div class="action-row"><button type="button" class="primary-action" data-action="war-battle-continue" ${mayPlay ? '' : 'disabled'}>CONTINUAR BATALHA</button><button type="button" class="quiet-action" data-action="war-battle-retreat" ${mayPlay ? '' : 'disabled'}>RECUAR</button></div></div>` : ''}
    <button type="button" class="quiet-action war-end-turn" data-action="mission-mode-end-turn" ${mayPlay && !mode.activeBattle ? '' : 'disabled'}>${mode.actionUsed ? 'ENCERRAR TURNO →' : 'PASSAR A VEZ →'}</button>
    <ul class="war-score">${mode.players.map((item) => `<li style="--command-color:${escape(item.color)}" class="${item.id === player.id ? 'is-current' : ''}"><span><i></i>${escape(item.name)}</span><strong>${counts[item.id] || 'Eliminado'}</strong></li>`).join('')}</ul></section>`;
}

export function warScreenView(state, ui = {}) {
  const mode = state.missionMode;
  const countries = allCountries(state).filter((country) => COUNTRY_PATHS[country.id] || COUNTRY_POINTS[country.id]);
  const playableIds = new Set(countries.map((country) => country.id));
  const inactiveLand = Object.entries(COUNTRY_PATHS).filter(([id]) => !playableIds.has(id)).map(([, path]) => path).join(' ');
  const legacyNotice = mode?.active && countries.length > WAR_COUNTRY_COUNT
    ? `<p class="war-notice">Esta partida mantém seus ${countries.length} países e conquistas. Use NOVA PARTIDA para jogar no tabuleiro de ${WAR_COUNTRY_COUNT} países.</p>` : '';
  const region = MAP_REGIONS[ui.region] ? ui.region : 'world';
  const [bx, by, bw, bh] = MAP_REGIONS[region];
  const zoom = Math.min(8, Math.max(1, Number(ui.zoom) || 1));
  const width = Math.min(1000, bw / zoom), height = Math.min(500, bh / zoom);
  const x = Math.max(0, Math.min(1000 - width, (ui.cx ?? bx + bw / 2) - width / 2));
  const y = Math.max(0, Math.min(500 - height, (ui.cy ?? by + bh / 2) - height / 2));
  const player = getCurrentMissionPlayer(state);
  const viewerId = ui.online?.playerId ?? (mode?.playStyle === 'bots' ? 'player-1' : player?.id);
  const attackableIds = new Set(mode?.currentPlayerId === viewerId && ui.attackSourceId ? getAdjacentAttackTargets(state, ui.attackSourceId, viewerId).map((country) => country.id) : []);
  const shapes = countries.map((country) => {
    const owner = getCompetitivePlayer(mode, getCountryOwner(state, country.id));
    const troops = Number(mode?.troopsByCountry?.[country.id]) || 0;
    const fortified = Boolean(mode?.fortifiedCountries?.[country.id]);
    const label = `${nameOf(country)}${owner ? ` — ${owner.name}` : ''}${troops ? ` · ${troops} tropas` : ''}${fortified ? ' · fortificado' : ''}`;
    const classes = ['war-country', ui.selected === country.id && 'is-selected', mode?.currentPlayerId === viewerId && ui.attackSourceId === country.id && 'is-attack-source', attackableIds.has(country.id) && 'is-attackable'].filter(Boolean).join(' ');
    const attributes = `class="${classes}" style="fill:${escape(owner?.color ?? '#52666c')}" data-action="map-country" data-country="${country.id}" role="button" tabindex="0" aria-label="${escape(label)}"`;
    const troopBadge = troops || fortified ? `<text class="war-troop-badge" x="${COUNTRY_POINTS[country.id]?.[0] ?? 0}" y="${COUNTRY_POINTS[country.id]?.[1] ?? 0}">${fortified ? 'F' : ''}${troops || ''}</text>` : '';
    return COUNTRY_PATHS[country.id] ? `<path d="${COUNTRY_PATHS[country.id]}" ${attributes}><title>${escape(label)}</title></path>${troopBadge}`
      : `<circle cx="${COUNTRY_POINTS[country.id][0]}" cy="${COUNTRY_POINTS[country.id][1]}" r="3" ${attributes}><title>${escape(label)}</title></circle>${troopBadge}`;
  }).join('');
  const locked = mode?.active && mode.handoffRequired && !mode.finished;
  return `<main class="war-shell"><header class="war-header"><div><p class="eyebrow">LAST OFFICE / CONQUISTA GLOBAL</p><h1>WAR <span>O mundo é o tabuleiro.</span></h1></div><div class="war-header-actions"><span>${mode?.active ? `RODADA ${mode.turnNumber} · ${mode.players.length} JOGADORES` : 'MISSÕES SECRETAS · 2–6 JOGADORES'} · ${countries.length} PAÍSES</span><button type="button" class="quiet-action" data-action="war-menu">MENU</button>${mode?.active ? '<button type="button" class="quiet-action" data-action="war-new">NOVA PARTIDA</button>' : ''}</div></header>${legacyNotice}
    <div class="war-layout" ${locked ? 'inert aria-hidden="true"' : ''}><section class="war-map-panel"><div class="war-map-heading"><div><p class="eyebrow">01 — MAPA DE OPERAÇÕES</p><h2>${mode?.active ? 'Dispute cada território' : 'Planeje sua conquista'}</h2></div><label class="war-country-picker">Localizar país<select data-war-country aria-label="Localizar país"><option value="">Escolher território…</option>${[...countries].sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'pt-BR')).map((country) => `<option value="${country.id}" ${ui.selected === country.id ? 'selected' : ''}>${escape(nameOf(country))}</option>`).join('')}</select></label></div>
      <div class="war-map-tools"><div class="war-regions">${Object.keys(MAP_REGIONS).map((id) => `<button type="button" class="quiet-action" data-action="map-region" data-region="${id}" aria-pressed="${id === region}">${id === 'world' ? 'Mundo' : getRegionLabel(id)}</button>`).join('')}</div><div class="war-zoom"><button type="button" data-action="map-zoom" data-dir="out" aria-label="Diminuir zoom">−</button><span>${zoom.toFixed(1)}×</span><button type="button" data-action="map-zoom" data-dir="in" aria-label="Aumentar zoom">+</button><button type="button" data-action="map-zoom" data-dir="reset" aria-label="Restaurar zoom">↺</button></div></div>
      <div class="war-map-stage"><svg class="world-map-svg war-map" data-zoom="${zoom}" viewBox="${x} ${y} ${width} ${height}" role="group" aria-label="Tabuleiro mundial de War"><path d="${LAND_BACKGROUND}" class="war-land"></path><path d="${inactiveLand}" class="war-land" style="stroke:none;pointer-events:none" aria-hidden="true"></path>${shapes}</svg></div>
      <footer class="war-map-footer"><span>${countries.length} países jogáveis · áreas escuras fora da disputa</span><span>Zoom +/− · arraste para mover o mapa ampliado</span></footer>
      <details class="war-rules"><summary>Como jogar</summary><ol><li>Assuma seu turno e leia sua missão secreta.</li><li>Clique em um território seu para destacar seus vizinhos atacáveis. Escolha um deles e quantas tropas enviar; a origem sempre mantém ao menos 1 tropa.</li><li>O atacante rola até 3 dados, conforme as tropas enviadas; o defensor rola até 2. Compare os dados em ordem, e empate favorece a defesa. Cada dado perdido elimina 1 tropa. Se os dois lados sobreviverem, escolha continuar ou recuar.</li><li>Você pode atacar várias vezes no mesmo turno, enquanto tiver tropas e tempo. Encerre o turno quando quiser. O primeiro a cumprir sua missão vence.</li></ol><p>Jogue neste dispositivo, contra IA ou com amigos por link. Cada país vale um território, independentemente do tamanho.</p></details>
      ${historyView(mode, ui)}
    </section><div class="war-sidebar">${mode?.active && !locked ? turnView(state, ui) : mode?.active ? '<aside class="war-panel"><h2>Aguardando o próximo comando</h2></aside>' : setupView(state, ui)}${mode?.active && ui.online ? onlineView(ui.online) : ''}</div></div>
    <p class="war-notice" role="status">${mode?.active ? escape(state.notice) : 'Defina os jogadores para começar. O progresso é salvo automaticamente neste navegador.'}</p>
    ${locked ? `<div class="war-handoff" role="dialog" aria-modal="true" aria-labelledby="war-handoff-title"><section class="war-panel"><p class="eyebrow">TROCA DE COMANDO · RODADA ${mode.turnNumber}</p><h2 id="war-handoff-title">É a vez de ${escape(player?.name)}</h2><p>Passe o dispositivo para este jogador. A missão continua escondida.</p><button type="button" class="primary-action" data-action="mission-mode-reveal">SOU ${escape(player?.name)} — ASSUMIR TURNO</button></section></div>` : ''}</main>`;
}
