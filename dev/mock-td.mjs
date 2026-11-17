// Mock-сервер TouchDesigner: эмулирует touchgui_bridge для разработки веба.
// Запуск: node dev/mock-td.mjs [порт]
// Реализует тот же протокол, что и td-bridge.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const PORT = parseInt(process.argv[2] ?? "9876", 10);

// ── состояние ──────────────────────────────────────────────────────
const values = {
  "lighting/dim": 0.62,
  "lighting/strobe": 0,
  "lighting/color": "#ff8800",
  "lighting/pan": [0.5, 0.5],
  "lighting/mode": "static",
  "lighting/label": "Front row",
  "lighting/blackout": false,
  "video/feedback": 0.35,
  "video/zoom": 1.1,
  "video/speed": 0.8,
  "video/source": "cam1",
  "audio/bass": 0.5,
  "audio/gain": 0.8,
};

const presets = [
  {
    id: "p1",
    name: "Opening",
    createdAt: Date.now() - 86400000,
    values: { "lighting/dim": 0.2, "video/feedback": 0.1 },
  },
  {
    id: "p2",
    name: "Climax",
    createdAt: Date.now() - 3600000,
    values: { "lighting/dim": 1, "video/feedback": 0.8, "audio/gain": 1 },
  },
];

const schema = {
  version: 1,
  project: "Mock TD Project",
  root: {
    id: "root",
    label: { ru: "Корень", en: "Root" },
    groups: [
      {
        id: "lighting",
        label: { ru: "Свет", en: "Lighting" },
        icon: "lightbulb",
        quick: ["lighting/dim", "lighting/color"],
        controls: [
          { id: "lighting/dim", par: "Dim", type: "knob", label: { ru: "Затемнение", en: "Dim" }, min: 0, max: 1, unit: "%", precision: 0, metric: "lighting/level" },
          { id: "lighting/strobe", par: "Strobe", type: "knob", label: { ru: "Строб", en: "Strobe" }, min: 0, max: 20, unit: "гц", precision: 1 },
          { id: "lighting/color", par: "Color", type: "color", label: { ru: "Цвет", en: "Color" } },
          { id: "lighting/pan", par: "Pan", type: "xy", label: { ru: "Панорама", en: "Pan" } },
          { id: "lighting/mode", par: "Mode", type: "select", label: { ru: "Режим", en: "Mode" },
            options: [
              { value: "static", label: { ru: "Статика", en: "Static" } },
              { value: "chase", label: { ru: "Пробег", en: "Chase" } },
              { value: "sound", label: { ru: "Звук", en: "Sound" } },
            ] },
          { id: "lighting/label", par: "Label", type: "text", label: { ru: "Подпись", en: "Label" } },
          { id: "lighting/blackout", par: "Blackout", type: "toggle", label: { ru: "Блэкаут", en: "Blackout" } },
          { id: "lighting/fire", par: "Fire", type: "button", label: { ru: "Пуск", en: "Fire" } },
        ],
        metrics: [
          { id: "lighting/level", label: { ru: "Уровень", en: "Level" }, unit: "лк", precision: 1, min: 0, max: 1 },
          { id: "lighting/temp", label: { ru: "Температура", en: "Temperature" }, unit: "°C", precision: 0 },
        ],
        groups: [
          {
            id: "lighting/movers",
            label: { ru: "Моверы", en: "Movers" },
            quick: ["lighting/movers/zoom"],
            controls: [
              { id: "lighting/movers/zoom", par: "Zoom", type: "knob", label: { ru: "Зум", en: "Zoom" }, min: 5, max: 40, unit: "°", precision: 1, metric: "lighting/movers/zoomed" },
            ],
            metrics: [
              { id: "lighting/movers/zoomed", label: { ru: "Факт. угол", en: "Actual angle" }, unit: "°", precision: 1 },
            ],
          },
        ],
      },
      {
        id: "video",
        label: { ru: "Видео", en: "Video" },
        icon: "videocam",
        quick: ["video/feedback", "video/speed"],
        controls: [
          { id: "video/feedback", par: "Feedback", type: "knob", label: { ru: "Фидбек", en: "Feedback" }, min: 0, max: 0.95, precision: 2, metric: "video/fb_out" },
          { id: "video/zoom", par: "Zoom", type: "knob", label: { ru: "Зум", en: "Zoom" }, min: 0.5, max: 3, precision: 2 },
          { id: "video/speed", par: "Speed", type: "slider", label: { ru: "Скорость", en: "Speed" }, min: -2, max: 2, precision: 2 },
          { id: "video/source", par: "Source", type: "select", label: { ru: "Источник", en: "Source" },
            options: [
              { value: "cam1", label: { ru: "Камера 1", en: "Camera 1" } },
              { value: "cam2", label: { ru: "Камера 2", en: "Camera 2" } },
              { value: "gen", label: { ru: "Генератор", en: "Generator" } },
            ] },
        ],
        metrics: [
          { id: "video/fb_out", label: { ru: "Фидбек вых.", en: "Feedback out" }, precision: 3, min: 0, max: 1 },
          { id: "video/fps", label: { ru: "FPS", en: "FPS" }, precision: 0 },
        ],
      },
      {
        id: "audio",
        label: { ru: "Аудио", en: "Audio" },
        icon: "graphic_eq",
        quick: ["audio/gain"],
        controls: [
          { id: "audio/gain", par: "Gain", type: "knob", label: { ru: "Усиление", en: "Gain" }, min: 0, max: 1, precision: 2, metric: "audio/peak" },
          { id: "audio/bass", par: "Bass", type: "knob", label: { ru: "Бас", en: "Bass" }, min: 0, max: 1, precision: 2 },
        ],
        metrics: [
          { id: "audio/peak", label: { ru: "Пик", en: "Peak" }, unit: "дБ", precision: 1 },
          { id: "audio/rms", label: { ru: "RMS", en: "RMS" }, precision: 2 },
        ],
      },
    ],
  },
};

