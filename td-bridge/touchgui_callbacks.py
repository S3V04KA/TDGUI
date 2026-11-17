# -*- coding: utf-8 -*-
"""touchgui_callbacks — callbacks для Web Server DAT (TouchGUI).

Подключается в параметре Web Server DAT "Callbacks". Все обращения к TD API
(``op``, ``mod``, ``project``) находятся внутри функций, поэтому файл остаётся
валидным Python 3 вне TouchDesigner.

Реализовано:
    * onHTTPRequest  — discovery endpoint ``/touchgui/discover`` + CORS;
    * onWebSocket*   — приём сообщений, диспетчер по type, ответы
      welcome/ack/pong/error;
    * onServerStart/Stop — привязка runtime-модуля к Web Server DAT.
"""

from __future__ import annotations

import json
import time
from typing import Any, Dict, List, Optional

# Кэш модуля touchgui_runtime (повторные попытки, пока не найден).
_RT = None
_log_stamp: Dict[str, float] = {}

PROTO = 1
APP = "touchgui"


# ---------------------------------------------------------------------------
# Логирование (не чаще одного сообщения в 5 секунд на текст)
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Доступ к runtime-модулю
# ---------------------------------------------------------------------------

def _runtime():
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


def _project_name() -> str:
    """Имя проекта для discover-ответа."""
    rt = _runtime()
    try:
        if rt is not None:
            return str(rt.project_name())
    except Exception:
        pass
    try:
        p = project()  # noqa: F821
        if p is not None and getattr(p, "name", None):
            return str(p.name)
    except Exception:
        pass
    return "TouchDesigner"


def _send(dat: Any, client: str, msg: dict) -> None:
    """Отправить JSON-сообщение одному клиенту, не роняя TD."""
    try:
        dat.webSocketSendText(client, json.dumps(msg, ensure_ascii=False))
    except Exception as exc:
        _log("send to %s: %s" % (client, exc))


# ---------------------------------------------------------------------------
# HTTP: discovery + CORS
# ---------------------------------------------------------------------------

def onHTTPRequest(dat, request: dict, response: dict) -> dict:
    """Обработка HTTP-запросов Web Server DAT.

    ``/touchgui/discover`` → 200 JSON {app, proto, project} + CORS-заголовки.
    OPTIONS → 204. Всё остальное → 404.
    """
    try:
        method = str(request.get("method", "GET")).upper()
        uri = str(request.get("uri", "")).split("?")[0].rstrip("/")

        response["Access-Control-Allow-Origin"] = "*"
        response["Access-Control-Allow-Methods"] = "GET, OPTIONS"
        response["Access-Control-Allow-Headers"] = "*"

        if method == "OPTIONS":
            response["statusCode"] = 204
            response["statusReason"] = "No Content"
            response["data"] = ""
            return response

        if uri == "/touchgui/discover":
            payload = {"app": APP, "proto": PROTO, "project": _project_name()}
            response["statusCode"] = 200
            response["statusReason"] = "OK"
            response["data"] = json.dumps(payload, ensure_ascii=False)
            response["Content-Type"] = "application/json; charset=utf-8"
            return response

        response["statusCode"] = 404
        response["statusReason"] = "Not Found"
        response["data"] = json.dumps(
            {"type": "error", "message": "not found"}, ensure_ascii=False)
        response["Content-Type"] = "application/json; charset=utf-8"
    except Exception as exc:
        _log("onHTTPRequest: %s" % exc)
        response["statusCode"] = 500
        response["statusReason"] = "Internal Server Error"
        response["data"] = json.dumps(
            {"type": "error", "message": str(exc)}, ensure_ascii=False)
        response["Content-Type"] = "application/json; charset=utf-8"
    return response


# ---------------------------------------------------------------------------
# WebSocket lifecycle
# ---------------------------------------------------------------------------

def onWebSocketOpen(dat, client: str, uri: str) -> None:
    """Новое соединение: привязать runtime к DAT и залогировать."""
    rt = _runtime()
    if rt is not None:
        try:
            rt.attach(dat)
        except Exception:
            pass
    print("[TouchGUI] WebSocket open: %s (%s)" % (client, uri))


def onWebSocketClose(dat, client: str) -> None:
    """Соединение закрыто."""
    print("[TouchGUI] WebSocket close: %s" % client)


