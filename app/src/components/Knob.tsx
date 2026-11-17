// Крутилка Material You: вертикальный drag + колесо мыши, дуга или слайдер.
import { useCallback, useEffect, useRef, useState } from "react";

export interface KnobProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  size?: number;
  style?: "arc" | "slider";
  label?: string;
  unit?: string;
  precision?: number;
  disabled?: boolean;
  onChange: (v: number) => void;
  /** финальное значение от TD подтвердило локальное */
  confirmed?: boolean;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function quantize(v: number, step: number | undefined) {
  if (!step || step <= 0) return v;
  return Math.round(v / step) * step;
}

function fmt(v: number, precision?: number): string {
  if (!isFinite(v)) return "—";
  const p = precision ?? (Math.abs(v) >= 100 ? 1 : 2);
  return v.toFixed(p);
}

export function Knob({
  value,
  min,
  max,
  step,
  size = 76,
  style = "arc",
  unit,
  precision,
  disabled,
  onChange,
}: KnobProps) {
  const dragRef = useRef<{
    startY: number;
    startVal: number;
    pointerId: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [showTip, setShowTip] = useState(false);
  const tipTimer = useRef<number | null>(null);

  const norm =
    max > min ? clamp((value - min) / (max - min), 0, 1) : 0;

  const emit = useCallback(
    (raw: number) => {
      const v = quantize(clamp(raw, min, max), step);
      if (v !== value) onChange(v);
    },
    [min, max, step, value, onChange]
  );

  // ── вертикальный drag ──
  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      startY: e.clientY,
      startVal: value,
      pointerId: e.pointerId,
    };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    // чувствительность: полный диапазон за ~180px, shift — точная подстройка
    const fine = e.shiftKey ? 0.25 : 1;
    const dy = (d.startY - e.clientY) * fine;
    const span = max - min;
    const range = span > 0 ? span : 1;
    let next = d.startVal + (dy / 180) * range;
    if (step && step >= 1 && !e.shiftKey) next = Math.round(next);
    emit(next);
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragRef.current = null;
    setDragging(false);
  };

  // ── колесо мыши ──
  const onWheel = (e: React.WheelEvent) => {
    if (disabled) return;
    e.preventDefault();
    const s = step ?? (max - min) / 100;
    const dir = e.deltaY > 0 ? -1 : 1;
    emit(value + dir * s * (e.altKey ? 0.1 : 1));
  };

  // ── двойной тап / клик — подсказка со значением ──
  const onDoubleClick = () => {
    if (disabled) return;
    setShowTip(true);
    if (tipTimer.current) clearTimeout(tipTimer.current);
    tipTimer.current = window.setTimeout(() => setShowTip(false), 1400);
  };

  useEffect(
    () => () => {
      if (tipTimer.current) clearTimeout(tipTimer.current);
    },
    []
  );

  // ── слайдер-стиль ──
  if (style === "slider") {
    const trackH = 6;
    return (
      <div
        onWheel={onWheel}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          opacity: disabled ? 0.5 : 1,
          touchAction: "none",
        }}
      >
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{
            position: "relative",
            height: 32,
            display: "flex",
            alignItems: "center",
            cursor: disabled ? "default" : "ns-resize",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              height: trackH,
              borderRadius: trackH,
              background: "var(--tg-surface-highest)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 0,
              width: `${norm * 100}%`,
              height: trackH,
              borderRadius: trackH,
              background: "var(--tg-primary)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: `calc(${norm * 100}% - ${dragging ? 10 : 7}px)`,
              width: dragging ? 20 : 14,
              height: dragging ? 20 : 14,
              borderRadius: "50%",
              background: "var(--tg-primary)",
              boxShadow: "0 1px 3px rgba(0,0,0,.4)",
              transition: dragging ? "none" : "width .1s, height .1s",
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontVariantNumeric: "tabular-nums",
            fontSize: 13,
            color: "var(--tg-on-surface)",
          }}
        >
          <span style={{ fontWeight: 600 }}>
            {fmt(value, precision)}
            {unit ? <span style={{ opacity: 0.6, marginLeft: 3 }}>{unit}</span> : null}
          </span>
        </div>
      </div>
    );
  }

  // ── дуга-стиль (по умолчанию) ──
  const r = size / 2 - 7;
  const c = 2 * Math.PI * r;
  // дуга 270°: от 135° до 405°
  const arcLen = (c * 270) / 360;
  const valueArc = arcLen * norm;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        opacity: disabled ? 0.5 : 1,
        userSelect: "none",
        touchAction: "none",
      }}
    >
      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={onWheel}
        onDoubleClick={onDoubleClick}
        onKeyDown={(e) => {
          if (disabled) return;
          const s = step ?? (max - min) / 100;
          if (e.key === "ArrowUp" || e.key === "ArrowRight") {
            e.preventDefault();
            emit(value + s);
          } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
            e.preventDefault();
            emit(value - s);
          }
        }}
        style={{
          width: size,
          height: size,
          cursor: disabled ? "default" : "ns-resize",
          position: "relative",
          borderRadius: "50%",
          background: dragging ? "var(--tg-surface-highest)" : "var(--tg-surface-high)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          outline: "none",
        }}
      >
        <svg width={size} height={size} style={{ position: "absolute", transform: "rotate(135deg)" }}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--tg-outline-variant)"
            strokeWidth={5}
            strokeDasharray={`${arcLen} ${c}`}
            strokeLinecap="round"
            opacity={0.5}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--tg-primary)"
            strokeWidth={5}
            strokeDasharray={`${valueArc} ${c}`}
            strokeLinecap="round"
            style={{ transition: dragging ? "none" : "stroke-dasharray .08s linear" }}
          />
        </svg>
        <span
          style={{
            position: "relative",
            fontSize: size * 0.22,
            fontWeight: 600,
            fontVariantNumeric: "tabular-nums",
            color: "var(--tg-on-surface)",
            pointerEvents: "none",
          }}
        >
          {fmt(value, precision)}
          {unit ? (
            <span style={{ fontSize: size * 0.15, opacity: 0.55, marginLeft: 2 }}>{unit}</span>
          ) : null}
        </span>
        {showTip && (
          <div
            style={{
              position: "absolute",
              top: -28,
              background: "var(--tg-surface-highest)",
              color: "var(--tg-on-surface)",
              fontSize: 12,
              padding: "3px 8px",
              borderRadius: 8,
              whiteSpace: "nowrap",
              boxShadow: "0 2px 8px rgba(0,0,0,.35)",
              pointerEvents: "none",
            }}
          >
            min {fmt(min, precision)} · max {fmt(max, precision)}
          </div>
        )}
      </div>
    </div>
  );
}
