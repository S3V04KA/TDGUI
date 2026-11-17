// Оболочка приложения: две отдельные раскладки (мобильная / десктопная),
// навигация, Material You тема (динамический seed-цвет, системная свет/тьма).
import { useEffect, useMemo } from "react";
import {
  AppBar,
  Badge,
  Box,
  BottomNavigation,
  BottomNavigationAction,
  Button,
  Chip,
  CssBaseline,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import type { Theme } from "@mui/material/styles";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import DashboardIcon from "@mui/icons-material/Dashboard";
import SaveIcon from "@mui/icons-material/Save";
import SettingsIcon from "@mui/icons-material/Settings";
import LinkIcon from "@mui/icons-material/Link";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import WifiIcon from "@mui/icons-material/Wifi";
import WifiOffIcon from "@mui/icons-material/WifiOff";
import FolderIcon from "@mui/icons-material/Folder";
import { buildPalette, cssVars, muiTheme } from "@/theme/material";
import { labelOf } from "@/i18n";
import { useApp, type Route } from "@/store";
import { Dashboard } from "@/screens/Dashboard";
import { GroupScreen } from "@/screens/GroupScreen";
import { PresetsScreen } from "@/screens/PresetsScreen";
import { SettingsScreen } from "@/screens/SettingsScreen";
import { ConnectScreen } from "@/screens/ConnectScreen";
import { findGroup } from "@/components/ControlCard";

export function App() {
  const settings = useApp((s) => s.settings);

  // системная тема
  const systemDark = useMediaQuery("(prefers-color-scheme: dark)", {
    noSsr: true,
  });
  const dark =
    settings.theme === "dark" ||
    (settings.theme === "system" && systemDark);

  const theme = useMemo(() => {
    const palette = buildPalette(settings.accent, dark);
    const base = muiTheme(palette, dark);
    return { mui: createTheme(base), vars: cssVars(palette) };
  }, [settings.accent, dark]);

  return (
    <ThemeProvider theme={theme.mui}>
      <CssBaseline />
      <Box
        sx={{
          ...theme.vars,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          bgcolor: "background.default",
          color: "text.primary",
        }}
      >
        <AppInner />
      </Box>
    </ThemeProvider>
  );
}

function AppInner() {
  const settings = useApp((s) => s.settings);
  const status = useApp((s) => s.status);
  const schema = useApp((s) => s.schema);
  const route = useApp((s) => s.route);
  const navigate = useApp((s) => s.navigate);
  const latency = useApp((s) => s.latency);

  const lang = settings.lang;
  const t = (ru: string, en: string) => labelOf({ ru, en }, lang);

  // если нет схемы и не подключены — экран подключения
  const forceConnect = status === "offline" && !schema && route.name !== "connect";

  const currentGroup =
    route.name === "group" && schema ? findGroup(schema.root, route.id) : null;

  const title = forceConnect
    ? t("Подключение", "Connection")
    : route.name === "dashboard"
      ? schema?.project ?? "TouchGUI"
      : route.name === "group"
        ? currentGroup
          ? labelOf(currentGroup.label, lang)
          : t("Группа", "Group")
        : route.name === "presets"
          ? t("Пресеты", "Presets")
          : route.name === "settings"
            ? t("Настройки", "Settings")
            : t("Подключение", "Connection");

  const screen = () => {
    if (forceConnect || route.name === "connect") return <ConnectScreen />;
    switch (route.name) {
      case "dashboard":
        return <Dashboard />;
      case "group":
        return <GroupScreen id={route.id} />;
      case "presets":
        return <PresetsScreen />;
      case "settings":
        return <SettingsScreen />;
      default:
        return <Dashboard />;
    }
  };

  const desktop = useMediaQuery((th) => th.breakpoints.up("md"), {
    noSsr: true,
  });

  const statusChip = (
    <Chip
      size="small"
      icon={status === "online" ? <WifiIcon sx={{ fontSize: 14 }} /> : <WifiOffIcon sx={{ fontSize: 14 }} />}
      label={
        status === "online"
          ? latency !== null
            ? `${t("Подключено", "Connected")} · ${latency}ms`
            : t("Подключено", "Connected")
          : status === "connecting"
            ? t("Подключение…", "Connecting…")
            : t("Не подключено", "Offline")
      }
      color={status === "online" ? "success" : "default"}
      variant={status === "online" ? "filled" : "outlined"}
      onClick={() => navigate({ name: "connect" })}
      sx={{ cursor: "pointer", fontWeight: 600 }}
    />
  );

  return (
    <>
      {desktop ? (
        <DesktopLayout
          title={title}
          route={route}
          navigate={navigate}
          statusChip={statusChip}
          canBack={route.name === "group" || route.name === "presets" || route.name === "settings" || route.name === "connect"}
          onBack={() => navigate({ name: "dashboard" })}
          onConnect={() => navigate({ name: "connect" })}
          lang={lang}
          t={t}
        >
          {screen()}
        </DesktopLayout>
      ) : (
        <MobileLayout
          title={title}
          route={route}
          navigate={navigate}
          statusChip={statusChip}
          canBack={route.name === "group" || route.name === "connect"}
          onBack={() => navigate({ name: "dashboard" })}
          lang={lang}
          t={t}
        >
          {screen()}
        </MobileLayout>
      )}
    </>
  );
}

// ── мобильная раскладка: AppBar + контент + нижняя навигация ───────
function MobileLayout({
  title,
  route,
  navigate,
  statusChip,
  canBack,
  onBack,
  children,
  lang,
  t,
}: LayoutProps) {
  useEffect(() => {
    // прячем адресную строку браузера на мобильных
    document.body.style.overscrollBehavior = "none";
  }, []);

  return (
    <>
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          bgcolor: "background.paper",
          color: "text.primary",
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Toolbar variant="dense" sx={{ gap: 1, minHeight: 52 }}>
          {canBack && (
            <IconButton edge="start" size="small" onClick={onBack} aria-label={t("Назад", "Back")}>
              <ArrowBackIcon fontSize="small" />
            </IconButton>
          )}
          <Typography variant="subtitle1" sx={{ fontWeight: 800, flex: 1, minWidth: 0 }}>
            {title}
          </Typography>
          {statusChip}
        </Toolbar>
      </AppBar>

      <Box
        component="main"
        sx={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          WebkitOverflowScrolling: "touch",
          p: 1.5,
          pb: 2,
        }}
      >
        {children}
      </Box>

      <BottomNavigation
        showLabels
        value={route.name === "group" || route.name === "dashboard" ? "dashboard" : route.name}
        onChange={(_, v) => navigate({ name: v as Route["name"] } as Route)}
        sx={{
          borderTop: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
          flexShrink: 0,
        }}
      >
        <BottomNavigationAction
          value="dashboard"
          label={t("Главная", "Home")}
          icon={<DashboardIcon />}
        />
        <BottomNavigationAction
          value="presets"
          label={t("Пресеты", "Presets")}
          icon={<SaveIcon />}
        />
        <BottomNavigationAction
          value="settings"
          label={t("Настройки", "Settings")}
          icon={<SettingsIcon />}
        />
        <BottomNavigationAction
          value="connect"
          label={t("Связь", "Link")}
          icon={
            <Badge
              color={status === "online" ? "success" : "error"}
              variant="dot"
              overlap="circular"
            >
              <LinkIcon />
            </Badge>
          }
        />
      </BottomNavigation>
    </>
  );
}

