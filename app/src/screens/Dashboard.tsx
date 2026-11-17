// Дашборд: карточки категорий с быстрыми настройками и метриками,
// плюс панель пресетов. Тап по категории → детальный экран.
import { Box, Chip, Paper, Typography } from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import InsightsIcon from "@mui/icons-material/Insights";
import type { GroupDef } from "@/protocol/types";
import { labelOf } from "@/i18n";
import { useApp, type Route } from "@/store";
import { ControlCard, findGroup } from "@/components/ControlCard";
import { MetricDisplay } from "@/components/controls";

export function Dashboard() {
  const schema = useApp((s) => s.schema);
  const lang = useApp((s) => s.settings.lang);
  const presets = useApp((s) => s.presets);
  const metrics = useApp((s) => s.metrics);
  const navigate = useApp((s) => s.navigate);
  const loadPreset = usePresetLoad();

  if (!schema) return null;

  const cats = schema.root.groups ?? [];

  // все метрики проекта для обзора на главной
  const allMetrics = collectMetrics(schema.root);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pb: 2 }}>
      {/* ── обзор метрик ── */}
      {allMetrics.length > 0 && (
        <Paper
          variant="outlined"
          sx={{
            p: 1.5,
            borderRadius: 3,
            bgcolor: "var(--tg-surface-container)",
            border: "none",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1 }}>
            <InsightsIcon fontSize="small" sx={{ color: "var(--tg-primary)" }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {labelOf({ ru: "Показатели", en: "Metrics" }, lang)}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            {allMetrics.map((m) => (
              <MetricDisplay
                key={m.id}
                def={m}
                value={typeof metrics[m.id] === "number" ? (metrics[m.id] as number) : undefined}
                lang={lang}
                sparkWidth={110}
              />
            ))}
          </Box>
        </Paper>
      )}

      {/* ── пресеты (быстрый доступ) ── */}
      {presets.length > 0 && (
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
            {labelOf({ ru: "Пресеты", en: "Presets" }, lang)}
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            {presets.slice(0, 8).map((p) => (
              <Chip
                key={p.id}
                label={p.name}
                color="primary"
                variant="outlined"
                onClick={() => loadPreset(p.id)}
                sx={{ fontWeight: 600 }}
              />
            ))}
          </Box>
        </Box>
      )}

      {/* ── категории ── */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(auto-fill, minmax(300px, 1fr))",
            md: "repeat(auto-fill, minmax(340px, 1fr))",
          },
          gap: 1.5,
        }}
      >
        {cats.map((g) => (
          <CategoryCard
            key={g.id}
            group={g}
            lang={lang}
            onOpen={() => navigate({ name: "group", id: g.id })}
          />
        ))}
      </Box>
    </Box>
  );
}

function CategoryCard({
  group,
  lang,
  onOpen,
}: {
  group: GroupDef;
  lang: "ru" | "en";
  onOpen: () => void;
}) {
  const quick = group.quick ?? [];
  const controls = (group.controls ?? []).filter((c) => quick.includes(c.id));
  const subGroups = group.groups ?? [];
  const groupMetrics = collectMetrics(group);

  return (
    <Paper
      variant="outlined"
      onClick={onOpen}
      sx={{
        p: 1.5,
        borderRadius: 3,
        bgcolor: "var(--tg-surface-container)",
        border: "1px solid",
        borderColor: "divider",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 1.25,
        transition: "transform .1s, box-shadow .1s",
        "&:active": { transform: "scale(0.99)" },
        "&:hover": { boxShadow: "0 2px 10px rgba(0,0,0,.15)" },
      }}
    >
      {/* заголовок */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            {labelOf(group.label, lang)}
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {quick.length} {labelOf({ ru: "быстрых", en: "quick" }, lang)}
            {subGroups.length > 0 &&
              ` · ${subGroups.length} ${labelOf({ ru: "подгрупп", en: "subgroups" }, lang)}`}
          </Typography>
        </Box>
        <ChevronRightIcon sx={{ color: "text.disabled" }} />
      </Box>

      {/* метрики категории */}
      {groupMetrics.length > 0 && (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
          {groupMetrics.slice(0, 3).map((m) => (
            <MetricPill key={m.id} id={m.id} label={labelOf(m.label, lang)} unit={m.unit} precision={m.precision} />
          ))}
        </Box>
      )}

      {/* быстрые крутилки */}
      {controls.length > 0 ? (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
            gap: 1,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {controls.slice(0, 4).map((c) => (
            <ControlCard key={c.id} def={c} groupId={group.id} lang={lang} compact />
          ))}
        </Box>
      ) : (
        <Typography variant="caption" sx={{ color: "text.disabled", fontStyle: "italic" }}>
          {labelOf({ ru: "Отметьте параметры звёздой", en: "Star some controls" }, lang)}
        </Typography>
      )}
    </Paper>
  );
}

function MetricPill({
  id,
  label,
  unit,
  precision,
}: {
  id: string;
  label: string;
  unit?: string;
  precision?: number;
}) {
  const v = useApp((s) => s.metrics[id]);
  const num = typeof v === "number" && isFinite(v) ? v.toFixed(precision ?? 2) : "—";
  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 0.75,
        bgcolor: "var(--tg-secondary-container)",
        color: "var(--tg-on-secondary-container)",
        borderRadius: 1.5,
        px: 1,
        py: 0.25,
      }}
    >
      <Typography variant="caption" sx={{ opacity: 0.8 }}>
        {label}
      </Typography>
      <Typography variant="caption" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
        {num}
        {unit && <span style={{ opacity: 0.7, marginLeft: 2 }}>{unit}</span>}
      </Typography>
    </Box>
  );
}

// ── helpers ────────────────────────────────────────────────────────
import type { MetricDef } from "@/protocol/types";

export function collectMetrics(root: GroupDef, prefix = ""): MetricDef[] {
  const out: MetricDef[] = [];
  for (const m of root.metrics ?? []) out.push(m);
  for (const g of root.groups ?? []) out.push(...collectMetrics(g));
  return out;
}

function usePresetLoad() {
  const { send } = useTD();
  return (id: string) => send({ type: "preset.load", id });
}

import { useTD } from "@/protocol/useTD";
