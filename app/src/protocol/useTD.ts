// Хук: единый экземпляр TDClient, привязанный к zustand-стору.
import { useEffect, useMemo, useRef } from "react";
import { TDClient, wsUrlFor } from "@/protocol/client";
import type { ServerMessage } from "@/protocol/types";
import { useApp } from "@/store";

let singleton: TDClient | null = null;

function getClient(): TDClient {
  if (!singleton) {
    singleton = new TDClient({
      onMessage: (msg) => handleMessage(msg),
      onStatus: (status) => useApp.getState().setStatus(status),
      onLatency: (ms) => useApp.getState().setLatency(ms),
    });
  }
  return singleton;
}

/** Отправка сообщения без хука (для обработчиков событий). */
export function sendToTD(msg: import("@/protocol/types").ClientMessage): boolean {
  return getClient().send(msg);
}

function handleMessage(msg: ServerMessage) {
  const st = useApp.getState();
  switch (msg.type) {
    case "welcome":
      st.applyWelcome(msg.schema, msg.values, msg.presets, msg.seq);
      break;
    case "schema":
      st.applySchema(msg.schema);
      break;
    case "values":
      st.applyValues(msg.values, msg.seq);
      break;
    case "metrics":
      st.applyMetrics(msg.values, msg.seq);
      break;
    case "presets":
      st.applyPresets(msg.presets);
      break;
    case "ack":
      // ошибки записи от TD (например битый путь) — логируем в консоль
      if (!msg.ok) console.warn(`[TouchGUI] ack error (${msg.for}):`, msg.error);
      break;
    case "error":
      console.warn("[TouchGUI] server error:", msg.message);
      break;
    case "pong":
      break;
  }
}

export function useTD() {
  const client = useMemo(() => getClient(), []);
  const status = useApp((s) => s.status);

  // Отключение при размонтировании приложения (не при каждом рендере)
  useEffect(() => {
    return () => {
      /* клиент живёт дольше компонента */
    };
  }, []);

  const connect = (addr: string) => {
    const url = wsUrlFor(addr);
    const st = useApp.getState();
    st.setWsUrl(url);
    st.addHistory(addr);
    client.connect(url);
  };

  const send = client.send.bind(client);

  const disconnect = () => {
    client.disconnect();
    useApp.getState().reset();
  };

  return { client, connect, disconnect, send, status };
}

/** Установить значение контрола: локально сразу + в TD. */
export function useSetControl() {
  const ref = useRef<TDClient | null>(null);
  ref.current = getClient();

  return (id: string, value: number | string | boolean | number[]) => {
    useApp.getState().setLocalValue(id, value);
    const ok = ref.current?.send({ type: "set", id, value }) ?? false;
    if (!ok) console.warn("[TouchGUI] not connected, value kept locally:", id);
  };
}
