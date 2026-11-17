// Material You: генерация палитры из seed-цвета через material-color-utilities
// (та же библиотека, что стоит под динамическим цветом Android/Monet).
import {
  argbFromHex,
  hexFromArgb,
  themeFromSourceColor,
} from "@material/material-color-utilities";

export interface Palette {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  tertiary: string;
  onTertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;
  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;
  background: string;
  onBackground: string;
  surface: string;
  onSurface: string;
  surfaceVariant: string;
  onSurfaceVariant: string;
  surfaceContainerLowest: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;
  outline: string;
  outlineVariant: string;
  inverseSurface: string;
  inverseOnSurface: string;
  inversePrimary: string;
  success: string;
  onSuccess: string;
}

/**
 * Тональные роли Material 3. Тёмная тема: primary 80 / контейнер 30 и т.д.
 */
export function buildPalette(seedHex: string, dark: boolean): Palette {
  let seed = seedHex;
  if (!/^#?[0-9a-fA-F]{6}$/.test(seed)) seed = "#6750A4";
  if (!seed.startsWith("#")) seed = "#" + seed;

  const t = themeFromSourceColor(argbFromHex(seed));
  const P = t.palettes;

  const tone = (
    p: { tone(n: number): number },
    light: number,
    darkTone: number
  ) => hexFromArgb(p.tone(dark ? darkTone : light));

  return {
    primary: tone(P.primary, 40, 80),
    onPrimary: tone(P.primary, 100, 20),
    primaryContainer: tone(P.primary, 90, 30),
    onPrimaryContainer: tone(P.primary, 10, 90),
    secondary: tone(P.secondary, 40, 80),
    onSecondary: tone(P.secondary, 100, 20),
    secondaryContainer: tone(P.secondary, 90, 30),
    onSecondaryContainer: tone(P.secondary, 10, 90),
    tertiary: tone(P.tertiary, 40, 80),
    onTertiary: tone(P.tertiary, 100, 20),
    tertiaryContainer: tone(P.tertiary, 90, 30),
    onTertiaryContainer: tone(P.tertiary, 10, 90),
    error: tone(P.error, 40, 80),
    onError: tone(P.error, 100, 20),
    errorContainer: tone(P.error, 90, 30),
    onErrorContainer: tone(P.error, 10, 90),
    background: tone(P.neutral, 98, 6),
    onBackground: tone(P.neutral, 10, 90),
    surface: tone(P.neutral, 98, 6),
    onSurface: tone(P.neutral, 10, 90),
    surfaceVariant: tone(P.neutralVariant, 90, 30),
    onSurfaceVariant: tone(P.neutralVariant, 30, 80),
    surfaceContainerLowest: tone(P.neutral, 100, 4),
    surfaceContainerLow: tone(P.neutral, 96, 10),
    surfaceContainer: tone(P.neutral, 94, 12),
    surfaceContainerHigh: tone(P.neutral, 92, 17),
    surfaceContainerHighest: tone(P.neutral, 90, 22),
    outline: tone(P.neutralVariant, 50, 60),
    outlineVariant: tone(P.neutralVariant, 80, 30),
    inverseSurface: tone(P.neutral, 20, 90),
    inverseOnSurface: tone(P.neutral, 95, 20),
    inversePrimary: tone(P.primary, 80, 40),
    success: tone(P.tertiary, 40, 80),
    onSuccess: tone(P.tertiary, 100, 20),
  };
}

/** MUI Theme из палитры Material You */
export function muiTheme(p: Palette, dark: boolean) {
  const dividerAlpha = dark ? 0.12 : 0.1;
  const rgba = (hex: string, a: number) => {
    const h = hex.replace("#", "");
    const n = parseInt(
      h.length === 3
        ? h
            .split("")
            .map((c) => c + c)
            .join("")
        : h,
      16
    );
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  };

  return {
    palette: {
      mode: (dark ? "dark" : "light") as "dark" | "light",
      primary: { main: p.primary, contrastText: p.onPrimary },
      secondary: { main: p.secondary, contrastText: p.onSecondary },
      error: { main: p.error, contrastText: p.onError },
      success: { main: p.success, contrastText: p.onSuccess },
      text: {
        primary: p.onSurface,
        secondary: p.onSurfaceVariant,
      },
      background: {
        default: p.background,
        paper: p.surfaceContainer,
      },
      divider: rgba(p.outline, dividerAlpha),
      action: {
        hover: rgba(p.onSurface, 0.08),
        selected: rgba(p.onSurface, 0.12),
        hoverOpacity: 0.08,
        selectedOpacity: 0.12,
      },
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily:
        '"Roboto Flex", "Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
      button: { textTransform: "none" as const, fontWeight: 600 },
    },
    components: {
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: 20, minHeight: 36, paddingLeft: 16, paddingRight: 16 },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 16,
            backgroundImage: "none",
            boxShadow: dark
              ? "none"
              : "0 1px 2px rgba(0,0,0,.08), 0 1px 3px 1px rgba(0,0,0,.05)",
          },
        },
      },
      MuiChip: { styleOverrides: { root: { borderRadius: 8 } } },
      MuiTextField: { styleOverrides: { root: { "& .MuiOutlinedInput-root": { borderRadius: 12 } } } },
      MuiOutlinedInput: {
        styleOverrides: { root: { borderRadius: 12 } },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            borderRadius: 8,
            backgroundColor: p.inverseSurface,
            color: p.inverseOnSurface,
          },
        },
      },
    },
  };
}

/** CSS-переменные для кастомных виджетов (крутилки, метрики) */
export function cssVars(p: Palette): Record<string, string> {
  return {
    "--tg-primary": p.primary,
    "--tg-on-primary": p.onPrimary,
    "--tg-primary-container": p.primaryContainer,
    "--tg-on-primary-container": p.onPrimaryContainer,
    "--tg-secondary-container": p.secondaryContainer,
    "--tg-on-secondary-container": p.onSecondaryContainer,
    "--tg-surface": p.surface,
    "--tg-surface-container": p.surfaceContainer,
    "--tg-surface-high": p.surfaceContainerHigh,
    "--tg-surface-highest": p.surfaceContainerHighest,
    "--tg-on-surface": p.onSurface,
    "--tg-on-surface-variant": p.onSurfaceVariant,
    "--tg-outline": p.outline,
    "--tg-outline-variant": p.outlineVariant,
    "--tg-error": p.error,
    "--tg-success": p.success,
    "--tg-tertiary": p.tertiary,
  };
}
