# TouchGUI — TD-мост (веб-управление крутилками)

Python-мост для проекта **TouchGUI**: веб-приложение подключается к
**Web Server DAT** в TouchDesigner по WebSocket и управляет параметрами
(knob, toggle, button, select, text, xy, color), читает метрики и работает
с пресетами.

Файлы модуля:

| Файл | Назначение |
|---|---|
| `touchgui_runtime.py` | Основной модуль (схема, контроллы, метрики, пресеты, tick, broadcast) |
| `touchgui_callbacks.py` | Callbacks для Web Server DAT (HTTP + WebSocket) |
| `touchgui_frame.py` | Callbacks для Execute DAT (тик раз в кадр) |
| `config_example.json` | Пример конфига схемы для Text DAT `touchgui_config` |

---

## 1. Подключение в TouchDesigner (пошагово)

> **Важно:** все DAT ниже должны лежать **рядом** (друг с другом) внутри
> одного Base COMP, желательно с именем `touchgui`
> (например `/project1/touchgui`). Иначе относительные пути
> `mod('touchgui_runtime')` / `op('touchgui_config')` не найдут файлы.

1. **Создать Base COMP** `touchgui` (например, внутри `/project1`).
   Все следующие операторы создаются **внутри него**.

2. **Web Server DAT** (Create DAT → Web Server DAT), переименовать,
   например, в `webserver1`. Задать **Port** = `9876`
   (или тот, что указан в конфиге).

3. **Text DAT `touchgui_callbacks`** — вставить содержимое
   `touchgui_callbacks.py`. В параметрах Web Server DAT на странице
   основных пар указать в **Callbacks** (Callbacks DAT) этот DAT.

4. **Text DAT `touchgui_runtime`** — вставить содержимое
   `touchgui_runtime.py`.
   - Основной способ подключения: **модуль** — код в callbacks/frame уже
     ищет его через `mod('touchgui_runtime')`, отдельных действий не нужно.
   - Альтернатива: подключить как **Extension** на COMP `touchgui`
     (страница Extension: Module = `touchgui_runtime`) — тогда callbacks
     найдут его тем же `mod()` по пути DAT.

5. **Execute DAT** — переименовать в `touchgui_frame`, вставить содержимое
   `touchgui_frame.py`. В параметрах:
   - **Execute** = `On Frame Start`
   - **Active** = включено

6. **Text DAT `touchgui_config`** — вставить содержимое
   `config_example.json` и **поправить пути** `par`/`chop` под свой проект
   (см. раздел «Формат конфига»).

7. **Table DAT `touchgui_presets`** — создать пустую таблицу и задать
   колонки (первая строка — заголовки):

   | id | name | values | created |
   |---|---|---|---|

   Пресеты создаются через протокол (`preset.save`), вручную заполнять
   не нужно.

8. **Включить Active** у Web Server DAT (и убедиться, что Port совпадает
   с конфигом).

9. **Проверка** — открыть в браузере:

   ```
   http://<IP-компьютера>:9876/touchgui/discover
   ```

   Ожидаемый ответ (JSON):

   ```json
   {"app":"touchgui","proto":1,"project":"<имя проекта>"}
   ```

   Если не открывается — проверьте брандмауэр Windows (раздел ниже).

---

## 2. Формат конфига (Text DAT `touchgui_config`)

Пример: `config_example.json`.

```json
{
  "port": 9876,
  "groups": [
    {
      "id": "lighting",
      "label": { "ru": "Свет", "en": "Lighting" },
      "icon": "lightbulb",
      "quick": ["lighting/dim"],
      "controls": [
        { "id": "dim", "par": "/project1/light1.Dim", "type": "knob",
          "label": { "ru": "Затемнение", "en": "Dim" },
          "min": 0, "max": 1, "unit": "%", "precision": 1,
          "metric": "lighting/level" },
        { "id": "mode", "par": "/project1/light1.Mode", "type": "select",
          "label": { "ru": "Режим", "en": "Mode" } },
        { "id": "strobe", "par": "/project1/light1.Strobe", "type": "button",
          "label": { "ru": "Стробоскоп", "en": "Strobe" } }
      ],
      "metrics": [
        { "id": "level", "chop": "/project1/meters", "channel": "light_level",
          "label": { "ru": "Уровень", "en": "Level" },
          "unit": "лк", "precision": 2, "min": 0, "max": 1 }
      ],
      "groups": [ ... вложенные подгруппы тем же форматом ... ]
    }
  ]
}
```

Правила:

- **Полные id.** В собранной схеме `control.id` и `metric.id` склеиваются
  из пути групп: `<groupId>/<subgroupId>/.../<id>` — например `lighting/dim`.
  Такие же полные id используются в поле `metric` у контролла, в `quick`,
  в сообщениях `set`/`values`/`metrics`.
