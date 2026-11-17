# -*- coding: utf-8 -*-
"""TouchGUI runtime — Python-мост между веб-клиентом и параметрами TouchDesigner.

Модуль подключается в TouchDesigner как Text DAT (через ``mod()`` или
Extensions). Все обращения к TD API (``op``, ``me``, ``project``) находятся
внутри функций, поэтому файл остаётся валидным Python 3 вне TD.

Основные задачи:
    * чтение конфига из Text DAT ``touchgui_config`` и сборка схемы;
    * индекс контроллов id -> (definition, op, par) для быстрой записи;
    * чтение/запись значений контроллов (knob, toggle, button, select,
      text, xy, color);
    * чтение метрик из CHOP/пар;
    * пресеты в Table DAT ``touchgui_presets``;
    * кадровый tick: детекция изменения конфига, рассылка values/metrics.
"""

from __future__ import annotations

import json
import math
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple

# Имена DAT, с которыми работает мост (соседи внутри COMP touchgui).
CONFIG_DAT = "touchgui_config"
PRESET_DAT = "touchgui_presets"

# Порог сравнения числовых значений при рассылке дельт.
EPS = 1e-4

# Общее состояние модуля (модуль singleton внутри TD).
_state: Dict[str, Any] = {
    "ws": None,                # Web Server DAT с открытыми соединениями
    "schema": None,            # последняя собранная схема
    "config_hash": None,       # hash текста конфига на момент пересборки
    "controls": None,          # id -> entry (def/op/par)
    "metrics": None,           # список (full_id, metric_def)
    "values": {},              # последние отправленные входные значения
    "metrics_prev": {},        # последние отправленные метрики
    "pending_values": {},      # значения, изменённые через set_value
    "seq": 0,                  # счётчик сообщений values/metrics
}

_log_stamp: Dict[str, float] = {}


def debug_controls():
    print("\n========== TOUCHGUI DEBUG ==========")

    controls = map_controls()

    for cid, entry in controls.items():
        cdef = entry["def"]
        p = _refresh_entry(entry)

        print("\nCONTROL:", cid)
        print("  Config type:", cdef.get("type"))
        print("  Config par:", cdef.get("par"))
        print("  Operator:", entry.get("op"))
        print("  Parameter:", p)

        if p is None:
            print("  STATUS: PARAMETER NOT FOUND")
            continue

        print("  Valid:", _par_valid(p))
        print("  Category:", _category(cdef, p))

        try:
            print("  Value:", p.eval())
            print("  isNumber:", p.isNumber)
            print("  isToggle:", p.isToggle)
            print("  isPulse:", p.isPulse)
            print("  isMenu:", p.isMenu)
            print("  isString:", p.isString)
            print("  Style:", p.style)
        except Exception as exc:
            print("  ERROR:", exc)

    print("\n========== END DEBUG ==========\n")

def debug_set(control_id, value):
    print("\n========== SET TEST ==========")

    entry = _resolve_entry(control_id)

    if entry is None:
        print("CONTROL NOT FOUND:", control_id)
        return

    p = entry.get("par")

    print("ID:", control_id)
    print("PARAMETER:", p)
    print("CATEGORY:", _category(entry["def"], p))

    before = _read_value(entry["def"], p)
    print("BEFORE:", before)

    result = set_value(control_id, value)

    print("RESULT:", result)
    print("AFTER:", _read_value(entry["def"], p))

    print("========== END SET TEST ==========\n")

# ---------------------------------------------------------------------------
# Логирование (не чаще одного сообщения в 5 секунд на текст)
# ---------------------------------------------------------------------------

def _log(message: str, period: float = 5.0) -> None:
    """Печать сообщения в textport с троттлингом ``period`` секунд."""
    now = time.time()
    if len(_log_stamp) > 400:  # не даём словарю расти бесконечно
        cutoff = now - period
        for key in [k for k, t in _log_stamp.items() if t < cutoff]:
            _log_stamp.pop(key, None)
    last = _log_stamp.get(message)
    if last is not None and now - last < period:
        return
    _log_stamp[message] = now
    print("[TouchGUI] " + str(message))


# ---------------------------------------------------------------------------
# Поиск операторов/параметров
# ---------------------------------------------------------------------------

