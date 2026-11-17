// Экран группы: подгруппы (проваливаемся внутрь), контролы, метрики.
import { Box, Breadcrumbs, Button, Chip, Paper, Typography } from "@mui/material";
import HomeIcon from "@mui/icons-material/Home";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import { useState } from "react";
import type { GroupDef } from "@/protocol/types";
import { labelOf } from "@/i18n";
import { useApp } from "@/store";
import { ControlCard, findGroup } from "@/components/ControlCard";
import { MetricDisplay } from "@/components/controls";

export function GroupScreen({ id }: { id: string }) {
  const schema = useApp((s) => s.schema);
  const lang = useApp((s) => s.settings.lang);
  const navigate = useApp((s) => s.navigate);
  const [reorder, setReorder] = useState(false);

  if (!schema) return null;

  const chain = pathTo(schema.root, id);
  if (!chain) {
    navigate({ name: "dashboard" });
    return null;
  }
  const group = chain[chain.length - 1];
  const parent = chain.length > 1 ? chain[chain.length - 2] : null;

  const subGroups = group.groups ?? [];
  const controls = group.controls ?? [];
  const metrics = group.metrics ?? [];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pb: 2 }}>
      {/* хлебные крошки */}
      <Breadcrumbs
        separator="›"
        sx={{ "& a": { cursor: "pointer", textDecoration: "none" } }}
      >
        <Chip
          icon={<HomeIcon sx={{ fontSize: 15 }} />}
          label={labelOf({ ru: "Главная", en: "Home" }, lang)}
          size="small"
          onClick={() => navigate({ name: "dashboard" })}
          sx={{ borderRadius: 2 }}
        />
        {chain.slice(1).map((g, i) => {
          const last = i === chain.length - 2;
          return (
            <Chip
              key={g.id}
              label={labelOf(g.label, lang)}
              size="small"
              color={last ? "primary" : "default"}
              variant={last ? "filled" : "outlined"}
              onClick={last ? undefined : () => navigate({ name: "group", id: g.id })}
              sx={{ borderRadius: 2, fontWeight: 600 }}
            />
          );
        })}
      </Breadcrumbs>

      {/* заголовок + переключатель порядка */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, flex: 1 }}>
          {labelOf(group.label, lang)}
        </Typography>
        <Button
          size="small"
          variant={reorder ? "contained" : "outlined"}
          onClick={() => setReorder((r) => !r)}
        >
          {labelOf({ ru: "Порядок", en: "Order" }, lang)}
        </Button>
      </Box>

      {/* ── подгруппы ── */}
      {subGroups.length > 0 && (
        <Box>
          <SectionTitle>{labelOf({ ru: "Подгруппы", en: "Subgroups" }, lang)}</SectionTitle>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            {subGroups.map((sg) => (
              <Chip
                key={sg.id}
                label={`${labelOf(sg.label, lang)} (${(sg.controls ?? []).length})`}
                color="primary"
                variant="outlined"
                onClick={() => navigate({ name: "group", id: sg.id })}
                sx={{ fontWeight: 600, borderRadius: 2 }}
              />
            ))}
          </Box>
        </Box>
      )}

      {/* ── метрики группы ── */}
      {metrics.length > 0 && (
        <Box>
          <SectionTitle>{labelOf({ ru: "Показатели", en: "Metrics" }, lang)}</SectionTitle>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            {metrics.map((m) => (
              <GroupMetric key={m.id} def={m} lang={lang} />
            ))}
          </Box>
        </Box>
      )}

      {/* ── контролы ── */}
      {controls.length > 0 && (
        <Box>
          <SectionTitle>
            {labelOf({ ru: "Параметры", en: "Controls" }, lang)}
            {reorder && ` — ${labelOf({ ru: "перемещение", en: "reordering" }, lang)}`}
          </SectionTitle>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "repeat(auto-fill, minmax(150px, 1fr))",
                md: "repeat(auto-fill, minmax(180px, 1fr))",
                lg: "repeat(auto-fill, minmax(200px, 1fr))",
              },
              gap: 1.25,
            }}
          >
            {controls.map((c, i) => (
              <Box key={c.id} sx={{ position: "relative" }}>
                <ControlCard def={c} groupId={group.id} lang={lang} />
                {reorder && (
                  <Box
                    sx={{
                      position: "absolute",
                      top: 4,
                      right: 4,
                      display: "flex",
                      gap: 0.25,
                      zIndex: 2,
                    }}
                  >
                    <MiniBtn
                      disabled={i === 0}
                      onClick={() => moveControl(group, i, -1)}
                      label="↑"
                    />
                    <MiniBtn
                      disabled={i === controls.length - 1}
                      onClick={() => moveControl(group, i, 1)}
                      label="↓"
                    />
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* родительская кнопка назад вверху уже есть в шапке приложения,
          здесь — дополнительная навигация вверх */}
      {parent && (
        <Box sx={{ display: "flex", justifyContent: "flex-start" }}>
          <Button
            variant="outlined"
            startIcon={<ArrowUpwardIcon />}
            onClick={() => navigate({ name: "group", id: parent.id })}
          >
            {labelOf({ ru: "Уровень выше", en: "One level up" }, lang)}
          </Button>
        </Box>
      )}
    </Box>
  );
}

function MiniBtn({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 26,
        height: 26,
        borderRadius: 8,
        border: "1px solid var(--tg-outline-variant)",
        background: "var(--tg-surface-high)",
        color: "var(--tg-on-surface)",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
        fontSize: 13,
        lineHeight: 1,
        padding: 0,
      }}
    >
      {label}
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      variant="subtitle2"
      sx={{
        fontWeight: 700,
        color: "text.secondary",
        mb: 0.75,
        letterSpacing: 0.3,
        textTransform: "uppercase",
        fontSize: 11,
      }}
    >
      {children}
    </Typography>
  );
}

