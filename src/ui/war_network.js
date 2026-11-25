import { WarRoom, WAR_PROTOCOL } from '../core/war_online.js';

let peerLibrary;
function loadPeer() {
  if (globalThis.Peer) return Promise.resolve(globalThis.Peer);
  if (!peerLibrary) peerLibrary = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('../../assets/vendor/peerjs-1.5.5.min.js', import.meta.url).href;
    script.onload = () => resolve(globalThis.Peer);
    script.onerror = () => { peerLibrary = null; script.remove(); reject(new Error('Não foi possível carregar a conexão online.')); };
    document.head.append(script);
  });
  return peerLibrary;
}
const safeToken = () => crypto.randomUUID();
export const getRoomFromUrl = () => {
  const room = new URLSearchParams(location.hash.slice(1)).get('war-room');
  return /^[a-f0-9-]{36}$/.test(room ?? '') ? room : null;
};
export function roomLink(roomId) {
  const url = new URL(location.href);
  url.search = ''; url.hash = new URLSearchParams({ 'war-room': roomId }).toString();
  return url.href;
}
function seatToken(roomId) {
  try {
    const key = 'last-office:war-seat:' + roomId;
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const token = safeToken(); sessionStorage.setItem(key, token); return token;
  } catch { return safeToken(); }
}

// Disposable WebRTC session. Public PeerServer handles signaling only; game
// authority, turn validation and private missions stay in the host browser.
export async function connectWarRoom({ roomId, name, state, onUpdate, PeerClass }) {
  const Peer = PeerClass ?? await loadPeer();
  const host = !roomId;
  roomId ||= safeToken();
  const authority = host ? new WarRoom(state, name) : null;
  const connections = new Map();
  let closed = false, guestConnection = null, lastRevision = -1;
  const timers = new Set();
  const later = (callback, ms) => { const id = setTimeout(() => { timers.delete(id); if (!closed) callback(); }, ms); timers.add(id); return id; };
  const clear = (id) => { clearTimeout(id); timers.delete(id); };
  let info = { host, roomId, link: roomLink(roomId), playerId: host ? 'player-1' : null, status: 'connecting', members: [], error: '', pending: false };
  const emit = (patch = {}, snapshot) => { if (closed) return; info = { ...info, ...patch }; onUpdate(info, snapshot); };
  const fail = (message) => emit({ status: 'error', error: message, pending: false });
  const peer = new Peer(host ? 'last-office-' + roomId : undefined, { debug: 0 });
  const initialTimeout = later(() => fail('A conexão demorou demais. Verifique a internet e tente reconectar.'), 20000);
  function broadcast() {
    if (!authority || closed) return;
    const own = authority.snapshot('player-1');
    emit({ status: 'connected', ...own, error: '', pending: false }, own);
    for (const [connection, seat] of connections) {
      if (connection.open) connection.send(authority.snapshot(seat));
    }
  }
  function hostCommand(seat, message, connection) {
    try {
      if (message?.protocol !== WAR_PROTOCOL) throw new Error('Versão incompatível. Atualize o jogo.');
      authority.command(seat, message);
      broadcast();
    } catch (error) {
      if (connection?.open) connection.send({ type: 'error', message: error.message });
      else emit({ error: error.message, pending: false });
    }
  }
  peer.on('connection', (connection) => {
    if (!host) { connection.close(); return; }
    let seat = null, lastMessageAt = 0;
    const handshakeTimeout = later(() => connection.close(), 10000);
    connection.on('data', (message) => {
      if (closed) return;
      try {
        if (!message || typeof message !== 'object' || message.protocol !== WAR_PROTOCOL) throw new Error('Versão incompatível. Atualize o jogo.');
        if (!seat) {
          if (message.type !== 'hello') throw new Error('Identificação ausente.');
          seat = authority.join(message.name, message.token);
          connections.set(connection, seat); clear(handshakeTimeout); broadcast();
        } else {
          if (Date.now() - lastMessageAt < 150) return;
          lastMessageAt = Date.now();
          hostCommand(seat, message, connection);
        }
      } catch (error) {
        connection.send({ type: 'error', message: error.message });
        if (!seat) later(() => connection.close(), 300);
      }
    });
    const leave = () => {
      clear(handshakeTimeout);
      if (!connections.has(connection)) return;
      connections.delete(connection); authority.disconnect(seat); broadcast();
    };
    connection.on('close', leave);
    connection.on('error', leave);
  });
  peer.on('open', () => {
    if (closed) return;
    if (host) { clear(initialTimeout); broadcast(); return; }
    guestConnection = peer.connect('last-office-' + roomId, { reliable: true, serialization: 'json' });
    guestConnection.on('open', () => guestConnection.send({ protocol: WAR_PROTOCOL, type: 'hello', name, token: seatToken(roomId) }));
    guestConnection.on('data', (message) => {
      if (message?.type === 'error') { emit({ error: message.message, pending: false }); return; }
      if (message?.type !== 'snapshot' || message.protocol !== WAR_PROTOCOL || !Number.isInteger(message.revision) || message.revision < lastRevision) return;
      clear(initialTimeout); lastRevision = message.revision;
      emit({ ...message, status: 'connected', error: '', pending: false }, message);
    });
    guestConnection.on('close', () => fail('Conexão com o criador perdida. Reconecte; a aba do criador precisa permanecer aberta.'));
    guestConnection.on('error', () => fail('Falha na conexão entre jogadores. Tente outra rede ou reconecte.'));
  });
  peer.on('error', (error) => {
    if (error.type === 'peer-unavailable') fail('Sala não encontrada. Confira o link e se o criador continua com o jogo aberto.');
    else fail('Não foi possível conectar à sala. Confira a internet e tente novamente.');
  });
  peer.on('disconnected', () => {
    if (!closed && !peer.destroyed) peer.reconnect();
  });
  emit();
  return {
    roomId, host,
    start() { if (!authority) return; try { authority.start(); broadcast(); } catch (error) { emit({ error: error.message }); } },
    command(action, targetId, amount, sourceId) {
      if (info.status !== 'connected' || info.pending || info.paused) return;
      const message = { protocol: WAR_PROTOCOL, action, targetId, amount, sourceId, revision: info.revision };
      if (host) hostCommand('player-1', message);
      else if (guestConnection?.open) {
        emit({ pending: true, error: '' }); guestConnection.send(message);
        later(() => { if (info.pending) fail('A jogada não foi confirmada. Reconecte para atualizar o tabuleiro.'); }, 12000);
      }
    },
    close() { closed = true; timers.forEach(clearTimeout); timers.clear(); peer.destroy(); connections.clear(); },
  };
}