def _find(path: str) -> Any:
    """Найти оператор: абсолютный путь, относительный, затем от родителя."""
    if not path:
        return None
    try:
        o = op(path)  # noqa: F821 — TD builtin внутри TD
        if o is not None:
            return o
    except Exception:
        pass
    try:
        o = op("./" + path)  # noqa: F821
        if o is not None:
            return o
    except Exception:
        pass
    try:
        base = me.parent()  # noqa: F821
        if base is not None:
            return base.op(path)
    except Exception:
        pass
    return None


def _get_par(o: Any, name: str) -> Any:
    """Достать параметр по имени (attribute-access с fallback на индекс)."""
    if o is None or not name:
        return None
    try:
        p = getattr(o.par, name)
        if p is not None:
            return p
    except Exception:
        pass
    try:
        return o.par[name]
    except Exception:
        return None


def _par_valid(p: Any) -> bool:
    """Проверка p.valid без исключений."""
    if p is None:
        return False
    try:
        return bool(p.valid)
    except Exception:
        return True


def project_name() -> str:
    """Имя текущего проекта TD (fallback — 'TouchDesigner')."""
    try:
        p = project()  # noqa: F821
        if p is not None and getattr(p, "name", None):
            return str(p.name)
    except Exception:
        pass
    return "TouchDesigner"


def _label(value: Any, fallback: str) -> Dict[str, str]:
    """Нормализация label: строка -> {ru, en}; dict -> {ru, en} с дефолтами."""
    if isinstance(value, dict):
        ru = value.get("ru", value.get("en", fallback))
        en = value.get("en", value.get("ru", fallback))
        return {"ru": str(ru), "en": str(en)}
    if isinstance(value, str) and value:
        return {"ru": value, "en": value}
    return {"ru": fallback, "en": fallback}


# ---------------------------------------------------------------------------
# Конфиг и схема
# ---------------------------------------------------------------------------

def load_config() -> Dict[str, Any]:
    """Прочитать и распарсить Text DAT ``touchgui_config``.

    При любой ошибке (DAT отсутствует, битый JSON) возвращает пустой dict
    и пишет ошибку в textport (с троттлингом).
    """
    try:
        dat = _find(CONFIG_DAT)
        if dat is None:
            _log('DAT "%s" не найден' % CONFIG_DAT)
            return {}
        text = getattr(dat, "text", "") or ""
        if not text.strip():
            return {}
        cfg = json.loads(text)
        if not isinstance(cfg, dict):
            raise ValueError("конфиг должен быть JSON-объектом")
        return cfg
    except Exception as exc:
        _log("ошибка чтения конфига: %s" % exc)
        return {}


def _iter_groups(groups: Any, prefix: str = ""):
    """Обход групп рекурсивно: yield (full_id, group_def).

    full_id склеивается из пути групп: "lighting/sub/dim".
    """
    for g in groups or []:
        if not isinstance(g, dict):
            continue
        gid = str(g.get("id", "group"))
        full = (prefix + "/" + gid) if prefix else gid
        yield full, g
        for item in _iter_groups(g.get("groups"), full):
            yield item


def _find_group(cfg: Dict[str, Any], group_id: str) -> Optional[dict]:
    """Найти группу по полному id (или по локальному id) рекурсивно."""
    for full, g in _iter_groups(cfg.get("groups")):
        if full == group_id or str(g.get("id")) == group_id:
            return g
    return None


_OPTIONAL_CONTROL_KEYS = ("min", "max", "unit", "precision", "metric", "step", "default")
_OPTIONAL_METRIC_KEYS = ("unit", "precision", "min", "max")