// ── десктопная раскладка: боковой drawer с деревом групп ───────────
function DesktopLayout({
  title,
  route,
  navigate,
  statusChip,
  onConnect,
  children,
  lang,
  t,
}: LayoutProps) {
  const schema = useApp((s) => s.schema);

  return (
    <>
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          bgcolor: "background.paper",
          color: "text.primary",
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Toolbar variant="dense" sx={{ gap: 1.5, minHeight: 48 }}>
          <Typography variant="h6" sx={{ fontWeight: 900, letterSpacing: -0.5, mr: 1 }}>
            TouchGUI
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
            {title}
          </Typography>
          {statusChip}
          <Tooltip title={t("Подключение", "Connection")}>
            <IconButton size="small" onClick={onConnect}>
              <LinkIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      <Box sx={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* дерево групп */}
        <Box
          component="nav"
          sx={{
            width: 232,
            flexShrink: 0,
            borderRight: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
            overflowY: "auto",
            p: 1,
          }}
        >
          <List dense disablePadding>
            <ListItemButton
              selected={route.name === "dashboard"}
              onClick={() => navigate({ name: "dashboard" })}
              sx={{ borderRadius: 2, mb: 0.25 }}
            >
              <ListItemIcon sx={{ minWidth: 34 }}>
                <DashboardIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary={t("Главная", "Home")} primaryTypographyProps={{ fontWeight: 600, fontSize: 14 }} />
            </ListItemButton>

            {(schema?.root.groups ?? []).map((g) => (
              <GroupTree
                key={g.id}
                group={g}
                depth={0}
                route={route}
                navigate={navigate}
                lang={lang}
              />
            ))}

            <ListItemButton
              selected={route.name === "presets"}
              onClick={() => navigate({ name: "presets" })}
              sx={{ borderRadius: 2, mt: 1 }}
            >
              <ListItemIcon sx={{ minWidth: 34 }}>
                <SaveIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary={t("Пресеты", "Presets")} primaryTypographyProps={{ fontWeight: 600, fontSize: 14 }} />
            </ListItemButton>
            <ListItemButton
              selected={route.name === "settings"}
              onClick={() => navigate({ name: "settings" })}
              sx={{ borderRadius: 2 }}
            >
              <ListItemIcon sx={{ minWidth: 34 }}>
                <SettingsIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary={t("Настройки", "Settings")} primaryTypographyProps={{ fontWeight: 600, fontSize: 14 }} />
            </ListItemButton>
          </List>
        </Box>

        {/* контент */}
        <Box
          component="main"
          sx={{ flex: 1, overflowY: "auto", p: 2.5, minWidth: 0 }}
        >
          <Box sx={{ maxWidth: 1200, mx: "auto" }}>{children}</Box>
        </Box>
      </Box>
    </>
  );
}

