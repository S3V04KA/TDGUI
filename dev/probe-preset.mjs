// Быстрая проверка mock: hello → список пресетов → preset.load → ждём broadcast values.
const ws = new WebSocket('ws://127.0.0.1:9876');
const log = [];
let loaded = false;
ws.addEventListener('open', () => {
  ws.send(JSON.stringify({ type: 'hello', name: 'probe2', proto: 1 }));
});
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.type === 'metrics') return;
  log.push(m.type + (m.presets ? ' ids=' + m.presets.map(p => p.id + ':' + p.name).join(',') : '') + (m.values ? ' values=' + JSON.stringify(m.values).slice(0, 100) : ''));
  if (!loaded && m.presets?.length) {
    loaded = true;
    ws.send(JSON.stringify({ type: 'preset.load', id: m.presets[0].id }));
    log.push('→ sent preset.load ' + m.presets[0].id);
  } else if (loaded && m.type === 'values') {
    console.log(log.join('\n'));
    console.log('OK: preset.load разослал values');
    ws.close();
    process.exit(0);
  }
});
setTimeout(() => { console.log('TIMEOUT\n' + log.join('\n')); process.exit(1); }, 5000);