def _build_group(group: dict, prefix: str) -> dict:
    """Собрать узел группы для схемы (id = полный путь)."""
    gid = str(group.get("id", "group"))
    full = (prefix + "/" + gid) if prefix else gid
    out: Dict[str, Any] = {"id": full, "label": _label(group.get("label"), gid)}
    if group.get("icon"):
        out["icon"] = str(group["icon"])
    if group.get("quick") is not None:
        out["quick"] = [str(x) for x in group["quick"]]
    if group.get("order") is not None:
        out["order"] = [str(x) for x in group["order"]]

    controls: List[dict] = []
    for c in group.get("controls") or []:
        if not isinstance(c, dict):
            continue
        cid = str(c.get("id", "control"))
        item: Dict[str, Any] = {
            "id": full + "/" + cid,
            "type": str(c.get("type", "knob")),
            "label": _label(c.get("label"), cid),
        }
        for key in _OPTIONAL_CONTROL_KEYS:
            if key in c:
                item[key] = c[key]
        controls.append(item)
    out["controls"] = controls

    metrics: List[dict] = []
    for m in group.get("metrics") or []:
        if not isinstance(m, dict):
            continue
        mid = str(m.get("id", "metric"))
        item = {"id": full + "/" + mid, "label": _label(m.get("label"), mid)}
        for key in _OPTIONAL_METRIC_KEYS:
            if key in m:
                item[key] = m[key]
        metrics.append(item)
    out["metrics"] = metrics

    out["groups"] = [
        _build_group(sub, full)
        for sub in group.get("groups") or []
        if isinstance(sub, dict)
    ]
    return out


def _build_schema(cfg: Dict[str, Any]) -> Dict[str, Any]:
    """Собрать полную схему из конфига."""
    name = project_name()
    schema: Dict[str, Any] = {
        "version": 1,
        "project": name,
        "root": {"id": "root", "label": {"ru": name, "en": name}, "groups": []},
    }
    try:
        schema["root"]["groups"] = [
            _build_group(g, "")
            for g in cfg.get("groups") or []
            if isinstance(g, dict)
        ]
    except Exception as exc:
        _log("ошибка сборки схемы: %s" % exc)
    return schema


def build_schema() -> Dict[str, Any]:
    """Собрать схему из текущего конфига и запомнить её."""
    schema = _build_schema(load_config())
    _state["schema"] = schema
    return schema


def _build_control_index(cfg: Dict[str, Any]) -> Dict[str, dict]:
    """Индекс контроллов: full_id -> {def, op, par, op_path, par_name}."""
    index: Dict[str, dict] = {}
    for full, g in _iter_groups(cfg.get("groups")):
        for c in g.get("controls") or []:
            if not isinstance(c, dict):
                continue
            cid = str(c.get("id", "control"))
            full_id = full + "/" + cid
            par_path = str(c.get("par", ""))
            op_path, sep, par_name = par_path.rpartition(".")
            o = _find(op_path) if sep else None
            p = _get_par(o, par_name) if o is not None else None
            index[full_id] = {
                "def": c,
                "op": o,
                "par": p,
                "op_path": op_path,
                "par_name": par_name,
            }
    return index


def _build_metric_index(cfg: Dict[str, Any]) -> List[Tuple[str, dict]]:
    """Список метрик: [(full_id, metric_def), ...]."""
    out: List[Tuple[str, dict]] = []
    for full, g in _iter_groups(cfg.get("groups")):
        for m in g.get("metrics") or []:
            if isinstance(m, dict):
                out.append((full + "/" + str(m.get("id", "metric")), m))
    return out


def _rebuild() -> None:
    """Пересобрать схему и все индексы из текущего конфига."""
    cfg = load_config()
    _state["schema"] = _build_schema(cfg)
    try:
        _state["controls"] = _build_control_index(cfg)
    except Exception as exc:
        _log("ошибка индекса контроллов: %s" % exc)
        _state["controls"] = {}
    try:
        _state["metrics"] = _build_metric_index(cfg)
    except Exception as exc:
        _log("ошибка индекса метрик: %s" % exc)
        _state["metrics"] = []


def map_controls() -> Dict[str, dict]:
    """Индекс контроллов id -> (control_def, op, par); строится лениво."""
    if _state["controls"] is None:
        try:
            _state["controls"] = _build_control_index(load_config())
        except Exception as exc:
            _log("ошибка индекса контроллов: %s" % exc)
            _state["controls"] = {}
    return _state["controls"]


def _refresh_entry(entry: dict) -> Any:
    """Пере-resolve пара, если он отсутствует/невалиден (op мог появиться)."""
    p = entry.get("par")
    if p is not None and _par_valid(p):
        return p
    o = _find(str(entry.get("op_path", "")))
    p = _get_par(o, str(entry.get("par_name", ""))) if o is not None else None
    entry["op"] = o
    entry["par"] = p
    return p


def _resolve_entry(control_id: str) -> Optional[dict]:
    """Достать запись контролла с пере-resolve при необходимости."""
    entry = map_controls().get(control_id)
    if entry is None:
        return None
    _refresh_entry(entry)
    return entry


