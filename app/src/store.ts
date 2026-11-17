// Глобальное хранилище приложения: соединение с TD, схема, значения, пресеты, настройки.
import { create } from "zustand";
import type {
  Preset,
  Schema,
  ValueMap,
} from "@/protocol/types";
import type { Lang } from "@/i18n";

export type ConnStatus = "offline" | "connecting" | "online";

export type ThemeMode = "system" | "light" | "dark";
export type KnobStyle = "arc" | "slider";

export interface Settings {
  lang: Lang;
  theme: ThemeMode;
  accent: string; // seed-цвет Material You
  knobStyle: KnobStyle;
  scanRange: string; // "192.168.1" для автопоиска
}

interface AppState {
  // ── соединение ──
  status: ConnStatus;
  wsUrl: string | null;
  latency: number | null;
  seq: number;
  history: string[]; // недавние адреса "ip:port"

  // ── данные ──
  schema: Schema | null;
  values: ValueMap; // входные значения (крутки)
  metrics: ValueMap; // выходные значения (метрики)
  presets: Preset[];

  // ── настройки UI ──
  settings: Settings;
  route: Route;

  // ── действия ──
  setStatus: (s: ConnStatus) => void;
  setWsUrl: (url: string | null) => void;
  setLatency: (ms: number) => void;
  setSeq: (seq: number) => void;
  addHistory: (addr: string) => void;
  applyWelcome: (schema: Schema, values: ValueMap, presets: Preset[], seq: number) => void;
  applySchema: (schema: Schema) => void;
  applyValues: (values: ValueMap, seq: number) => void;
  applyMetrics: (values: ValueMap, seq: number) => void;
  applyPresets: (presets: Preset[]) => void;
  /** Локально оптимистичное значение (до эха от TD) */
  setLocalValue: (id: string, value: number | string | boolean | number[]) => void;
  patchSettings: (p: Partial<Settings>) => void;
  navigate: (route: Route) => void;
  reset: () => void;
}

export type Route =
  | { name: "dashboard" }
  | { name: "group"; id: string }
  | { name: "presets" }
  | { name: "settings" }
  | { name: "connect" };

const SETTINGS_KEY = "touchgui.settings.v1";
const HISTORY_KEY = "touchgui.history.v1";

function loadSettings(): Settings {
  const base: Settings = {
    lang: "ru",
    theme: "system",
    accent: "#6750A4",
    knobStyle: "arc",
    scanRange: "192.168.1",
  };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...base, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* ignore */
  }
  return base;
}

function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw) return JSON.parse(raw) as string[];
  } catch {
    /* ignore */
  }
  return [];
}

function saveHistory(h: string[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
  } catch {
    /* ignore */
  }
}

export const useApp = create<AppState>()((set, get) => ({
  status: "offline",
  wsUrl: null,
  latency: null,
  seq: 0,

  schema: null,
  values: {},
  metrics: {},
  presets: [],

  settings: loadSettings(),
  route: { name: "dashboard" },
  history: loadHistory(),

  setStatus: (status) => set({ status }),
  setWsUrl: (wsUrl) => set({ wsUrl }),
  setLatency: (latency) => set({ latency }),
  setSeq: (seq) => set({ seq }),

  addHistory: (addr) => {
    const h = [addr, ...get().history.filter((a) => a !== addr)].slice(0, 8);
    saveHistory(h);
    set({ history: h });
  },

  applyWelcome: (schema, values, presets, seq) =>
    set({ schema, values, metrics: {}, presets, seq, status: "online" }),

  applySchema: (schema) => set({ schema }),

  applyValues: (values, seq) =>
    set((st) => ({ values: { ...st.values, ...values }, seq: Math.max(st.seq, seq) })),

  applyMetrics: (values, seq) =>
    set((st) => ({ metrics: { ...st.metrics, ...values }, seq: Math.max(st.seq, seq) })),

  applyPresets: (presets) => set({ presets }),

  setLocalValue: (id, value) =>
    set((st) => ({ values: { ...st.values, [id]: value } })),

  patchSettings: (p) => {
    const settings = { ...get().settings, ...p };
    saveSettings(settings);
    set({ settings });
  },

  navigate: (route) => set({ route }),

  reset: () =>
    set({
      status: "offline",
      schema: null,
      values: {},
      metrics: {},
      presets: [],
      seq: 0,
      latency: null,
    }),
}));