function GroupMetric({
  def,
  lang,
}: {
  def: import("@/protocol/types").MetricDef;
  lang: "ru" | "en";
}) {
  const v = useApp((s) => s.metrics[def.id]);
  return (
    <MetricDisplay
      def={def}
      value={typeof v === "number" ? (v as number) : undefined}
      lang={lang}
      sparkWidth={130}
    />
  );
}

/** Цепочка групп от корня до id */
function pathTo(root: GroupDef, id: string): GroupDef[] | null {
  if (root.id === id) return [root];
  for (const g of root.groups ?? []) {
    const sub = pathTo(g, id);
    if (sub) return [root, ...sub];
  }
  return null;
}

/** Перемещение контрола в порядке (отправка config.order в TD) */
function moveControl(group: GroupDef, index: number, dir: -1 | 1) {
  const st = useApp.getState();
  const schema = st.schema;
  if (!schema) return;
  const controls = group.controls ?? [];
  const j = index + dir;
  if (j < 0 || j >= controls.length) return;
  const arr = [...controls];
  [arr[index], arr[j]] = [arr[j], arr[index]];
  const order = arr.map((c) => c.id);

  // локальный апдейт
  const newRoot = cloneWithOrder(schema.root, group.id, order);
  st.applySchema({ ...schema, root: newRoot });

  // отправка в TD
  sendToTD({ type: "config.order", groupId: group.id, order });
}

function cloneWithOrder(root: GroupDef, id: string, order: string[]): GroupDef {
  if (root.id === id && root.controls) {
    const byId = new Map(root.controls.map((c) => [c.id, c]));
    const controls = order.map((oid) => byId.get(oid)).filter(Boolean) as typeof root.controls;
    // добавить новые, которых не было в order
    for (const c of root.controls) if (!order.includes(c.id)) controls.push(c);
    return { ...root, controls };
  }
  if (!root.groups) return root;
  let changed = false;
  const groups = root.groups.map((g) => {
    const n = cloneWithOrder(g, id, order);
    if (n !== g) changed = true;
    return n;
  });
  return changed ? { ...root, groups } : root;
}

import { sendToTD } from "@/protocol/useTD";