# ---------------------------------------------------------------------------
# Категории параметров и чтение/запись
# ---------------------------------------------------------------------------

def _category(control_def: dict, p: Any) -> str:
    """Определить категорию параметра: button/toggle/color/xy/select/text/number."""
    if p is None:
        return "none"
    try:
        typ = str(control_def.get("type", "knob")).lower()
        if typ == "button" or bool(p.isPulse):
            return "button"
        if typ == "toggle" or bool(p.isToggle):
            return "toggle"
        style = str(getattr(p, "style", "") or "")
        if typ in ("color", "rgba") or style == "RGBA":
            return "color"
        if typ in ("xy", "xyz", "xyzw") or style in ("XY", "XYZ", "XYZW"):
            return "xy"
        if typ == "select" or bool(p.isMenu):
            return "select"
        if typ in ("text", "string") or bool(p.isString):
            return "text"
        if bool(p.isNumber):
            return "number"
        return "unknown"
    except Exception:
        return "unknown"


def _read_group(p: Any) -> List[float]:
    """Прочать мультикомпонентный параметр через parGroup -> список float."""
    g = p.parGroup
    v = g.eval()
    if isinstance(v, (list, tuple)):
        return [float(x) for x in v]
    out: List[float] = []
    for comp in g.pars:
        out.append(float(comp.eval()))
    return out


def _write_group(p: Any, values: List[float]) -> None:
    """Записать значения в мультикомпонентный параметр (с fallback)."""
    g = p.parGroup
    if hasattr(g, "val"):
        try:
            g.val = list(values)
            return
        except Exception:
            pass
    for i, comp in enumerate(g.pars):
        if i < len(values):
            comp.val = values[i]


def _hex2f(x: float) -> str:
    return "%02X" % max(0, min(255, int(round(float(x) * 255.0))))


def _read_hex(p: Any) -> str:
    """RGBA parGroup -> строка '#RRGGBB' или '#RRGGBBAA'."""
    vals = _read_group(p)
    if len(vals) < 3:
        raise ValueError("ожидается RGBA-параметр")
    alpha = vals[3] if len(vals) > 3 else None
    out = "#" + _hex2f(vals[0]) + _hex2f(vals[1]) + _hex2f(vals[2])
    if alpha is not None:
        out += _hex2f(alpha)
    return out


def _parse_color(value: Any) -> Optional[List[float]]:
    """Разобрать цвет: '#RRGGBB[AA]' / '#RGB' / [r,g,b(,a)] -> 4 float 0..1."""
    if isinstance(value, str):
        s = value.strip()
        if s.startswith("#"):
            s = s[1:]
        if len(s) == 3:
            s = "".join(ch * 2 for ch in s)
        if len(s) not in (6, 8):
            return None
        try:
            r = int(s[0:2], 16) / 255.0
            g = int(s[2:4], 16) / 255.0
            b = int(s[4:6], 16) / 255.0
            a = int(s[6:8], 16) / 255.0 if len(s) == 8 else 1.0
        except ValueError:
            return None
        return [r, g, b, a]
    if isinstance(value, (list, tuple)):
        try:
            vals = [float(x) for x in value]
        except (TypeError, ValueError):
            return None
        if len(vals) == 3:
            vals.append(1.0)
        if len(vals) != 4:
            return None
        return [max(0.0, min(1.0, v)) for v in vals]
    return None


def _as_floats(value: Any) -> Optional[List[float]]:
    """Привести значение к списку float (для xy/xyz)."""
    if isinstance(value, (list, tuple)):
        try:
            return [float(x) for x in value]
        except (TypeError, ValueError):
            return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return [float(value)]
    return None


def _clamp_par(p: Any, v: float) -> float:
    """Кламп по min/max, если у пара включены clampMin/clampMax."""
    try:
        if bool(p.clampMin):
            v = max(v, float(p.min))
        if bool(p.clampMax):
            v = min(v, float(p.max))
    except Exception:
        pass
    return v