// ── HTTP + WebSocket вручную (без зависимостей) ───────────────────
// Минимальный RFC6455-совместимый сервер, чтобы не тянуть ws.
import { createHash } from "node:crypto";

const clients = new Set();
let seq = 0;

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const ws of clients) sendFrame(ws, data);
}

function sendFrame(ws, text) {
  if (ws.destroyed || !ws.writable) return;
  const payload = Buffer.from(text, "utf8");
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  header[0] = 0x81; // FIN + text
  try {
    ws.write(Buffer.concat([header, payload]));
  } catch {
    /* ignore */
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/touchgui/discover") {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    });
    res.end(JSON.stringify({ app: "touchgui", proto: 1, project: schema.project }));
    return;
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*" });
    res.end();
    return;
  }
  res.writeHead(404);
  res.end("not found");
});

server.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }
  const accept = createHash("sha1")
    .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
    .digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );

  const ws = socket;
  clients.add(ws);
  console.log(`[mock] client connected (${clients.size})`);

  let buffer = Buffer.alloc(0);
  ws.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      const frame = parseFrame(buffer);
      if (!frame) break;
      buffer = frame.rest;
      if (frame.opcode === 0x8) {
        ws.end();
        return;
      }
      if (frame.opcode === 0x9) {
        // ping -> pong
        const h = Buffer.alloc(2);
        h[0] = 0x8a;
        h[1] = frame.payload.length;
        ws.write(Buffer.concat([h, frame.payload]));
        continue;
      }
      if (frame.opcode === 0x1) {
        handleMessage(ws, frame.payload.toString("utf8"));
      }
    }
  });
  const cleanup = () => {
    clients.delete(ws);
    console.log(`[mock] client left (${clients.size})`);
  };
  ws.on("close", cleanup);
  ws.on("error", cleanup);
});

function parseFrame(buf) {
  if (buf.length < 2) return null;
  const opcode = buf[0] & 0x0f;
  const masked = (buf[1] & 0x80) !== 0;
  let len = buf[1] & 0x7f;
  let off = 2;
  if (len === 126) {
    if (buf.length < 4) return null;
    len = buf.readUInt16BE(2);
    off = 4;
  } else if (len === 127) {
    if (buf.length < 10) return null;
    len = Number(buf.readBigUInt64BE(2));
    off = 10;
  }
  let mask = null;
  if (masked) {
    if (buf.length < off + 4) return null;
    mask = buf.subarray(off, off + 4);
    off += 4;
  }
  if (buf.length < off + len) return null;
  let payload = Buffer.from(buf.subarray(off, off + len));
  if (mask) {
    for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
  }
  return { opcode, payload, rest: buf.subarray(off + len) };
}

