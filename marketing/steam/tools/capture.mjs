// Captura paginas em alta resolucao controlando o Chrome pelo protocolo DevTools (sem dependencias).
// Uso: node capture.mjs <saida.png> <url> [largura] [altura] [escala]
// A pagina sinaliza que terminou definindo document.title comecando com "ready".
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [output, url, width = '1920', height = '1080', scale = '1'] = process.argv.slice(2);
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), 'steam-capture-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function connect() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = targets.find((target) => target.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* Chrome ainda iniciando */ }
    await sleep(250);
  }
  throw new Error('Chrome nao respondeu.');
}

let socket;
try {
  socket = new WebSocket(await connect());
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let nextId = 0;
  const pending = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
  };
  const send = (method, params = {}) => new Promise((resolve) => {
    const id = ++nextId;
    pending.set(id, resolve);
    socket.send(JSON.stringify({ id, method, params }));
  });
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: Number(width), height: Number(height),
    deviceScaleFactor: Number(scale), mobile: false });
  if (process.env.TRANSPARENT === '1') {
    await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  }
  await send('Page.navigate', { url });
  let ready = false;
  for (let attempt = 0; attempt < 480 && !ready; attempt++) {
    await sleep(250);
    const result = await send('Runtime.evaluate', { expression: 'document.title' });
    ready = String(result.result?.result?.value ?? '').startsWith('ready');
  }
  if (!ready) throw new Error('A pagina nao sinalizou "ready" a tempo.');
  await sleep(600);
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(output, Buffer.from(shot.result.data, 'base64'));
  console.log(`ok ${output}`);
} catch (error) {
  console.error(`falhou ${output}: ${error.message}`);
  process.exitCode = 1;
} finally {
  socket?.close();
  chrome.kill();
}
