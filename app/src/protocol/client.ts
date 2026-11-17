// Клиент WebSocket для TouchDesigner: подключение, авто-переподключение,
// автопоиск сервера TD в локальной сети через HTTP-эндпоинт /touchgui/discover.
import type {
  ClientMessage,
  DiscoveredServer,
  ServerMessage,
} from "@/protocol/types";

type Handlers = {
  onMessage: (msg: ServerMessage) => void;
  onStatus: (status: "offline" | "connecting" | "online") => void;
  onLatency: (ms: number) => void;
};

const RECONNECT_BASE_MS = 800;
const RECONNECT_MAX_MS = 10000;
const PING_INTERVAL_MS = 3000;

export class TDClient {
  private ws: WebSocket | null = null;
  private handlers: Handlers;
  private url: string | null = null;
  private attempts = 0;
  private wantOpen = false;
  private pingTimer: number | null = null;
  private reconnectTimer: number | null = null;

  constructor(handlers: Handlers) {
    this.handlers = handlers;
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  connect(url: string) {
    this.url = url;
    this.wantOpen = true;
    this.attempts = 0;
    this.open();
  }

  private open() {
    if (!this.url || !this.wantOpen) return;
    this.cleanupSocket();
    this.handlers.onStatus("connecting");

    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.attempts = 0;
      this.handlers.onStatus("online");
      this.send({ type: "hello", client: "web", proto: 1 });
      this.startPing();
    };

    ws.onmessage = (ev) => {
      if (typeof ev.data !== "string") return;
      let msg: ServerMessage;
      try {
        msg = JSON.parse(ev.data) as ServerMessage;
      } catch {
        return;
      }
      if (msg.type === "pong") {
        this.handlers.onLatency(Math.max(0, Date.now() - msg.ts));
        return;
      }
      this.handlers.onMessage(msg);
    };

    ws.onclose = () => {
      this.stopPing();
      if (this.ws === ws) this.ws = null;
      if (this.wantOpen) {
        this.handlers.onStatus("offline");
        this.scheduleReconnect();
      }
    };

    ws.onerror = () => {
      /* onclose отработает */
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer !== null || !this.wantOpen) return;
    const delay = Math.min(
      RECONNECT_BASE_MS * 2 ** this.attempts,
      RECONNECT_MAX_MS
    );
    this.attempts++;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  private startPing() {
    this.stopPing();
    this.pingTimer = window.setInterval(() => {
      this.send({ type: "ping", ts: Date.now() });
    }, PING_INTERVAL_MS);
  }

  private stopPing() {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private cleanupSocket() {
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onclose = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
  }

  send(msg: ClientMessage): boolean {
    if (!this.connected) return false;
    try {
      this.ws!.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }

  disconnect() {
    this.wantOpen = false;
    this.stopPing();
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cleanupSocket();
    this.handlers.onStatus("offline");
  }
}

/** Проверка одного адреса: GET /touchgui/discover */
async function probe(
  ip: string,
  port: number,
  timeoutMs = 900
): Promise<DiscoveredServer | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`http://${ip}:${port}/touchgui/discover`, {
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!r.ok) return null;
    const data = (await r.json()) as { app?: string; project?: string };
    if (data?.app === "touchgui") {
      return { ip, port, project: data.project ?? "TouchDesigner" };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Автопоиск TD в локальной сети.
 * Сканирует заданный диапазон (например "192.168.1") на порту по всем
 * типовым портам проекта. Возвращает найденные серверы.
 */
export async function discover(
  rangePrefix: string,
  ports: number[],
  onProgress?: (done: number, total: number) => void
): Promise<DiscoveredServer[]> {
  const m = rangePrefix.trim().match(/^(\d+\.\d+\.\d+)$/);
  if (!m) return [];
  const hosts: string[] = [];
  for (let i = 1; i <= 254; i++) hosts.push(`${m[1]}.${i}`);

  const total = hosts.length * ports.length;
  let done = 0;
  const found: DiscoveredServer[] = [];
  const CONCURRENCY = 48;

  let idx = 0;
  const worker = async () => {
    while (idx < hosts.length) {
      const host = hosts[idx++];
      for (const port of ports) {
        const res = await probe(host, port);
        done++;
        if (res) found.push(res);
      }
      onProgress?.(done, total);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, hosts.length) }, worker)
  );
  return found;
}

/** Быстрая проверка конкретного адреса при ручном вводе */
export async function probeAddress(
  hostport: string,
  defaultPort = 9876
): Promise<string | null> {
  const [ip, p] = splitAddress(hostport, defaultPort);
  const res = await probe(ip, p, 2500);
  return res ? hostport : null;
}

export function splitAddress(
  addr: string,
  defaultPort = 9876
): [string, number] {
  const s = addr.trim().replace(/^wss?:\/\//, "").replace(/\/.*$/, "");
  const i = s.lastIndexOf(":");
  if (i > 0) {
    const port = parseInt(s.slice(i + 1), 10);
    if (!isNaN(port)) return [s.slice(0, i), port];
  }
  return [s, defaultPort];
}

export function wsUrlFor(addr: string, defaultPort = 9876): string {
  const [ip, port] = splitAddress(addr, defaultPort);
  return `ws://${ip}:${port}/`;
}