def _read_value(control_def: dict, p: Any) -> Tuple[bool, Any]:
    """Прочать значение контролла. Возвращает (ok, value)."""
    cat = _category(control_def, p)
    try:
        if cat == "button":
            return False, None  # pulse не читается и не входит в values
        if cat == "none" or not _par_valid(p):
            return False, None
        if cat == "toggle":
            return True, bool(p.eval())
        if cat == "color":
            return True, _read_hex(p)
        if cat == "xy":
            return True, _read_group(p)
        if cat == "select":
            if bool(p.isMenu):
                names = list(p.menuNames)
                try:
                    idx = int(p.menuIndex)
                except Exception:
                    idx = -1
                if 0 <= idx < len(names):
                    return True, str(names[idx])
            return True, str(p.eval())
        if cat == "text":
            return True, str(p.eval())
        if cat == "number":
            v = float(p.eval())
            if not math.isfinite(v):
                return False, None
            if bool(p.isInt):
                return True, int(round(v))
            return True, v
        # неизвестная категория — пробуем универсально
        v = p.eval()
        if isinstance(v, bool):
            return True, v
        if isinstance(v, (int, float)):
            fv = float(v)
            return (True, fv) if math.isfinite(fv) else (False, None)
        if isinstance(v, (list, tuple)):
            return True, [float(x) for x in v]
        if isinstance(v, str):
            return True, v
        return False, None
    except Exception as exc:
        _log('чтение контролла "%s": %s' % (control_def.get("id", "?"), exc))
        return False, None


def read_values() -> Dict[str, Any]:
    """Все входные значения контроллов (кроме button) -> {id: value}."""
    out: Dict[str, Any] = {}
    for cid, entry in map_controls().items():
        try:
            p = _refresh_entry(entry)
            ok, v = _read_value(entry["def"], p)
            if ok:
                out[cid] = v
        except Exception as exc:
            _log("чтение контролла %s: %s" % (cid, exc))
    return out


def set_value(control_id: str, value: Any) -> Tuple[bool, str]:
    """Записать значение контролла. Возвращает (ok, error).

    Неподходящий тип пара / отсутствующий пар / неверное значение —
    не исключение, а (False, текст ошибки) для ack.
    """
    entry = _resolve_entry(str(control_id))
    if entry is None:
        return False, 'контролл "%s" не найден в конфиге' % control_id

    p = entry.get("par")
    cdef = entry["def"]
    if p is None or not _par_valid(p):
        where = "%s.%s" % (entry.get("op_path", "?"), entry.get("par_name", "?"))
        return False, 'параметр "%s" не найден' % where

    cat = _category(cdef, p)
    if cat == "none":
        return False, "параметр недоступен"

    try:
        if cat == "button":
            p.pulse()
            return True, ""

        if cat == "toggle":
            if isinstance(value, str):
                val: Any = value.strip().lower() in ("1", "true", "on", "yes")
            else:
                val = bool(value)
            p.val = val

        elif cat == "number":
            v = float(value)  # bool/строка-число тоже пройдут
            v = _clamp_par(p, v)
            if bool(p.isInt):
                v = int(round(v))
            p.val = v

        elif cat == "select":
            if bool(p.isMenu) and isinstance(value, (int, float)) and not isinstance(value, bool):
                idx = int(value)
                names = list(p.menuNames)
                if not (0 <= idx < len(names)):
                    return False, "индекс %d вне диапазона меню (0..%d)" % (idx, len(names) - 1)
                p.menuIndex = idx
            else:
                s = str(value)
                if bool(p.isMenu):
                    names = [str(n) for n in p.menuNames]
                    if s not in names:
                        return False, 'значение "%s" не входит в список меню' % s
                p.val = s

        elif cat == "text":
            p.val = str(value)

        elif cat == "xy":
            vals = _as_floats(value)
            if vals is None:
                return False, "ожидается массив чисел [x, y, ...]"
            _write_group(p, vals)

        elif cat == "color":
            rgba = _parse_color(value)
            if rgba is None:
                return False, 'некорректный цвет (ожидается "#RRGGBB[AA]")'
            _write_group(p, rgba)

        else:
            return False, 'тип параметра не поддерживается (par "%s", style="%s")' % (
                entry.get("par_name", "?"), getattr(p, "style", "?"))

    except Exception as exc:
        return False, "ошибка записи: %s" % exc

    # запомнить фактическое значение для рассылки в ближайшем tick
    try:
        ok, v = _read_value(cdef, p)
        if not ok:
            v = [_float(x) for x in value] if isinstance(value, (list, tuple)) else value
        _state["pending_values"][str(control_id)] = v
    except Exception:
        pass
    return True, ""


