# -*- coding: utf-8 -*-
"""touchgui_frame — callbacks Execute DAT (тик раз в кадр, TouchGUI).

Параметры Execute DAT: Execute = On Frame Start, Active = On.
Каждый кадр вызывается runtime.tick(): детекция изменения конфига,
рассылка values/metrics подключённым клиентам.

Все обращения к TD API находятся внутри функций — файл остаётся
валидным Python 3 вне TouchDesigner.
"""

from __future__ import annotations

import time
from typing import Any, Dict

# Кэш модуля touchgui_runtime (повторные попытки, пока не найден).
_RT = None
_log_stamp: Dict[str, float] = {}


def _log(message: str, period: float = 5.0) -> None:
    """Печать в textport с троттлингом ``period`` секунд."""
    now = time.time()
    if len(_log_stamp) > 400:
        cutoff = now - period
        for key in [k for k, t in _log_stamp.items() if t < cutoff]:
            _log_stamp.pop(key, None)
    last = _log_stamp.get(message)
    if last is not None and now - last < period:
        return
    _log_stamp[message] = now
    print("[TouchGUI] " + str(message))


def _runtime() -> Any:
    """Найти модуль touchgui_runtime: mod() -> op()+mod(path)."""
    global _RT
    if _RT is not None:
        return _RT
    try:
        m = mod("touchgui_runtime")  # noqa: F821 — TD builtin
        if m is not None:
            _RT = m
            return m
    except Exception:
        pass
    for path in ("touchgui_runtime", "/project1/touchgui/touchgui_runtime"):
        try:
            d = op(path)  # noqa: F821
            if d is None:
                continue
            m = mod(d.path)  # noqa: F821
            if m is not None:
                _RT = m
                return m
        except Exception:
            continue
    return None


def onFrameStart(frame: int) -> None:
    """Вызывается в начале кадра: прогнать runtime.tick()."""
    rt = _runtime()
    if rt is None:
        return
    try:
        rt.tick()
    except Exception as exc:
        _log("tick (frame %s): %s" % (frame, exc))


def onFrameEnd(frame: int) -> None:
    """Вызывается в конце кадра — ничего не делаем."""
    pass
