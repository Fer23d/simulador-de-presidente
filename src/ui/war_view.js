import { COUNTRY_PATHS, COUNTRY_POINTS, LAND_BACKGROUND, MAP_REGIONS } from '../data/world_map.js';
import { WAR_COUNTRY_COUNT } from '../data/war_countries.js';
import { BOT_DIFFICULTIES } from '../core/war_ai.js';
import { allCountries, canAttackTerritory, getCompetitivePlayer, getCountryOwner, getCurrentMissionPlayer, getMissionProgress, getRegionLabel, territoryCounts } from '../core/mission_mode.js';

const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export const isWarPhase = (state) => !state?.city && !state?.is_wasteland;
const nameOf = (country) => country?.name ?? country?.nome ?? '';

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
    <ul class="war-score">${(online.members ?? []).map((member) => `<li><span>${escape(member.name)}${member.id === online.playerId ? ' (você)' : ''}</span><strong>${member.connected ? 'Conectado' : 'Ausente'}</strong></li>`).join('')}</ul>
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
  const attack = selected && canAttackTerritory(state, selected.id);
  const progress = getMissionProgress(state, viewer?.id);
  const missionVisible = ui.missionVisible && !mode.handoffRequired;
  const battle = mode.lastBattle;
  const battleCountry = battle && allCountries(state).find((country) => country.id === battle.targetId);
  const winner = mode.finished && getCompetitivePlayer(mode, mode.winnerId);
  if (winner) return `<section class="war-panel war-victory"><p class="eyebrow">MISSÃO CUMPRIDA</p><h2>${escape(winner.name)} venceu!</h2><p>${escape(winner.mission.description)}</p><p>Vitória na rodada ${mode.turnNumber}.</p><button type="button" class="primary-action" data-action="war-new">JOGAR NOVAMENTE</button></section>`;
  return `<section class="war-panel" style="--command-color:${escape(player.color)}"><p class="eyebrow">02 — TURNO ATUAL</p><h2>${escape(player.name)}</h2><p class="war-turn-status">${player.isBot ? 'IA ' + BOT_DIFFICULTIES[mode.difficulty].label + ': planejando a ofensiva…' : !mayPlay ? 'Aguarde seu turno ou a reconexão dos jogadores.' : mode.actionUsed ? 'Ofensiva concluída. Encerre seu turno.' : 'Selecione um território rival no mapa.'}</p>
    <button type="button" class="quiet-action war-secret-button" data-action="war-mission" aria-expanded="${Boolean(missionVisible)}">${missionVisible ? 'OCULTAR MISSÃO' : 'REVELAR MINHA MISSÃO'}</button>
    ${missionVisible ? `<div class="war-secret"><h3>${escape(viewer?.mission.title)}</h3><p>${escape(viewer?.mission.description)}</p><strong>${escape(progress.label)}</strong></div>` : '<p class="war-fine">Missão protegida. Revele apenas o seu objetivo.</p>'}
    <div class="war-target"><p class="eyebrow">TERRITÓRIO SELECIONADO</p><h3>${selected ? escape(nameOf(selected)) : 'Escolha seu alvo'}</h3><p>${owner ? `Comando: ${escape(owner.name)}` : 'Clique no mapa ou escolha um país na lista.'}</p>
      <button type="button" class="primary-action" data-action="competitive-attack" data-contact="${escape(selected?.id)}" ${attack?.ok && mayPlay ? '' : 'disabled'}>ROLAR DADO E ATACAR</button>
      <p class="war-fine">${selected && !attack?.ok ? escape(attack?.reason) : '4, 5 ou 6: conquista. 1, 2 ou 3: defesa resiste.'}</p></div>
    ${battle ? `<div class="war-battle" role="status"><span class="war-die" aria-label="Dado ${battle.roll}">${['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][battle.roll] ?? battle.roll}</span><div><strong>${battle.won ? 'Território conquistado' : 'Ataque repelido'}</strong><p>${escape(nameOf(battleCountry))} · ${escape(getCompetitivePlayer(mode, battle.attackerId)?.name)}</p></div></div>` : ''}
    <button type="button" class="quiet-action war-end-turn" data-action="mission-mode-end-turn" ${mayPlay ? '' : 'disabled'}>${mode.actionUsed ? 'ENCERRAR TURNO →' : 'PASSAR A VEZ →'}</button>
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
  const shapes = countries.map((country) => {
    const owner = getCompetitivePlayer(mode, getCountryOwner(state, country.id));
    const label = `${nameOf(country)}${owner ? ` — ${owner.name}` : ''}`;
    const attributes = `class="war-country ${ui.selected === country.id ? 'is-selected' : ''}" style="fill:${escape(owner?.color ?? '#52666c')}" data-action="map-country" data-country="${country.id}" role="button" tabindex="0" aria-label="${escape(label)}"`;
    return COUNTRY_PATHS[country.id] ? `<path d="${COUNTRY_PATHS[country.id]}" ${attributes}><title>${escape(label)}</title></path>`
      : `<circle cx="${COUNTRY_POINTS[country.id][0]}" cy="${COUNTRY_POINTS[country.id][1]}" r="3" ${attributes}><title>${escape(label)}</title></circle>`;
  }).join('');
  const player = getCurrentMissionPlayer(state);
  const locked = mode?.active && mode.handoffRequired && !mode.finished;
  return `<main class="war-shell"><header class="war-header"><div><p class="eyebrow">LAST OFFICE / CONQUISTA GLOBAL</p><h1>WAR <span>O mundo é o tabuleiro.</span></h1></div><div class="war-header-actions"><span>${mode?.active ? `RODADA ${mode.turnNumber} · ${mode.players.length} JOGADORES` : 'MISSÕES SECRETAS · 2–6 JOGADORES'} · ${countries.length} PAÍSES</span><button type="button" class="quiet-action" data-action="war-menu">MENU</button>${mode?.active ? '<button type="button" class="quiet-action" data-action="war-new">NOVA PARTIDA</button>' : ''}</div></header>${legacyNotice}
    <div class="war-layout" ${locked ? 'inert aria-hidden="true"' : ''}><section class="war-map-panel"><div class="war-map-heading"><div><p class="eyebrow">01 — MAPA DE OPERAÇÕES</p><h2>${mode?.active ? 'Dispute cada território' : 'Planeje sua conquista'}</h2></div><label class="war-country-picker">Localizar país<select data-war-country aria-label="Localizar país"><option value="">Escolher território…</option>${[...countries].sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'pt-BR')).map((country) => `<option value="${country.id}" ${ui.selected === country.id ? 'selected' : ''}>${escape(nameOf(country))}</option>`).join('')}</select></label></div>
      <div class="war-map-tools"><div class="war-regions">${Object.keys(MAP_REGIONS).map((id) => `<button type="button" class="quiet-action" data-action="map-region" data-region="${id}" aria-pressed="${id === region}">${id === 'world' ? 'Mundo' : getRegionLabel(id)}</button>`).join('')}</div><div class="war-zoom"><button type="button" data-action="map-zoom" data-dir="out" aria-label="Diminuir zoom">−</button><span>${zoom.toFixed(1)}×</span><button type="button" data-action="map-zoom" data-dir="in" aria-label="Aumentar zoom">+</button><button type="button" data-action="map-zoom" data-dir="reset" aria-label="Restaurar zoom">↺</button></div></div>
      <div class="war-map-stage"><svg class="world-map-svg war-map" data-zoom="${zoom}" viewBox="${x} ${y} ${width} ${height}" role="group" aria-label="Tabuleiro mundial de War"><path d="${LAND_BACKGROUND}" class="war-land"></path><path d="${inactiveLand}" class="war-land" style="stroke:none;pointer-events:none" aria-hidden="true"></path>${shapes}</svg></div>
      <footer class="war-map-footer"><span>${countries.length} países jogáveis · áreas escuras fora da disputa</span><span>Zoom +/− · arraste para mover o mapa ampliado</span></footer>
      <details class="war-rules"><summary>Como jogar</summary><ol><li>Assuma seu turno e leia sua missão secreta.</li><li>Escolha um país de outro jogador e role o dado. Com 4, 5 ou 6, ele é seu.</li><li>Encerre o turno e passe o controle. Você também pode passar sem atacar.</li><li>O primeiro a cumprir sua missão vence. Jogadores sem territórios são eliminados.</li></ol><p>Jogue neste dispositivo, contra IA ou com amigos por link. Cada país vale um território, independentemente do tamanho.</p></details>
    </section><div class="war-sidebar">${mode?.active && !locked ? turnView(state, ui) : mode?.active ? '<aside class="war-panel"><h2>Aguardando o próximo comando</h2></aside>' : setupView(state, ui)}${mode?.active && ui.online ? onlineView(ui.online) : ''}</div></div>
    <p class="war-notice" role="status">${mode?.active ? escape(state.notice) : 'Defina os jogadores para começar. O progresso é salvo automaticamente neste navegador.'}</p>
    ${locked ? `<div class="war-handoff" role="dialog" aria-modal="true" aria-labelledby="war-handoff-title"><section class="war-panel"><p class="eyebrow">TROCA DE COMANDO · RODADA ${mode.turnNumber}</p><h2 id="war-handoff-title">É a vez de ${escape(player?.name)}</h2><p>Passe o dispositivo para este jogador. A missão continua escondida.</p><button type="button" class="primary-action" data-action="mission-mode-reveal">SOU ${escape(player?.name)} — ASSUMIR TURNO</button></section></div>` : ''}</main>`;
}
