// Типы протокола TouchGUI: веб <-> TouchDesigner (WebSocket, JSON-сообщения)

export type ControlType =
  | "knob"
  | "slider"
  | "toggle"
  | "button"
  | "select"
  | "xy"
  | "color"
  | "text"
  | "metric";

/** Описание одного элемента управления (крутки) */
export interface ControlDef {
  /** Уникальный id в пределах схемы, обычно путь вида "group/sub/param" */
  id: string;
  /** Имя пользовательского параметра в TD (par.name) */
  par: string;
  type: ControlType;
  /** Локализованные подписи: {ru, en} */
  label: Record<string, string>;
  min?: number;
  max?: number;
  /** Шаг (для int/крупных значений) */
  step?: number;
  /** Единица измерения: %, мс, гц... */
  unit?: string;
  /** Число знаков после запятой при выводе */
  precision?: number;
  /** Варианты для select */
  options?: { value: string; label: Record<string, string> }[];
  /** Идентификатор метрики, которую нужно выводить рядом (выходное значение после обработки) */
  metric?: string;
  /** Разрешён ли разворот крупного виджета (xy, color, metric) */
  expandable?: boolean;
}

/** Метрика: выходное значение после обработки в TD */
export interface MetricDef {
  id: string;
  label: Record<string, string>;
  unit?: string;
  precision?: number;
  min?: number;
  max?: number;
}

/** Схема: группа (категория) или подгруппа */
export interface GroupDef {
  id: string;
  label: Record<string, string>;
  /** Значок Material Symbols (название) */
  icon?: string;
  /** Подгруппы */
  groups?: GroupDef[];
  controls?: ControlDef[];
  metrics?: MetricDef[];
  /**
   * Идентификаторы контроллов/метрик, показываемых как «быстрые настройки»
   * на главном дашборде. Задаётся в TD (конфиг) или правится из веба.
   */
  quick?: string[];
}

/** Полная схема интерфейса, приходит из TD */
export interface Schema {
  version: number;
  /** Название проекта TD */
  project: string;
  root: GroupDef;
}

/** Пресет */
export interface Preset {
  id: string;
  name: string;
  /** id контроллов -> значение */
  values: Record<string, unknown>;
  createdAt: number;
}

/** Значение параметра */
export type ValueMap = Record<string, number | string | boolean | number[]>;

// ── Сообщения клиент -> TD ──────────────────────────────────────────
export type ClientMessage =
  | { type: "hello"; client: string; proto: number }
  | { type: "set"; id: string; value: number | string | boolean | number[] }
  | { type: "get" }
  | { type: "preset.save"; name: string; values: Record<string, unknown> }
  | { type: "preset.load"; id: string }
  | { type: "preset.delete"; id: string }
  | { type: "preset.rename"; id: string; name: string }
  | { type: "config.quick"; groupId: string; quick: string[] }
  | { type: "config.order"; groupId: string; order: string[] }
  | { type: "ping"; ts: number };

// ── Сообщения TD -> клиент ──────────────────────────────────────────
export type ServerMessage =
  | { type: "welcome"; schema: Schema; values: ValueMap; presets: Preset[]; seq: number }
  | { type: "schema"; schema: Schema }
  | { type: "values"; values: ValueMap; seq: number }
  | { type: "metrics"; values: ValueMap; seq: number }
  | { type: "presets"; presets: Preset[] }
  | { type: "ack"; for: string; ok: boolean; error?: string }
  | { type: "pong"; ts: number }
  | { type: "error"; message: string };

/** Результат автопоиска TD в локальной сети */
export interface DiscoveredServer {
  ip: string;
  port: number;
  project: string;
}
