import { stepBotTurn } from './war_ai.js';
import { allCountries, startMissionMatch, canAttackTerritory, conquerTerritory, continueBattle, retreatBattle, advanceMissionTurn, fortifyTerritory, mobilizeTroops } from './mission_mode.js';

export const WAR_PROTOCOL = 3;
// Quem fica desconectado por esse tempo (partida ja iniciada) passa a ser jogado por um bot ate voltar.
export const BOT_TAKEOVER_MS = 60_000;
const cleanName = (name) => String(name ?? '').trim().slice(0, 32) || 'Jogador';

// The host keeps the canonical state. Tokens never leave this object; snapshots
// explicitly whitelist fields so campaign saves and rival missions stay private.
export class WarRoom {
  constructor(state, name, random = Math.random, now = Date.now) {
    this.state = state;
    this.random = random;
    this.now = now;
    this.revision = 0;
    this.started = false;
    this.seats = [{ id: 'player-1', name: cleanName(name), connected: true, token: null, droppedAt: null, bot: false }];
  }
  join(name, token) {
    if (typeof token !== 'string' || !/^[a-zA-Z0-9-]{16,100}$/.test(token)) throw new Error('Identificação de sessão inválida.');
    const old = this.seats.find((seat) => seat.token === token);
    if (old) {
      if (old.connected) throw new Error('Este jogador já está conectado em outra aba.');
      old.connected = true; old.droppedAt = null;
      if (old.bot) this.#handBack(old);
      this.revision += 1; return old.id;
    }
    if (this.started) throw new Error('A partida já começou. Aguarde uma nova sala.');
    if (this.seats.length >= 6) throw new Error('Sala cheia: limite de 6 jogadores.');
    const id = Array.from({ length: 6 }, (_, i) => 'player-' + (i + 1)).find((id) => !this.seats.some((seat) => seat.id === id));
    this.seats.push({ id, name: cleanName(name), token, connected: true, droppedAt: null, bot: false });
    this.revision += 1;
    return id;
  }
  disconnect(id) {
    if (id === 'player-1') return;
    if (this.started) { const seat = this.seats.find((item) => item.id === id); if (seat) { seat.connected = false; seat.droppedAt = this.now(); } }
    else this.seats = this.seats.filter((seat) => seat.id !== id);
    this.revision += 1;
  }
  // Pausada enquanto alguem estiver fora e ainda nao tiver sido substituido por um bot.
  isPaused() { return this.seats.some((seat) => !seat.connected && !seat.bot); }
  // Segundos ate um bot assumir o jogador ausente mais antigo (null quando ninguem espera).
  takeoverIn() {
    if (!this.started) return null;
    const waiting = this.seats.filter((seat) => !seat.connected && !seat.bot && seat.droppedAt != null);
    if (!waiting.length) return null;
    return Math.max(0, Math.ceil((BOT_TAKEOVER_MS - (this.now() - Math.min(...waiting.map((seat) => seat.droppedAt)))) / 1000));
  }
  #setBot(seat, bot, notice) {
    seat.bot = bot;
    const mode = this.state.missionMode;
    this.state = { ...this.state, notice, missionMode: { ...mode, players: mode.players.map((player) => (player.id === seat.id ? { ...player, isBot: bot } : player)) } };
  }
  #handBack(seat) { this.#setBot(seat, false, `${seat.name} voltou e retomou o comando.`); }
  // Chamada periodicamente pelo anfitriao: passa o controle a bots de quem ficou fora por tempo demais.
  tick() {
    if (!this.started) return false;
    let changed = false;
    for (const seat of this.seats) {
      if (seat.connected || seat.bot || seat.droppedAt == null || this.now() - seat.droppedAt < BOT_TAKEOVER_MS) continue;
      this.#setBot(seat, true, `${seat.name} perdeu a conexão: um bot joga por esse jogador até ele voltar.`);
      changed = true;
    }
    if (changed) this.revision += 1;
    return changed;
  }
  hasBotTurn() {
    const mode = this.state.missionMode;
    return this.started && !mode.finished && mode.players.some((player) => player.id === mode.currentPlayerId && player.isBot);
  }
  stepBot() {
    if (!this.hasBotTurn() || this.isPaused()) return false;
    const next = stepBotTurn(this.state, this.random);
    if (next === this.state) return false;
    this.state = next; this.revision += 1;
    return true;
  }
  start() {
    if (this.started || this.seats.length < 2 || this.seats.some((seat) => !seat.connected)) throw new Error('Aguarde pelo menos 2 jogadores conectados.');
    // Compact lobby slots before dealing; connection identity remains stable via tokens.
    this.state = startMissionMatch(this.state, this.seats.length, this.seats.map((seat) => seat.name), this.random, { playStyle: 'online' });
    const idMap = Object.fromEntries(this.state.missionMode.players.map((player, i) => [player.id, this.seats[i].id]));
    const contacts = this.state.geopolitics.contacts.map((country) => ({ ...country, ownerId: idMap[country.ownerId] ?? null }));
    this.state = { ...this.state, country: { ...this.state.country, ownerId: idMap[this.state.country.ownerId] ?? null },
      geopolitics: { ...this.state.geopolitics, contacts }, world: contacts,
      missionMode: { ...this.state.missionMode, currentPlayerId: this.seats[0].id,
        players: this.state.missionMode.players.map((player) => ({ ...player, id: idMap[player.id],
          mission: { ...player.mission, ...(player.mission.targetPlayerId ? { targetPlayerId: idMap[player.mission.targetPlayerId] } : {}) } })) } };
    this.started = true; this.revision += 1;
  }
  command(playerId, command) {
    if (!this.started || !command || command.revision !== this.revision) throw new Error('O tabuleiro mudou. Tente novamente.');
    if (this.isPaused()) throw new Error('Partida pausada: aguardando reconexão.');
    if (this.state.missionMode.finished) throw new Error('Esta partida já terminou.');
    if (playerId !== this.state.missionMode.currentPlayerId) throw new Error('Aguarde seu turno.');
    if (command.action === 'attack') {
      const valid = canAttackTerritory(this.state, command.targetId, command.sourceId, command.amount);
      if (!valid.ok) throw new Error(valid.reason);
      this.state = conquerTerritory(this.state, command.targetId, command.sourceId, command.amount, this.random, command.dice);
    } else if (command.action === 'continue-battle') {
      const next = continueBattle(this.state, this.random, command.dice);
      if (!this.state.missionMode.activeBattle || next.missionMode.activeBattle === this.state.missionMode.activeBattle) throw new Error(next.notice || 'Não há batalha para continuar.');
      this.state = next;
    } else if (command.action === 'retreat-battle') {
      const next = retreatBattle(this.state);
      if (next === this.state) throw new Error('Não há batalha para recuar.');
      this.state = next;
    } else if (command.action === 'mobilize') {
      const before = this.state.missionMode.mobilizedThisTurn;
      const next = mobilizeTroops(this.state, command.targetId, command.amount);
      if (next.missionMode.mobilizedThisTurn !== before + command.amount) throw new Error(next.notice);
      this.state = next;
    } else if (command.action === 'fortify') {
      const before = this.state.missionMode.mobilizedThisTurn;
      const next = fortifyTerritory(this.state, command.targetId);
      if (next.missionMode.mobilizedThisTurn !== before + 2) throw new Error(next.notice);
      this.state = next;
    } else if (command.action === 'end-turn') this.state = advanceMissionTurn(this.state);
    else throw new Error('Ação não reconhecida.');
    this.revision += 1;
  }
  snapshot(playerId) {
    if (!this.seats.some((seat) => seat.id === playerId)) throw new Error('Jogador não pertence à sala.');
    const mode = this.state.missionMode;
    return { protocol: WAR_PROTOCOL, type: 'snapshot', revision: this.revision, playerId, started: this.started,
      paused: this.isPaused(), takeoverIn: this.takeoverIn(),
      members: this.seats.map(({ id, name, connected, bot }) => ({ id, name, connected, bot })),
      notice: this.started ? this.state.notice : 'Compartilhe o link e aguarde seus convidados.',
      owners: this.started ? Object.fromEntries(allCountries(this.state).map((country) => [country.id, country.ownerId])) : null,
      mode: this.started ? {
        active: true, playStyle: 'online', difficulty: 'medium', territoryIds: [...mode.territoryIds],
        currentPlayerId: mode.currentPlayerId, turnNumber: mode.turnNumber, actionUsed: mode.actionUsed,
        turnDeadline: mode.turnDeadline, turnRemainingMs: mode.turnDeadline ? Math.max(0, mode.turnDeadline - Date.now()) : null, turnLimitSeconds: mode.turnLimitSeconds, troopsPerTurn: mode.troopsPerTurn,
        troopsByCountry: { ...mode.troopsByCountry }, mobilizedThisTurn: mode.mobilizedThisTurn,
        fortifiedCountries: { ...mode.fortifiedCountries }, activeBattle: mode.activeBattle && { ...mode.activeBattle },
        handoffRequired: false, finished: mode.finished, winnerId: mode.winnerId,
        eliminatedBy: { ...mode.eliminatedBy }, lastBattle: mode.lastBattle && { ...mode.lastBattle },
        players: mode.players.map(({ id, name, color, homeCountryId, mission, isBot }) => ({ id, name, color, homeCountryId, isBot: Boolean(isBot),
          mission: id === playerId || (mode.finished && id === mode.winnerId) ? { ...mission } : { kind: 'secret', title: 'Missão secreta', description: 'Conhecida apenas pelo jogador.' } })),
      } : null };
  }
}

export function applyWarSnapshot(state, snapshot) {
  if (!snapshot?.started || snapshot.protocol !== WAR_PROTOCOL || !snapshot.mode?.active) return state;
  const contacts = state.geopolitics.contacts.map((country) => ({ ...country, ownerId: snapshot.owners[country.id] ?? null }));
  return { ...state, country: { ...state.country, ownerId: snapshot.owners[state.country.id] ?? null },
    geopolitics: { ...state.geopolitics, contacts }, world: contacts, missionMode: { ...snapshot.mode, ...(Number.isFinite(snapshot.mode.turnRemainingMs) ? { turnDeadline: Date.now() + snapshot.mode.turnRemainingMs } : {}) }, notice: snapshot.notice };
}
