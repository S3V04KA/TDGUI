// Второй клиент: слушает broadcast от mock-сервера, чтобы проверить sync между клиентами.
// Использование: node probe-client.mjs [секунд]
const url = 'ws://127.0.0.1:9876';
const secs = Number(process.argv[2] || 8);
const ws = new WebSocket(url);
const t0 = Date.now();

ws.addEventListener('open', () => {
  console.log('[open]');
  ws.send(JSON.stringify({ type: "hello", name: "probe", proto: 1 }));
});

ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  const interesting = m.type !== 'metrics';
  if (interesting) console.log(`+${((Date.now()-t0)/1000).toFixed(2)}s`, JSON.stringify(m).slice(0, 220));
});

ws.addEventListener('error', (e) => console.log('[error]', e.message || e));
ws.addEventListener('close', (e) => console.log('[close]', e.code));

setTimeout(() => { ws.close(); process.exit(0); }, secs * 1000);
