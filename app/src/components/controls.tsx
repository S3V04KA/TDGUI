// Прочие элементы управления + метрика (выходное значение после обработки в TD).
import { useEffect, useRef, useState } from "react";
import { Button, MenuItem, Switch, TextField } from "@mui/material";
import type { ControlDef, MetricDef } from "@/protocol/types";
import { labelOf, type Lang } from "@/i18n";

// ── Toggle ──────────────────────────────────────────────────────────
export function ToggleControl({
  value,
  disabled,
  onChange,
}: {
  value: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Switch
      checked={!!value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      slotProps={{ input: { "aria-label": "toggle" } }}
    />
  );
}

// ── Button (pulse) ─────────────────────────────────────────────────
export function ButtonControl({
  label,
  disabled,
  onPulse,
}: {
  label: string;
  disabled?: boolean;
  onPulse: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <Button
      variant="contained"
      color="primary"
      disabled={disabled}
      onPointerDown={() => {
        setPressed(true);
        onPulse();
      }}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      sx={{
        minWidth: 96,
        transform: pressed ? "scale(0.96)" : "none",
        transition: "transform .06s",
        background: pressed
          ? "var(--tg-tertiary)"
          : undefined,
        color: pressed ? "var(--tg-on-surface)" : undefined,
      }}
    >
      {label}
    </Button>
  );
}

// ── Select ─────────────────────────────────────────────────────────
export function SelectControl({
  value,
  options,
  disabled,
  onChange,
}: {
  value: string;
  options: { value: string; label: Record<string, string> }[];
  disabled?: boolean;
  lang: Lang;
  onChange: (v: string) => void;
}) {
  return (
    <TextField
      select
      size="small"
      fullWidth
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      sx={{ minWidth: 120 }}
    >
      {options.map((o) => (
        <MenuItem key={o.value} value={o.value}>
          {labelOf(o.label, "ru", o.value)}
        </MenuItem>
      ))}
    </TextField>
  );
}

// ── Text ───────────────────────────────────────────────────────────
export function TextControl({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <TextField
      size="small"
      fullWidth
      value={local}
      disabled={disabled}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => local !== value && onChange(local)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && local !== value) onChange(local);
      }}
    />
  );
}

// ── XY pad ─────────────────────────────────────────────────────────
export function XYControl({
  value,
  disabled,
  onChange,
  size = 148,
}: {
  value: number[];
  disabled?: boolean;
  onChange: (v: number[]) => void;
  size?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const x = value[0] ?? 0.5;
  const y = value[1] ?? 0.5;

  const apply = (cx: number, cy: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const nx = Math.min(1, Math.max(0, (cx - r.left) / r.width));
    const ny = Math.min(1, Math.max(0, 1 - (cy - r.top) / r.height));
    onChange([+nx.toFixed(4), +ny.toFixed(4)]);
  };

  return (
    <div
      ref={ref}
      onPointerDown={(e) => {
        if (disabled) return;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        dragging.current = true;
        apply(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (dragging.current && !disabled) apply(e.clientX, e.clientY);
      }}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        background: "var(--tg-surface-highest)",
        position: "relative",
        cursor: disabled ? "default" : "crosshair",
        touchAction: "none",
        opacity: disabled ? 0.5 : 1,
        backgroundImage:
          "linear-gradient(var(--tg-outline-variant) 1px, transparent 1px), linear-gradient(90deg, var(--tg-outline-variant) 1px, transparent 1px)",
        backgroundSize: "25% 25%",
        backgroundPosition: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: `calc(${x * 100}% - 9px)`,
          top: `calc(${(1 - y) * 100}% - 9px)`,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "var(--tg-primary)",
          border: "3px solid var(--tg-on-primary-container)",
          boxShadow: "0 1px 4px rgba(0,0,0,.5)",
          pointerEvents: "none",
        }}
      />
      <span
        style={{
          position: "absolute",
          right: 6,
          bottom: 4,
          fontSize: 11,
          color: "var(--tg-on-surface-variant)",
          fontVariantNumeric: "tabular-nums",
          pointerEvents: "none",
        }}
      >
        {x.toFixed(2)} · {y.toFixed(2)}
      </span>
    </div>
  );
}