def _float(x: Any) -> Any:
    try:
        return float(x)
    except Exception:
        return x


# ---------------------------------------------------------------------------
# Метрики
# ---------------------------------------------------------------------------

def _metric_defs() -> List[Tuple[str, dict]]:
    if _state["metrics"] is None:
        try:
            _state["metrics"] = _build_metric_index(load_config())
        except Exception as exc:
            _log("ошибка индекса метрик: %s" % exc)
            _state["metrics"] = []
    return _state["metrics"]


def read_metrics() -> Dict[str, float]:
    """Все метрики -> {full_id: float}; NaN/inf/None пропускаются."""
    out: Dict[str, float] = {}
    for mid, m in _metric_defs():
        try:
            v: Optional[float] = None
            chop_path = m.get("chop")
            if chop_path:
                c = _find(str(chop_path))
                if c is None:
                    continue
                chan = c[str(m.get("channel", ""))]
                v = float(chan.eval())
            elif m.get("par"):
                path, sep, pname = str(m["par"]).rpartition(".")
                if not sep:
                    continue
                o = _find(path)
                if o is None:
                    continue
                p = _get_par(o, pname)
                if p is None:
                    continue
                v = float(p.eval())
            if v is not None and math.isfinite(v):
                out[mid] = v
        except Exception as exc:
            _log("метрика %s: %s" % (mid, exc))
    return out


# ---------------------------------------------------------------------------
# Пресеты (Table DAT touchgui_presets: id, name, values, created)
# ---------------------------------------------------------------------------

def _presets_table() -> Any:
    return _find(PRESET_DAT)


def _preset_columns(t: Any) -> Dict[str, int]:
    """Карта имя колонки -> индекс (из строки заголовков)."""
    cols: Dict[str, int] = {}
    for c in range(int(t.numCols)):
        try:
            name = t[0, c]
        except Exception:
            continue
        if name is not None:
            cols[str(name)] = c
    return cols


def list_presets() -> List[dict]:
    """Сериализация Table DAT пресетов в список dict'ов для welcome/presets."""
    t = _presets_table()
    out: List[dict] = []
    if t is None:
        _log('Table DAT "%s" не найден' % PRESET_DAT)
        return out
    try:
        cols = _preset_columns(t)
        i_id = cols.get("id", 0)
        i_name = cols.get("name", 1)
        i_values = cols.get("values", 2)
        i_created = cols.get("created", 3)
        for r in range(1, int(t.numRows)):
            pid = t[r, i_id]
            if pid is None or str(pid) == "":
                continue
            raw = t[r, i_values]
            try:
                values = json.loads(str(raw)) if raw else {}
                if not isinstance(values, dict):
                    values = {}
            except Exception:
                values = {}
            out.append({
                "id": str(pid),
                "name": str(t[r, i_name] or ""),
                "values": values,
                "created": str(t[r, i_created] or ""),
            })
    except Exception as exc:
        _log("чтение пресетов: %s" % exc)
    return out


def save_preset(name: str, values: Optional[dict]) -> Tuple[bool, str]:
    """Сохранить пресет. Возвращает (ok, id) либо (False, ошибка).

    Если values не переданы — сохраняются текущие значения контроллов.
    """
    t = _presets_table()
    if t is None:
        return False, 'Table DAT "%s" не найден' % PRESET_DAT
    if values is None or not isinstance(values, dict):
        values = read_values()
    pid = uuid.uuid4().hex[:8]
    try:
        t.appendRow([
            pid,
            str(name),
            json.dumps(values, ensure_ascii=False),
            str(int(time.time())),
        ])
    except Exception as exc:
        return False, "не удалось записать пресет: %s" % exc
    return True, pid


def _preset_row(t: Any, pid: str) -> int:
    cols = _preset_columns(t)
    i_id = cols.get("id", 0)
    for r in range(1, int(t.numRows)):
        if str(t[r, i_id]) == pid:
            return r
    return -1


def delete_preset(pid: str) -> Tuple[bool, str]:
    """Удалить пресет по id."""
    t = _presets_table()
    if t is None:
        return False, 'Table DAT "%s" не найден' % PRESET_DAT
    try:
        r = _preset_row(t, str(pid))
        if r < 0:
            return False, 'пресет "%s" не найден' % pid
        t.deleteRow(r)
        return True, ""
    except Exception as exc:
        return False, "ошибка удаления: %s" % exc