- **label** — строка или `{"ru":..., "en":...}`; строка оборачивается в
  `{"ru": s, "en": s}` автоматически.
- **Поле `par`** — строка `"путь/к/оператору.ИмяПараметра"`
  (последняя точка делится на путь оператора и имя пары).
- **Типы `type`**:
  - `knob` / `slider` — числовые пары (`isNumber`); чтение `eval()`,
    запись `val=` с клампом по `min`/`max` (если включены clampMin/clampMax)
    и округлением до int для `isInt`.
  - `toggle` — bool (`isToggle`).
  - `button` — pulse (`isPulse`): при `set` вызывается `p.pulse()`;
    значение не читается и не входит в `values`.
  - `select` — меню (`isMenu`): значение = строка из `menuNames`.
  - `text` — строка (`isString`).
  - `xy` — мультикомпонентный пар (style XY/XYZ): значение — `number[]`,
    читается/пишется через `parGroup`.
  - `color` — RGBA: значение — строка `"#RRGGBB"` / `"#RRGGBBAA"`
    (или массив 3–4 float), конвертируется в float 0..1.
- **Метрики `metrics`** — два варианта источника:
  - из CHOP: `{"chop": "/path", "channel": "name"}` → `float(chop[name])`;
  - из пары: `{"par": "/path.par"}` → `float(par.eval())`.
  NaN/inf/None не отправляются.
- Конфиг можно править **на лету**: при изменении текста DAT
  схема пересобирается и всем клиентам рассылается сообщение `schema`.

---

## 3. Протокол (JSON поверх WebSocket, каждое сообщение — один JSON-объект)

### Клиент → TD

| Сообщение | Ответ TD |
|---|---|
| `{"type":"hello","client":"...","proto":1}` | `welcome` |
| `{"type":"get"}` | `welcome` (заново) |
| `{"type":"set","id":"<control id>","value":<number\|string\|bool\|number[]>}` | `ack` |
| `{"type":"preset.save","name":"...","values":{...}}` | `ack` (+ `presets`) |
| `{"type":"preset.load","id":"..."}` | `ack` (+ `values`) |
| `{"type":"preset.delete","id":"..."}` | `ack` (+ `presets`) |
| `{"type":"preset.rename","id":"...","name":"..."}` | `ack` (+ `presets`) |
| `{"type":"config.quick","groupId":"...","quick":["id1","id2"]}` | `ack` (+ `schema`) |
| `{"type":"config.order","groupId":"...","order":["id1",...]}` | `ack` (+ `schema`) |
| `{"type":"ping","ts":<ms>}` | `{"type":"pong","ts":<ms>}` |

### TD → клиент

| Сообщение | Когда |
|---|---|
| `{"type":"welcome","schema":<Schema>,"values":{...},"presets":[...],"seq":<int>}` | на `hello`/`get` |
| `{"type":"schema","schema":<Schema>}` | после `config.quick`/`config.order` или изменения конфига в TD |
| `{"type":"values","values":{id:value,...},"seq":<int>}` | изменившиеся входные значения контроллов |
| `{"type":"metrics","values":{id:float,...},"seq":<int>}` | метрики (выходные значения), до 60 раз/сек |
| `{"type":"presets","presets":[...]}` | после save/delete/rename пресета |
| `{"type":"ack","for":"<type>","ok":true\|false,"error":"..."}` | подтверждение |
| `{"type":"pong","ts":...}` | ответ на ping |
| `{"type":"error","message":"..."}` | ошибка (невалидный JSON, неизвестный тип) |

`seq` — монотонный счётчик сообщений `values`/`metrics`.

---

## 4. Проверка WebSocket

Через браузерную консоль:

```js
const ws = new WebSocket("ws://<IP>:9876/");
ws.onmessage = e => console.log(JSON.parse(e.data));
ws.onopen = () => ws.send(JSON.stringify({type: "hello", client: "test", proto: 1}));
// затем, например:
ws.send(JSON.stringify({type: "set", id: "lighting/dim", value: 0.5}));
```

---

## 5. Замечания

- **Брандмауэр Windows:** входящие соединения на порт `9876` нужно
  разрешить, иначе страница discover и WebSocket будут недоступны с других
  машин. В PowerShell от имени администратора:

  ```powershell
  New-NetFirewallRule -DisplayName "TouchGUI 9876" -Direction Inbound -Protocol TCP -LocalPort 9876 -Action Allow
  ```

  Или временно отключить брандмауэр для теста.
- **Логи:** ошибки печатаются в textport не чаще 1 раза в 5 секунд
  (защита от спама). Ищите префикс `[TouchGUI]`.
- **Безопасность:** Web Server DAT открыт без аутентификации — используйте
  его только в локальной сети.
- Кривой конфиг не роняет TD: все обращения к `op()` обёрнуты в
  try/except, некорректные контроллы просто пропускаются.