function handleMessage(ws, text) {
  let msg;
  try {
    msg = JSON.parse(text);
  } catch {
    return;
  }
  switch (msg.type) {
    case "hello":
    case "get": {
      const valuesOut = {};
      for (const [k, v] of Object.entries(values)) if (typeof v !== "boolean" || true) valuesOut[k] = v;
      sendFrame(ws, JSON.stringify({ type: "welcome", schema, values: valuesOut, presets, seq }));
      break;
    }
    case "set": {
      values[msg.id] = msg.value;
      // эхо всем клиентам (включая отправителя) — как в TD
      broadcast({ type: "values", values: { [msg.id]: msg.value }, seq: ++seq });
      break;
    }
    case "ping":
      sendFrame(ws, JSON.stringify({ type: "pong", ts: msg.ts }));
      break;
    case "preset.save": {
      const p = {
        id: randomUUID().slice(0, 8),
        name: msg.name,
        values: msg.values,
        createdAt: Date.now(),
      };
      presets.push(p);
      broadcast({ type: "presets", presets });
      break;
    }
    case "preset.load": {
      const p = presets.find((x) => x.id === msg.id);
      if (p) {
        Object.assign(values, p.values);
        broadcast({ type: "values", values: p.values, seq: ++seq });
      }
      break;
    }
    case "preset.delete": {
      const i = presets.findIndex((x) => x.id === msg.id);
      if (i >= 0) presets.splice(i, 1);
      broadcast({ type: "presets", presets });
      break;
    }
    case "preset.rename": {
      const p = presets.find((x) => x.id === msg.id);
      if (p) p.name = msg.name;
      broadcast({ type: "presets", presets });
      break;
    }
    case "config.quick": {
      const g = findGroup(schema.root, msg.groupId);
      if (g) {
        g.quick = msg.quick;
        broadcast({ type: "schema", schema });
      }
      break;
    }
    case "config.order": {
      const g = findGroup(schema.root, msg.groupId);
      if (g && g.controls) {
        const byId = new Map(g.controls.map((c) => [c.id, c]));
        const next = msg.order.map((id) => byId.get(id)).filter(Boolean);
        for (const c of g.controls) if (!msg.order.includes(c.id)) next.push(c);
        g.controls = next;
        broadcast({ type: "schema", schema });
      }
      break;
    }
    default:
      sendFrame(ws, JSON.stringify({ type: "error", message: `unknown message type: ${msg.type ?? "(no type field)"}` }));
  }
}

function findGroup(root, id) {
  if (root.id === id) return root;
  for (const g of root.groups ?? []) {
    const f = findGroup(g, id);
    if (f) return f;
  }
  return null;
}

// ── симуляция обработки: метрики 60 fps ───────────────────────────
let t = 0;
setInterval(() => {
  t += 1 / 60;
  const m = {
    "lighting/level": clamp((values["lighting/dim"] ?? 0) * (0.9 + 0.1 * Math.sin(t * 3)), 0, 1),
    "lighting/temp": 35 + 20 * (values["lighting/dim"] ?? 0) + 2 * Math.sin(t * 0.7),
    "lighting/movers/zoomed": (values["lighting/movers/zoom"] ?? 5) * (0.98 + 0.02 * Math.sin(t * 2)),
    "video/fb_out": clamp((values["video/feedback"] ?? 0) * (0.85 + 0.15 * Math.sin(t * 5)), 0, 1),
    "video/fps": 60 + Math.round(3 * Math.sin(t * 9)),
    "audio/peak": (values["audio/gain"] ?? 0) * -3 + 2 * Math.sin(t * 7),
    "audio/rms": (values["audio/gain"] ?? 0) * 0.6 * (0.7 + 0.3 * Math.sin(t * 11)),
  };
  broadcast({ type: "metrics", values: m, seq: ++seq });
}, 1000 / 60);

function clamp(v, a, b) {
  return Math.min(b, Math.max(a, v));
}

server.listen(PORT, () => {
  console.log(`[mock] TouchDesigner mock on http://localhost:${PORT}`);
  console.log(`[mock] discover: http://localhost:${PORT}/touchgui/discover`);
  console.log(`[mock] ws: ws://localhost:${PORT}/`);
});
