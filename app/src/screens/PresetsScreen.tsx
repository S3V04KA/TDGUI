// Экран пресетов: сохранение текущих значений, применение, переименование,
// удаление, экспорт/импорт JSON (пресеты хранятся в TD и синхронизируются).
import { useRef, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import AddIcon from "@mui/icons-material/Add";
import FileUploadIcon from "@mui/icons-material/FileUpload";
import type { Preset } from "@/protocol/types";
import { labelOf } from "@/i18n";
import { useApp } from "@/store";
import { sendToTD } from "@/protocol/useTD";

export function PresetsScreen() {
  const presets = useApp((s) => s.presets);
  const values = useApp((s) => s.values);
  const lang = useApp((s) => s.settings.lang);

  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [menu, setMenu] = useState<{ el: HTMLElement; preset: Preset } | null>(null);
  const [confirmDel, setConfirmDel] = useState<Preset | null>(null);
  const [renameFor, setRenameFor] = useState<Preset | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const doSave = () => {
    const n = name.trim() || `Preset ${presets.length + 1}`;
    sendToTD({ type: "preset.save", name: n, values });
    setSaveOpen(false);
    setName("");
  };

  const doExport = (p: Preset) => {
    const blob = new Blob(
      [JSON.stringify({ name: p.name, values: p.values }, null, 2)],
      { type: "application/json" }
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${p.name.replace(/[^\w\-а-я ]/gi, "_")}.touchgui.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const doImport = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text) as { name?: string; values?: Record<string, unknown> } | Preset[];
      if (Array.isArray(data)) {
        for (const p of data) {
          sendToTD({
            type: "preset.save",
            name: p.name ?? "Imported",
            values: p.values ?? {},
          });
        }
      } else if (data && typeof data === "object" && data.values) {
        sendToTD({
          type: "preset.save",
          name: data.name ?? file.name.replace(/\..*$/, ""),
          values: data.values,
        });
      }
    } catch (e) {
      console.warn("import failed", e);
    }
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, pb: 2 }}>
      {/* действия */}
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setSaveOpen(true)}
        >
          {labelOf({ ru: "Сохранить текущее", en: "Save current" }, lang)}
        </Button>
        <Button
          variant="outlined"
          startIcon={<FileUploadIcon />}
          onClick={() => fileRef.current?.click()}
        >
          {labelOf({ ru: "Импорт JSON", en: "Import JSON" }, lang)}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) doImport(f);
            e.target.value = "";
          }}
        />
      </Box>

      {/* список */}
      {presets.length === 0 ? (
        <Paper
          variant="outlined"
          sx={{ p: 4, textAlign: "center", borderRadius: 3, bgcolor: "var(--tg-surface-container)", border: "none" }}
        >
          <Typography color="text.secondary">
            {labelOf({ ru: "Пресетов пока нет. Сохраните текущее состояние параметров.", en: "No presets yet. Save the current state of parameters." }, lang)}
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {presets.map((p) => (
            <Paper
              key={p.id}
              variant="outlined"
              sx={{
                p: 1.25,
                borderRadius: 3,
                bgcolor: "var(--tg-surface-container)",
                border: "1px solid",
                borderColor: "divider",
                display: "flex",
                alignItems: "center",
                gap: 1,
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  {p.name}
                </Typography>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  {Object.keys(p.values).length} {labelOf({ ru: "значений", en: "values" }, lang)}
                  {" · "}
                  {new Date(p.createdAt).toLocaleString(lang === "ru" ? "ru-RU" : "en-US")}
                </Typography>
              </Box>
              <Button
                size="small"
                variant="contained"
                color="primary"
                onClick={() => sendToTD({ type: "preset.load", id: p.id })}
              >
                {labelOf({ ru: "Применить", en: "Apply" }, lang)}
              </Button>
              <IconButton
                size="small"
                onClick={(e) => setMenu({ el: e.currentTarget, preset: p })}
              >
                <MoreVertIcon fontSize="small" />
              </IconButton>
            </Paper>
          ))}
        </Box>
      )}

      {/* меню пресета */}
      <Menu
        anchorEl={menu?.el}
        open={!!menu}
        onClose={() => setMenu(null)}
      >
        <MenuItem
          onClick={() => {
            if (menu) doExport(menu.preset);
            setMenu(null);
          }}
        >
          {labelOf({ ru: "Экспорт JSON", en: "Export JSON" }, lang)}
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menu) {
              setRenameFor(menu.preset);
              setRenameVal(menu.preset.name);
            }
            setMenu(null);
          }}
        >
          {labelOf({ ru: "Переименовать", en: "Rename" }, lang)}
        </MenuItem>
        <MenuItem
          sx={{ color: "error.main" }}
          onClick={() => {
            if (menu) setConfirmDel(menu.preset);
            setMenu(null);
          }}
        >
          {labelOf({ ru: "Удалить", en: "Delete" }, lang)}
        </MenuItem>
      </Menu>

      {/* диалог сохранения */}
      <Dialog open={saveOpen} onClose={() => setSaveOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{labelOf({ ru: "Новый пресет", en: "New preset" }, lang)}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label={labelOf({ ru: "Название", en: "Name" }, lang)}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSave()}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveOpen(false)}>{labelOf({ ru: "Отмена", en: "Cancel" }, lang)}</Button>
          <Button variant="contained" onClick={doSave}>
            {labelOf({ ru: "Сохранить", en: "Save" }, lang)}
          </Button>
        </DialogActions>
      </Dialog>

      {/* диалог переименования */}
      <Dialog open={!!renameFor} onClose={() => setRenameFor(null)} fullWidth maxWidth="xs">
        <DialogTitle>{labelOf({ ru: "Переименовать", en: "Rename" }, lang)}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            value={renameVal}
            onChange={(e) => setRenameVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && renameFor) {
                sendToTD({ type: "preset.rename", id: renameFor.id, name: renameVal });
                setRenameFor(null);
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameFor(null)}>{labelOf({ ru: "Отмена", en: "Cancel" }, lang)}</Button>
          <Button
            variant="contained"
            onClick={() => {
              if (renameFor)
                sendToTD({ type: "preset.rename", id: renameFor.id, name: renameVal });
              setRenameFor(null);
            }}
          >
            {labelOf({ ru: "Сохранить", en: "Save" }, lang)}
          </Button>
        </DialogActions>
      </Dialog>

      {/* подтверждение удаления */}
      <Dialog open={!!confirmDel} onClose={() => setConfirmDel(null)}>
        <DialogTitle>{labelOf({ ru: "Удалить пресет?", en: "Delete preset?" }, lang)}</DialogTitle>
        <DialogContentText sx={{ px: 2 }}>
          {confirmDel?.name}
        </DialogContentText>
        <DialogActions>
          <Button onClick={() => setConfirmDel(null)}>{labelOf({ ru: "Отмена", en: "Cancel" }, lang)}</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              if (confirmDel) sendToTD({ type: "preset.delete", id: confirmDel.id });
              setConfirmDel(null);
            }}
          >
            {labelOf({ ru: "Удалить", en: "Delete" }, lang)}
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
}