// ── Color ──────────────────────────────────────────────────────────
export function ColorControl({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  const hex = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#ffffff";
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <input
        type="color"
        value={hex}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: 56,
          height: 40,
          border: "none",
          borderRadius: 10,
          padding: 0,
          background: "none",
          cursor: "pointer",
        }}
      />
      <span
        style={{
          fontSize: 13,
          color: "var(--tg-on-surface-variant)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {hex.toUpperCase()}
      </span>
    </label>
  );
}

// ── Метрика: выходное значение после обработки ─────────────────────
export interface MetricProps {
  def: MetricDef;
  value: number | undefined;
  lang: Lang;
  /** ширина спарклайна истории, 0 — только число */
  sparkWidth?: number;
}

const HISTORY_MAX = 120;

export function MetricDisplay({ def, value, lang, sparkWidth = 90 }: MetricProps) {
  const history = useRef<number[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [, force] = useState(0);

  // накопление истории + перерисовка
  useEffect(() => {
    if (typeof value === "number" && isFinite(value)) {
      history.current.push(value);
      if (history.current.length > HISTORY_MAX) history.current.shift();
    }
    const cv = canvasRef.current;
    if (cv && sparkWidth > 0 && history.current.length > 1) {
      const dpr = window.devicePixelRatio || 1;
      const w = sparkWidth;
      const h = 26;
      if (cv.width !== w * dpr || cv.height !== h * dpr) {
        cv.width = w * dpr;
        cv.height = h * dpr;
      }
      const ctx = cv.getContext("2d");
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        const data = history.current;
        let lo = Math.min(...data);
        let hi = Math.max(...data);
        if (def.min !== undefined) lo = Math.min(lo, def.min);
        if (def.max !== undefined) hi = Math.max(hi, def.max);
        if (hi - lo < 1e-9) hi = lo + 1;
        const px = (i: number) => (i / (HISTORY_MAX - 1)) * w;
        const py = (v: number) => h - 2 - ((v - lo) / (hi - lo)) * (h - 4);
        const style = getComputedStyle(cv);
        const color =
          style.getPropertyValue("--spark-color").trim() || "#8ab4f8";
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.lineJoin = "round";
        ctx.beginPath();
        const off = HISTORY_MAX - data.length;
        data.forEach((v, i) => {
          const X = px(i + off);
          const Y = py(v);
          if (i === 0) ctx.moveTo(X, Y);
          else ctx.lineTo(X, Y);
        });
        ctx.stroke();
      }
    }
    force((n) => n + 1);
  }, [value, sparkWidth, def.min, def.max]);

  const num =
    typeof value === "number" && isFinite(value)
      ? value.toFixed(def.precision ?? 2)
      : "—";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "5px 10px",
        borderRadius: 10,
        background: "var(--tg-secondary-container)",
        color: "var(--tg-on-secondary-container)",
        minHeight: 36,
        minWidth: 0,
      }}
      title={labelOf(def.label, lang)}
    >
      <span style={{ fontSize: 11, opacity: 0.75, whiteSpace: "nowrap" }}>
        {labelOf(def.label, lang)}
      </span>
      <span
        style={{
          fontSize: 14,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        }}
      >
        {num}
        {def.unit ? (
          <span style={{ fontSize: 11, opacity: 0.7, marginLeft: 3 }}>{def.unit}</span>
        ) : null}
      </span>
      {sparkWidth > 0 && (
        <canvas
          ref={canvasRef}
          style={{
            width: sparkWidth,
            height: 26,
            "--spark-color": "var(--tg-primary)",
          } as React.CSSProperties}
        />
      )}
    </div>
  );
}
