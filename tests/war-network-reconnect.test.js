import test from 'node:test';
import assert from 'node:assert/strict';

// Ambiente minimo de navegador para o modulo de rede (sem abrir conexoes de verdade).
const store = () => { const map = new Map(); return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) }; };
globalThis.location = { href: 'http://localhost/index.html', hash: '', search: '', pathname: '/index.html' };
globalThis.localStorage = store();
globalThis.sessionStorage = store();
const { connectWarRoom } = await import('../src/ui/war_network.js');

class FakeConnection {
  constructor() { this.handlers = {}; this.sent = []; this.open = false; }
  on(event, handler) { this.handlers[event] = handler; }
  send(message) { this.sent.push(message); }
  emit(event, payload) { this.handlers[event]?.(payload); }
  close() { this.open = false; this.emit('close'); }
}
const connections = [];
class FakePeer {
  constructor() { this.handlers = {}; this.disconnected = false; this.destroyed = false; queueMicrotask(() => this.handlers.open?.()); }
  on(event, handler) { this.handlers[event] = handler; }
  connect() { const c = new FakeConnection(); connections.push(c); return c; }
  reconnect() { this.reconnected = true; }
  destroy() { this.destroyed = true; }
}

const ROOM = '11111111-2222-3333-4444-555555555555';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('convidado: ao perder a conexao tenta voltar sozinho com o mesmo lugar (token) antes de mostrar erro', async () => {
  const updates = [];
  const session = await connectWarRoom({ roomId: ROOM, name: 'Bruno', state: null, onUpdate: (info) => updates.push(info), PeerClass: FakePeer });
  await wait(10);
  assert.equal(connections.length, 1);
  connections[0].open = true;
  connections[0].emit('open');
  const hello = connections[0].sent[0];
  assert.equal(hello.type, 'hello');
  assert.match(hello.token, /^[0-9a-f-]{36}$/);
  assert.equal(localStorage.getItem('last-office:war-seat:' + ROOM), hello.token, 'token guardado para reabrir o link depois');

  connections[0].emit('close');
  const reconnecting = updates.at(-1);
  assert.equal(reconnecting.status, 'connecting');
  assert.match(reconnecting.error, /Reconectando \(tentativa 1\/4\)/);

  await wait(1700);
  assert.equal(connections.length, 2, 'abriu uma nova conexao sozinho');
  connections[1].open = true;
  connections[1].emit('open');
  assert.equal(connections[1].sent[0].token, hello.token, 'mesmo token = mesmo lugar na partida');

  // Um erro logo depois do close da conexao antiga nao dispara outra tentativa em duplicidade.
  connections[0].emit('error');
  await wait(50);
  assert.equal(connections.length, 2);
  session.close();
});
