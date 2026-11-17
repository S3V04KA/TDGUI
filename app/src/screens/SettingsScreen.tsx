// Настройки: тема, акцент Material You, язык, стиль крутилок, соединение.
import {
  Box,
  Button,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Select,
  Slider,
  Typography,
} from "@mui/material";
import type { ThemeMode, KnobStyle } from "@/store";
import { labelOf, type Lang } from "@/i18n";
import { useApp } from "@/store";
import { sendToTD } from "@/protocol/useTD";

const ACCENTS = [
  "#6750A4", // baseline purple
  "#B3261E", // red
  "#006A6A", // teal
  "#386A20", // green
  "#0061A4", // blue
  "#9C4234", // terra cotta
  "#7D5260", // plum
  "#F5C000", // gold
];

export function SettingsScreen() {
  const s = useApp((st) => st.settings);
  const patch = useApp((st) => st.patchSettings);
  const lang = s.lang;
  const t = (ru: string, en: string) => labelOf({ ru, en }, lang);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pb: 3, maxWidth: 640 }}>
      {/* ── тема ── */}
      <Section title={t("Тема", "Theme")}>
        <RadioGroup
          value={s.theme}
          onChange={(_, v) => patch({ theme: v as ThemeMode })}
        >
          <FormControlLabel value="system" control={<Radio size="small" />} label={t("Как в системе", "Follow system")} />
          <FormControlLabel value="light" control={<Radio size="small" />} label={t("Светлая", "Light")} />
          <FormControlLabel value="dark" control={<Radio size="small" />} label={t("Тёмная", "Dark")} />
        </RadioGroup>
      </Section>

      {/* ── Material You акцент ── */}
      <Section title={t("Акцентный цвет (Material You)", "Accent color (Material You)")}>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          {t("Из seed-цвета генерируется вся тональная палитра", "The whole tonal palette is generated from the seed color")}
        </Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
          {ACCENTS.map((c) => (
            <button
              key={c}
              onClick={() => patch({ accent: c })}
              aria-label={c}
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: c,
                border:
                  s.accent.toLowerCase() === c.toLowerCase()
                    ? "3px solid var(--tg-on-surface)"
                    : "3px solid transparent",
                outline: "1px solid var(--tg-outline-variant)",
                cursor: "pointer",
              }}
            />
          ))}
          <label
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              overflow: "hidden",
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
              background: "var(--tg-surface-highest)",
              border: "1px dashed var(--tg-outline)",
              fontSize: 18,
              color: "var(--tg-on-surface-variant)",
            }}
            title={t("Свой цвет", "Custom color")}
          >
            +
            <input
              type="color"
              value={s.accent}
              onChange={(e) => patch({ accent: e.target.value })}
              style={{ opacity: 0, position: "absolute", width: 1, height: 1 }}
            />
          </label>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Typography variant="body2" sx={{ fontFamily: "monospace", color: "text.secondary" }}>
            {s.accent.toUpperCase()}
          </Typography>
          <Slider
            size="small"
            value={hueOf(s.accent)}
            min={0}
            max={360}
            onChange={(_, v) => patch({ accent: hslToHex(v as number, 62, 48) })}
            sx={{ maxWidth: 220 }}
          />
        </Box>
      </Section>

      {/* ── стиль крутилок ── */}
      <Section title={t("Стиль крутилок", "Knob style")}>
        <RadioGroup
          row
          value={s.knobStyle}
          onChange={(_, v) => patch({ knobStyle: v as KnobStyle })}
        >
          <FormControlLabel value="arc" control={<Radio size="small" />} label={t("Дуга", "Arc")} />
          <FormControlLabel value="slider" control={<Radio size="small" />} label={t("Ползунок", "Slider")} />
        </RadioGroup>
      </Section>

      {/* ── язык ── */}
      <Section title={t("Язык", "Language")}>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>{t("Язык интерфейса", "Interface language")}</InputLabel>
          <Select
            value={s.lang}
            label={t("Язык интерфейса", "Interface language")}
            onChange={(e) => patch({ lang: e.target.value as Lang })}
          >
            <MenuItem value="ru">Русский</MenuItem>
            <MenuItem value="en">English</MenuItem>
          </Select>
        </FormControl>
      </Section>

      <Divider />

      {/* ── о программе ── */}
      <Section title={t("О программе", "About")}>
        <Typography variant="body2" color="text.secondary">
          {labelOf(
            {
              ru: "TouchGUI — настраиваемая панель управления параметрами TouchDesigner. Схема, быстрые настройки и пресеты живут в TD; несколько клиентов синхронизируются в реальном времени.",
              en: "TouchGUI — a configurable control panel for TouchDesigner. Schema, quick settings and presets live in TD; multiple clients sync in real time.",
            },
            lang
          )}
        </Typography>
        <Button
          sx={{ mt: 1 }}
          variant="outlined"
          color="error"
          size="small"
          onClick={() => sendToTD({ type: "get" })}
        >
          {t("Перечитать схему из TD", "Reload schema from TD")}
        </Button>
      </Section>
    </Box>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        borderRadius: 3,
        bgcolor: "var(--tg-surface-container)",
        border: "none",
      }}
    >
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.25 }}>
        {title}
      </Typography>
      {children}
    </Paper>
  );
}

// ── color helpers: hex <-> hue / hsl -> hex ────────────────────────
function hueOf(hex: string): number {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return Math.round(h < 0 ? h + 360 : h);
}

function hslToHex(h: number, s: number, l: number): string {
  const ss = s / 100;
  const ll = l / 100;
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ll - c / 2;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(rgb[0])}${to(rgb[1])}${to(rgb[2])}`;
}