def rename_preset(pid: str, name: str) -> Tuple[bool, str]:
    """Переименовать пресет по id."""
    t = _presets_table()
    if t is None:
        return False, 'Table DAT "%s" не найден' % PRESET_DAT
    try:
        r = _preset_row(t, str(pid))
        if r < 0:
            return False, 'пресет "%s" не найден' % pid
        try:
            cols = _preset_columns(t)
            t[r, cols.get("name", 1)] = str(name)
            return True, ""
        except Exception:
            # fallback: удалить строку и дописать заново с теми же данными
            cols = _preset_columns(t)
            row = [t[r, cols.get(k, i)] for i, k in
                   enumerate(("id", "name", "values", "created"))]
            row[1] = str(name)
            t.deleteRow(r)
            t.appendRow(row)
            return True, ""
    except Exception as exc:
        return False, "ошибка переименования: %s" % exc


def load_preset(pid: str) -> Tuple[bool, str]:
    """Применить пресет: set_value для каждой пары + рассылка values."""
    preset = None
    for p in list_presets():
        if p["id"] == str(pid):
            preset = p
            break
    if preset is None:
        return False, 'пресет "%s" не найден' % pid

    errors: List[str] = []
    for cid, v in (preset.get("values") or {}).items():
        ok, err = set_value(str(cid), v)
        if not ok:
            errors.append("%s: %s" % (cid, err))

    # разослать применённые значения всем клиентам
    try:
        changed: Dict[str, Any] = {}
        for cid in (preset.get("values") or {}):
            entry = _resolve_entry(str(cid))
            if entry is None:
                continue
            ok, v = _read_value(entry["def"], entry.get("par"))
            if ok:
                changed[str(cid)] = v
        if changed:
            for cid, v in changed.items():
                _state["values"][cid] = v
            _state["seq"] += 1
            broadcast({"type": "values", "values": changed, "seq": _state["seq"]})
    except Exception as exc:
        _log("рассылка после load пресета: %s" % exc)

    if errors:
        return False, "; ".join(errors)
    return True, ""


# ---------------------------------------------------------------------------
# config.quick / config.order
# ---------------------------------------------------------------------------

def update_group_field(group_id: str, field: str, items: Any) -> Tuple[bool, str]:
    """Обновить поле ``quick``/``order`` группы в конфиге.

    Находит группу по id рекурсивно, записывает конфиг обратно в DAT,
    пересобирает схему и рассылает schema всем клиентам.
    """
    if field not in ("quick", "order"):
        return False, 'неподдерживаемое поле "%s"' % field
    if not isinstance(items, list):
        return False, "ожидается список"
    cfg = load_config()
    group = _find_group(cfg, str(group_id))
    if group is None:
        return False, 'группа "%s" не найдена' % group_id
    dat = _find(CONFIG_DAT)
    if dat is None:
        return False, 'DAT "%s" не найден' % CONFIG_DAT
    group[field] = [str(x) for x in items]
    try:
        text = json.dumps(cfg, indent=2, ensure_ascii=False)
        dat.text = text
    except Exception as exc:
        return False, "не удалось записать конфиг: %s" % exc
    _state["config_hash"] = hash(text)
    _rebuild()
    broadcast({"type": "schema", "schema": _state["schema"]})
    return True, ""


def set_group_quick(group_id: str, quick: Any) -> Tuple[bool, str]:
    """Обновить быстрый доступ (quick) группы."""
    return update_group_field(group_id, "quick", quick)


def set_group_order(group_id: str, order: Any) -> Tuple[bool, str]:
    """Обновить порядок (order) контролов группы."""
    return update_group_field(group_id, "order", order)


# ---------------------------------------------------------------------------
# Рассылка сообщений
# ---------------------------------------------------------------------------

def attach(dat: Any) -> None:
    """Запомнить Web Server DAT (вызывается из его callbacks)."""
    _state["ws"] = dat


def detach(dat: Any) -> None:
    """Забыть Web Server DAT, если это тот же объект."""
    if _state["ws"] is dat:
        _state["ws"] = None


