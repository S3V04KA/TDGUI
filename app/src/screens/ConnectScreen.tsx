// Экран подключения: ручной ввод адреса, история, автопоиск TD в сети.
import { useState } from "react";
import {
  Box,
  Button,
  Chip,
  LinearProgress,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import WifiFindIcon from "@mui/icons-material/WifiFind";
import LinkIcon from "@mui/icons-material/Link";
import type { DiscoveredServer } from "@/protocol/types";
import { labelOf } from "@/i18n";
import { useApp } from "@/store";
import { useTD } from "@/protocol/useTD";
import { discover, probeAddress, splitAddress } from "@/protocol/client";

export function ConnectScreen() {
  const lang = useApp((s) => s.settings.lang);
  const scanRange = useApp((s) => s.settings.scanRange);
  const patchSettings = useApp((s) => s.patchSettings);
  const history = useApp((s) => s.history);
  const status = useApp((s) => s.status);
  const latency = useApp((s) => s.latency);
  const { connect, disconnect } = useTD();

  const [addr, setAddr] = useState(history[0] ?? "192.168.1.10:9876");
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [found, setFound] = useState<DiscoveredServer[]>([]);
  const [scanned, setScanned] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const t = (ru: string, en: string) => labelOf({ ru, en }, lang);

  const doConnect = async (target?: string) => {
    const a = (target ?? addr).trim();
    if (!a) return;
    setErr(null);
    const [ip, port] = splitAddress(a);
    // проверяем, что сервер отвечает (иначе websocket молча уйдёт в реконнект)
    const ok = await probeAddress(`${ip}:${port}`);
    if (!ok) {
      setErr(t("Сервер не отвечает. Проверьте адрес, что TD запущен и порт открыт.", "Server is not responding. Check the address, that TD is running and the port is open."));
      return;
    }
    connect(`${ip}:${port}`);
  };

  const doScan = async () => {
    setScanning(true);
    setScanned(false);
    setFound([]);
    setProgress(0);
    const ports = [9876, 8080, 9090, 9980];
    try {
      const res = await discover(scanRange, ports, (done, total) =>
        setProgress(total ? done / total : 0)
      );
      setFound(res);
    } finally {
      setScanning(false);
      setScanned(true);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        p: 2,
      }}
    >
      <Typography variant="h5" sx={{ fontWeight: 800 }}>
        {t("Подключение к TouchDesigner", "Connect to TouchDesigner")}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", maxWidth: 420 }}>
        {t(
          "Введите адрес WebSocket-сервера TD или найдите его в локальной сети.",
          "Enter the TD WebSocket server address or discover it on the local network."
        )}
      </Typography>

      {/* ручной ввод */}
      <Paper
        variant="outlined"
        sx={{
          width: "100%",
          maxWidth: 440,
          p: 2.5,
          borderRadius: 4,
          bgcolor: "var(--tg-surface-container)",
          border: "none",
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
        }}
      >
        <TextField
          fullWidth
          label={t("Адрес", "Address")}
          placeholder="192.168.1.10:9876"
          value={addr}
          onChange={(e) => setAddr(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && doConnect()}
          error={!!err}
          helperText={err ?? t("напр. 192.168.1.10:9876", "e.g. 192.168.1.10:9876")}
          slotProps={{
            input: {
              startAdornment: <LinkIcon sx={{ mr: 1, color: "text.disabled" }} fontSize="small" />,
            },
          }}
        />
        <Button
          variant="contained"
          size="large"
          onClick={() => doConnect()}
          disabled={status === "connecting"}
        >
          {status === "connecting" ? t("Подключение…", "Connecting…") : t("Подключиться", "Connect")}
        </Button>

        {history.length > 0 && (
          <Box>
            <Typography variant="caption" color="text.secondary">
              {t("Недавние", "Recent")}
            </Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mt: 0.5 }}>
              {history.map((h) => (
                <Chip
                  key={h}
                  label={h}
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    setAddr(h);
                    doConnect(h);
                  }}
                />
              ))}
            </Box>
          </Box>
        )}
      </Paper>

      {/* автопоиск */}
      <Paper
        variant="outlined"
        sx={{
          width: "100%",
          maxWidth: 440,
          p: 2.5,
          borderRadius: 4,
          bgcolor: "var(--tg-surface-container)",
          border: "none",
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
        }}
      >
        <TextField
          fullWidth
          size="small"
          label={t("Диапазон сети", "Network range")}
          placeholder="192.168.1"
          value={scanRange}
          onChange={(e) => patchSettings({ scanRange: e.target.value })}
          helperText={t("192.168.1 — сканирует .1 … .254", "192.168.1 — scans .1 … .254")}
        />
        <Button
          variant="outlined"
          startIcon={<WifiFindIcon />}
          onClick={doScan}
          disabled={scanning}
        >
          {scanning
            ? `${t("Поиск TD в сети…", "Scanning network for TD…")} ${Math.round(progress * 100)}%`
            : t("Автопоиск", "Auto-discover")}
        </Button>
        {scanning && <LinearProgress variant="determinate" value={progress * 100} />}

        {scanned && (
          <List dense disablePadding>
            {found.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {t(
                  "Ничего не найдено. Проверьте сеть и брандмауэр Windows.",
                  "Nothing found. Check the network and Windows firewall."
                )}
              </Typography>
            ) : (
              found.map((f) => (
                <ListItemButton
                  key={`${f.ip}:${f.port}`}
                  onClick={() => {
                    setAddr(`${f.ip}:${f.port}`);
                    doConnect(`${f.ip}:${f.port}`);
                  }}
                  sx={{ borderRadius: 2 }}
                >
                  <ListItemText
                    primary={`${f.ip}:${f.port}`}
                    secondary={f.project}
                  />
                </ListItemButton>
              ))
            )}
          </List>
        )}
      </Paper>

      {status === "online" && (
        <Button variant="text" color="inherit" onClick={disconnect}>
          {t("Отключиться", "Disconnect")}
          {latency !== null ? ` · ${latency} мс` : ""}
        </Button>
      )}
    </Box>
  );
}