function GroupTree({
  group,
  depth,
  route,
  navigate,
  lang,
}: {
  group: import("@/protocol/types").GroupDef;
  depth: number;
  route: Route;
  navigate: (r: Route) => void;
  lang: "ru" | "en";
}) {
  const active = route.name === "group" && route.id === group.id;
  return (
    <>
      <ListItemButton
        selected={active}
        onClick={() => navigate({ name: "group", id: group.id })}
        sx={{
          borderRadius: 2,
          mb: 0.25,
          pl: 1 + depth * 2,
          minHeight: 34,
        }}
      >
        <ListItemIcon sx={{ minWidth: 30 }}>
          <FolderIcon sx={{ fontSize: 16, color: active ? "primary.main" : "text.disabled" }} />
        </ListItemIcon>
        <ListItemText
          primary={labelOf(group.label, lang)}
          primaryTypographyProps={{
            fontSize: 13.5,
            fontWeight: active ? 700 : 500,
            noWrap: true,
          }}
        />
      </ListItemButton>
      {(group.groups ?? []).map((sg) => (
        <GroupTree
          key={sg.id}
          group={sg}
          depth={depth + 1}
          route={route}
          navigate={navigate}
          lang={lang}
        />
      ))}
    </>
  );
}

interface LayoutProps {
  title: string;
  route: Route;
  navigate: (r: Route) => void;
  statusChip: React.ReactNode;
  canBack?: boolean;
  onBack?: () => void;
  onConnect?: () => void;
  children: React.ReactNode;
  lang: "ru" | "en";
  t: (ru: string, en: string) => string;
}