def broadcast(msg: dict, dat: Any = None) -> int:
    """Отправить JSON всем открытым WebSocket-клиентам. Возвращает число отправок."""
    ws = dat if dat is not None else _state["ws"]
    if ws is None:
        return 0
    try:
        conns = list(ws.webSocketConnections)
    except Exception:
        return 0
    if not conns:
        return 0
    try:
        payload = json.dumps(msg, ensure_ascii=False)
    except Exception as exc:
        _log("broadcast: не сериализуется сообщение: %s" % exc)
        return 0
    sent = 0
    for c in conns:
        try:
            ws.webSocketSendText(c, payload)
            sent += 1
        except Exception as exc:
            _log("broadcast: ошибка отправки %s: %s" % (c, exc))
    return sent


def welcome() -> dict:
    """Собрать сообщение welcome (schema + values + presets + seq)."""
    return {
        "type": "welcome",
        "schema": build_schema(),
        "values": read_values(),
        "presets": list_presets(),
        "seq": int(_state["seq"]),
    }


def current_seq() -> int:
    """Текущий счётчик сообщений values/metrics."""
    return int(_state["seq"])


# ---------------------------------------------------------------------------
# Сравнение значений
# ---------------------------------------------------------------------------

def _same(a: Any, b: Any) -> bool:
    """Сравнение значений с допуском EPS для чисел."""
    if isinstance(a, bool) or isinstance(b, bool):
        return bool(a) == bool(b) and isinstance(a, bool) == isinstance(b, bool)
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return abs(float(a) - float(b)) <= EPS
    if isinstance(a, (list, tuple)) and isinstance(b, (list, tuple)):
        if len(a) != len(b):
            return False
        return all(_same(x, y) for x, y in zip(a, b))
    return a == b


# ---------------------------------------------------------------------------
# Кадровый tick
# ---------------------------------------------------------------------------

def _has_connections() -> bool:
    ws = _state["ws"]
    if ws is None:
        return False
    try:
        return len(ws.webSocketConnections) > 0
    except Exception:
        return False


def _tick_config() -> None:
    """Пересборка схемы при изменении текста DAT конфига."""
    try:
        dat = _find(CONFIG_DAT)
        text = getattr(dat, "text", None) if dat is not None else None
        h = hash(text) if isinstance(text, str) else None
        if h != _state["config_hash"]:
            _state["config_hash"] = h
            _rebuild()
            broadcast({"type": "schema", "schema": _state["schema"]})
    except Exception as exc:
        _log("tick: ошибка конфига: %s" % exc)


def _tick_values() -> None:
    """Сравнить входные значения с прошлыми и разослать дельту."""
    try:
        cur = read_values()
        prev = _state["values"]
        changed: Dict[str, Any] = {}

        # значения, изменённые set_value (в т.ч. если чтение парта не удалось)
        for cid, v in _state["pending_values"].items():
            changed[cid] = v
        _state["pending_values"].clear()

        for cid, v in cur.items():
            if cid not in prev or not _same(prev[cid], v):
                changed[cid] = v

        for cid in list(prev):
            if cid not in cur and cid not in changed:
                del prev[cid]

        if not changed:
            return
        for cid, v in changed.items():
            prev[cid] = v
        _state["seq"] += 1
        broadcast({"type": "values", "values": changed, "seq": _state["seq"]})
    except Exception as exc:
        _log("tick values: %s" % exc)


def _tick_metrics() -> None:
    """Сравнить метрики с прошлыми (eps 1e-4) и разослать дельту."""
    try:
        cur = read_metrics()
        prev = _state["metrics_prev"]
        changed: Dict[str, float] = {}
        for cid, v in cur.items():
            old = prev.get(cid)
            if old is None or not _same(old, v):
                changed[cid] = v
        for cid in list(prev):
            if cid not in cur:
                del prev[cid]
        if not changed:
            return
        for cid, v in changed.items():
            prev[cid] = v
        _state["seq"] += 1
        broadcast({"type": "metrics", "values": changed, "seq": _state["seq"]})
    except Exception as exc:
        _log("tick metrics: %s" % exc)


def tick() -> None:
    """Один кадр: конфиг -> values -> metrics. Работает только при клиентах."""
    if not _has_connections():
        return
    _tick_config()
    _tick_values()
    _tick_metrics()
