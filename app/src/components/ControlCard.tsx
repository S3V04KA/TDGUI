// Карточка элемента управления: подпись, контрол, выходная метрика,
// звезда (в быстрые настройки), инлайн-разворот крупных виджетов.
import { useState } from "react";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import StarIcon from "@mui/icons-material/Star";
import StarOutlineIcon from "@mui/icons-material/StarOutline";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import UnfoldLessIcon from "@mui/icons-material/UnfoldLess";
import type { ControlDef } from "@/protocol/types";
import { labelOf, type Lang } from "@/i18n";
import { useApp } from "@/store";
import { useSetControl } from "@/protocol/useTD";
import { Knob } from "@/components/Knob";
import {
  ButtonControl,
  ColorControl,
  SelectControl,
  TextControl,
  ToggleControl,
  XYControl,
} from "@/components/controls";

export interface ControlCardProps {
  def: ControlDef;
  /** id группы — для звёзд быстрых настроек */
  groupId: string;
  lang: Lang;
  compact?: boolean;
}

export function ControlCard({ def, groupId, lang, compact }: ControlCardProps) {
  const value = useApp((s) => s.values[def.id]);
  const knobStyle = useApp((s) => s.settings.knobStyle);
  const metrics = useApp((s) => s.metrics);
  const set = useSetControl();
  const [expanded, setExpanded] = useState(false);

  const group = useApp((s) =>
    s.schema ? findGroup(s.schema.root, groupId) : null
  );
  const starred = !!group?.quick?.includes(def.id);

  const toggleStar = useStarToggle(groupId);

  const metricDef = def.metric
    ? findMetric(useApp.getState().schema?.root ?? null, def.metric)
    : undefined;
  const metricValue = def.metric ? metrics[def.metric] : undefined;

  const isLarge = def.type === "xy" || def.type === "color" || !!def.metric;
  const canExpand = (def.expandable ?? true) && isLarge;

  const label = labelOf(def.label, lang, def.id);

  const body = () => {
    switch (def.type) {
      case "knob":
        return (
          <Knob
            value={typeof value === "number" ? value : (def.min ?? 0)}
            min={def.min ?? 0}
            max={def.max ?? 1}
            step={def.step}
            precision={def.precision}
            unit={def.unit}
            style={knobStyle}
            size={compact ? 64 : 76}
            onChange={(v) => set(def.id, v)}
          />
        );
      case "slider":
        return (
          <Knob
            value={typeof value === "number" ? value : (def.min ?? 0)}
            min={def.min ?? 0}
            max={def.max ?? 1}
            step={def.step}
            precision={def.precision}
            unit={def.unit}
            style="slider"
            onChange={(v) => set(def.id, v)}
          />
        );
      case "toggle":
        return (
          <ToggleControl
            value={!!value}
            onChange={(v) => set(def.id, v)}
          />
        );
      case "button":
        return (
          <ButtonControl
            label={label}
            onPulse={() => set(def.id, 1)}
          />
        );
      case "select":
        return def.options ? (
          <SelectControl
            value={String(value ?? "")}
            options={def.options}
            lang={lang}
            onChange={(v) => set(def.id, v)}
          />
        ) : null;
      case "text":
        return (
          <TextControl
            value={String(value ?? "")}
            onChange={(v) => set(def.id, v)}
          />
        );
      case "xy":
        return (
          <XYControl
            value={Array.isArray(value) ? (value as number[]) : [0.5, 0.5]}
            onChange={(v) => set(def.id, v)}
            size={expanded ? Math.min(240, 300) : compact ? 110 : 140}
          />
        );
      case "color":
        return (
          <ColorControl
            value={String(value ?? "#ffffff")}
            onChange={(v) => set(def.id, v)}
          />
        );
      case "metric":
        return null;
    }
  };

  return (
    <Box
      sx={{
        bgcolor: "var(--tg-surface-container)",
        borderRadius: 3,
        px: compact ? 0.75 : 1.25,
        py: compact ? 0.75 : 1,
        display: "flex",
        flexDirection: "column",
        gap: 0.75,
        minWidth: 0,
        position: "relative",
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      {/* шапка */}
      <Box sx={{ display: "flex", alignItems: "center", gap: compact ? 0.25 : 0.5 }}>
        <Typography
          variant="caption"
          sx={{
            color: "text.secondary",
            fontWeight: 600,
            letterSpacing: 0.2,
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            ...(compact
              ? {
                  // в узкой карточке подпись переносится на 2 строки, а не обрезается
                  display: "-webkit-box" as const,
                  WebkitBoxOrient: "vertical" as const,
                  WebkitLineClamp: 2,
                  whiteSpace: "normal" as const,
                  overflowWrap: "anywhere" as const,
                }
              : { whiteSpace: "nowrap" as const }),
          }}
        >
          {label}
          {def.unit && def.type !== "knob" && def.type !== "slider" ? (
            <span style={{ opacity: 0.6, marginLeft: 4 }}>{def.unit}</span>
          ) : null}
        </Typography>
        {canExpand && !compact && (
          <Tooltip title={expanded ? "Свернуть" : "Развернуть"}>
            <IconButton
              size="small"
              onClick={() => setExpanded((e) => !e)}
              sx={{ color: "text.secondary" }}
            >
              {expanded ? <UnfoldLessIcon fontSize="small" /> : <UnfoldMoreIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title={starred ? "Убрать из быстрых" : "В быстрые настройки"}>
          <IconButton
            size="small"
            onClick={() => toggleStar(def.id)}
            sx={{
              color: starred ? "var(--tg-primary)" : "text.disabled",
              ...(compact ? { p: 0.4 } : null),
            }}
          >
            {starred ? <StarIcon fontSize="small" /> : <StarOutlineIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Box>

      {/* тело */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: def.type === "button" || def.type === "toggle" ? "flex-start" : "center",
          gap: 1,
          minHeight: compact ? 64 : 84,
          flexWrap: "wrap",
        }}
      >
        {def.type === "metric" ? null : body()}
      </Box>

      {/* выходное значение после обработки */}
      {def.metric && metricDef && (
        <MetricLine
          label={labelOf(metricDef.label, lang)}
          value={typeof metricValue === "number" ? metricValue : undefined}
          unit={metricDef.unit}
          precision={metricDef.precision}
          big={expanded}
        />
      )}
    </Box>
  );
}

function MetricLine({
  label,
  value,
  unit,
  precision,
  big,
}: {
  label: string;
  value: number | undefined;
  unit?: string;
  precision?: number;
  big?: boolean;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 1,
        bgcolor: "var(--tg-secondary-container)",
        color: "var(--tg-on-secondary-container)",
        borderRadius: 2,
        px: 1,
        py: 0.4,
      }}
    >
      <Typography variant="caption" sx={{ opacity: 0.8 }}>
        {label}
      </Typography>
      <Typography
        variant={big ? "h6" : "body2"}
        sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}
      >
        {value !== undefined && isFinite(value)
          ? value.toFixed(precision ?? 2)
          : "—"}
        {unit && (
          <Typography component="span" variant="caption" sx={{ opacity: 0.7, ml: 0.5 }}>
            {unit}
          </Typography>
        )}
      </Typography>
    </Box>
  );
}

// ── вспомогательные: поиск по дереву схемы ─────────────────────────
import type { GroupDef, MetricDef, Schema } from "@/protocol/types";

export function findGroup(root: GroupDef, id: string): GroupDef | null {
  if (root.id === id) return root;
  for (const g of root.groups ?? []) {
    const f = findGroup(g, id);
    if (f) return f;
  }
  return null;
}

export function findMetric(root: GroupDef | null, id: string): MetricDef | null {
  if (!root) return null;
  for (const m of root.metrics ?? []) if (m.id === id) return m;
  for (const g of root.groups ?? []) {
    const f = findMetric(g, id);
    if (f) return f;
  }
  return null;
}

/** Звезда: отправка config.quick в TD + локальный апдейт схемы */
function useStarToggle(groupId: string) {
  const client = useTDClient();
  const applySchema = useApp((s) => s.applySchema);

  return (controlId: string) => {
    const st = useApp.getState();
    const schema = st.schema;
    if (!schema) return;
    const g = findGroup(schema.root, groupId);
    if (!g) return;
    const cur = g.quick ?? [];
    const next = cur.includes(controlId)
      ? cur.filter((c) => c !== controlId)
      : [...cur, controlId];
    // локально — сразу
    const newRoot = cloneWithQuick(schema.root, groupId, next);
    applySchema({ ...schema, root: newRoot });
    // в TD — на сохранение
    client?.send({ type: "config.quick", groupId, quick: next });
  };
}

function cloneWithQuick(root: GroupDef, id: string, quick: string[]): GroupDef {
  if (root.id === id) return { ...root, quick };
  if (!root.groups) return root;
  let changed = false;
  const groups = root.groups.map((g) => {
    const n = cloneWithQuick(g, id, quick);
    if (n !== g) changed = true;
    return n;
  });
  return changed ? { ...root, groups } : root;
}

// клиент-синглтон доступен через useTD
import { useTD } from "@/protocol/useTD";
function useTDClient() {
  const { client } = useTD();
  return client;
}
