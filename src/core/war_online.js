import { allCountries, startMissionMatch, canAttackTerritory, conquerTerritory, advanceMissionTurn } from './mission_mode.js';

export const WAR_PROTOCOL = 1;
const cleanName = (name) => String(name ?? '').trim().slice(0, 32) || 'Jogador';

// The host keeps the canonical state. Tokens never leave this object; snapshots
// explicitly whitelist fields so campaign saves and rival missions stay private.
export class WarRoom {
  constructor(state, name, random = Math.random) {
    this.state = state;
    this.random = random;
    this.revision = 0;
    this.started = false;
    this.seats = [{ id: 'player-1', name: cleanName(name), connected: true, token: null }];
  }
  join(name, token) {
    if (typeof token !== 'string' || !/^[a-zA-Z0-9-]{16,100}$/.test(token)) throw new Error('Identificação de sessão inválida.');
    const old = this.seats.find((seat) => seat.token === token);
    if (old) {
      if (old.connected) throw new Error('Este jogador já está conectado em outra aba.');
      old.connected = true; this.revision += 1; return old.id;
    }
    if (this.started) throw new Error('A partida já começou. Aguarde uma nova sala.');
    if (this.seats.length >= 6) throw new Error('Sala cheia: limite de 6 jogadores.');
    const id = Array.from({ length: 6 }, (_, i) => 'player-' + (i + 1)).find((id) => !this.seats.some((seat) => seat.id === id));
    this.seats.push({ id, name: cleanName(name), token, connected: true });
    this.revision += 1;
    return id;
  }
  disconnect(id) {
    if (id === 'player-1') return;
    if (this.started) { const seat = this.seats.find((item) => item.id === id); if (seat) seat.connected = false; }
    else this.seats = this.seats.filter((seat) => seat.id !== id);
    this.revision += 1;
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
    if (this.seats.some((seat) => !seat.connected)) throw new Error('Partida pausada: aguardando reconexão.');
    if (this.state.missionMode.finished) throw new Error('Esta partida já terminou.');
    if (playerId !== this.state.missionMode.currentPlayerId) throw new Error('Aguarde seu turno.');
    if (command.action === 'attack') {
      const valid = canAttackTerritory(this.state, command.targetId);
      if (!valid.ok) throw new Error(valid.reason);
      this.state = conquerTerritory(this.state, command.targetId, this.random);
    } else if (command.action === 'end-turn') this.state = advanceMissionTurn(this.state);
    else throw new Error('Ação não reconhecida.');
    this.revision += 1;
  }
  snapshot(playerId) {
    if (!this.seats.some((seat) => seat.id === playerId)) throw new Error('Jogador não pertence à sala.');
    const mode = this.state.missionMode;
    return { protocol: WAR_PROTOCOL, type: 'snapshot', revision: this.revision, playerId, started: this.started,
      paused: this.seats.some((seat) => !seat.connected),
      members: this.seats.map(({ id, name, connected }) => ({ id, name, connected })),
      notice: this.started ? this.state.notice : 'Compartilhe o link e aguarde seus convidados.',
      owners: this.started ? Object.fromEntries(allCountries(this.state).map((country) => [country.id, country.ownerId])) : null,
      mode: this.started ? {
        active: true, playStyle: 'online', difficulty: 'medium', territoryIds: [...mode.territoryIds],
        currentPlayerId: mode.currentPlayerId, turnNumber: mode.turnNumber, actionUsed: mode.actionUsed,
        handoffRequired: false, finished: mode.finished, winnerId: mode.winnerId,
        eliminatedBy: { ...mode.eliminatedBy }, lastBattle: mode.lastBattle && { ...mode.lastBattle },
        players: mode.players.map(({ id, name, color, homeCountryId, mission }) => ({ id, name, color, homeCountryId, isBot: false,
          mission: id === playerId || (mode.finished && id === mode.winnerId) ? { ...mission } : { kind: 'secret', title: 'Missão secreta', description: 'Conhecida apenas pelo jogador.' } })),
      } : null };
  }
}

export function applyWarSnapshot(state, snapshot) {
  if (!snapshot?.started || snapshot.protocol !== WAR_PROTOCOL || !snapshot.mode?.active) return state;
  const contacts = state.geopolitics.contacts.map((country) => ({ ...country, ownerId: snapshot.owners[country.id] ?? null }));
  return { ...state, country: { ...state.country, ownerId: snapshot.owners[state.country.id] ?? null },
    geopolitics: { ...state.geopolitics, contacts }, world: contacts, missionMode: snapshot.mode, notice: snapshot.notice };
}