def onWebSocketReceiveBinary(dat, client: str, data: bytes) -> None:
    """Бинарные сообщения не поддерживаются протоколом."""
    _log("получены бинарные данные от %s — игнорируются" % client)


def onWebSocketReceivePing(dat, client: str, data: bytes) -> None:
    """Ping обрабатывается на уровне WebSocket-стека Web Server DAT."""
    pass


def onServerStart(dat) -> None:
    """Сервер запущен: запомнить DAT для рассылок."""
    rt = _runtime()
    if rt is not None:
        try:
            rt.attach(dat)
        except Exception as exc:
            _log("attach: %s" % exc)
    print("[TouchGUI] Web Server DAT запущен")


def onServerStop(dat) -> None:
    """Сервер остановлен: отвязать DAT."""
    rt = _runtime()
    if rt is not None:
        try:
            rt.detach(dat)
        except Exception:
            pass
    print("[TouchGUI] Web Server DAT остановлен")


# ---------------------------------------------------------------------------
# Диспетчер сообщений
# ---------------------------------------------------------------------------

def _ack(kind: str, ok: bool, error: str = "") -> dict:
    msg: Dict[str, Any] = {"type": "ack", "for": kind, "ok": bool(ok)}
    if not ok and error:
        msg["error"] = str(error)
    return msg


def _dispatch(rt, dat: Any, client: str, msg: dict) -> List[dict]:
    """Разобрать сообщение клиента и вернуть список ответов."""
    mtype = str(msg.get("type", ""))

    if mtype in ("hello", "get"):
        return [rt.welcome()]

    if mtype == "set":
        cid = str(msg.get("id", ""))
        if not cid:
            return [_ack("set", False, "не задан id")]
        ok, err = rt.set_value(cid, msg.get("value"))
        return [_ack("set", ok, err)]

    if mtype == "preset.save":
        ok, res = rt.save_preset(str(msg.get("name", "preset")), msg.get("values"))
        reply = _ack("preset.save", ok, res if not ok else "")
        if ok:
            reply["id"] = res
            return [reply, {"type": "presets", "presets": rt.list_presets()}]
        return [reply]

    if mtype == "preset.load":
        ok, err = rt.load_preset(str(msg.get("id", "")))
        return [_ack("preset.load", ok, err)]

    if mtype == "preset.delete":
        ok, err = rt.delete_preset(str(msg.get("id", "")))
        if ok:
            return [_ack("preset.delete", True),
                    {"type": "presets", "presets": rt.list_presets()}]
        return [_ack("preset.delete", False, err)]

    if mtype == "preset.rename":
        ok, err = rt.rename_preset(str(msg.get("id", "")), str(msg.get("name", "")))
        if ok:
            return [_ack("preset.rename", True),
                    {"type": "presets", "presets": rt.list_presets()}]
        return [_ack("preset.rename", False, err)]

    if mtype == "config.quick":
        ok, err = rt.set_group_quick(str(msg.get("groupId", "")), msg.get("quick"))
        return [_ack("config.quick", ok, err)]

    if mtype == "config.order":
        ok, err = rt.set_group_order(str(msg.get("groupId", "")), msg.get("order"))
        return [_ack("config.order", ok, err)]

    if mtype == "ping":
        return [{"type": "pong", "ts": msg.get("ts")}]

    return [{"type": "error", "message": 'неизвестный тип сообщения "%s"' % mtype}]


def onWebSocketReceiveText(dat, client: str, data: str) -> None:
    """Приём текстового JSON-сообщения, диспетчер, ответы клиенту."""
    rt = _runtime()
    if rt is None:
        _send(dat, client, {"type": "error",
                            "message": "модуль touchgui_runtime не найден"})
        return
    try:
        rt.attach(dat)
    except Exception:
        pass

    try:
        msg = json.loads(data)
        if not isinstance(msg, dict):
            raise ValueError("сообщение должно быть JSON-объектом")
    except Exception as exc:
        _send(dat, client, {"type": "error", "message": "невалидный JSON: %s" % exc})
        return

    try:
        replies = _dispatch(rt, dat, client, msg)
        for r in replies or []:
            _send(dat, client, r)
    except Exception as exc:
        _log("dispatch: %s" % exc)
        _send(dat, client, {"type": "error", "message": str(exc)})
