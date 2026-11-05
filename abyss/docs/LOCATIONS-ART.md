# ABYSS: LOST SIGNAL — описание локаций для генерации графики

Дополнение к [ART-BRIEF.md](ART-BRIEF.md). Здесь — что именно рисовать в каждом помещении
и где что стоит, чтобы картинка совпала с игрой.

Общие правила для всех локаций:

- **вид строго сбоку**, как срез корабля: зритель смотрит на заднюю стену, пол — полоса внизу;
- **без перспективы**: стена плоская, линии горизонтальные;
- **приглушённое нейтральное освещение**: красный аварийный свет, мигание и темноту добавляет игра;
- **без текста, без людей и существ**;
- то, что движется или с чем взаимодействуют (капсулы, шкаф, двери, монитор), рисуется **отдельно** — см. ART-BRIEF.md, раздел 4.

Из каждой локации нужно две картинки:

1. **Концепт-арт** — вся комната целиком, с мебелью и атмосферой. Нужен как ориентир стиля; в игру напрямую не идёт.
2. **Игровой фон** — та же комната, но **пустая**: только стены, потолок, пол. Идёт в игру.

---

## ROOM-001 — Медицинский отсек (стартовая комната)

**Что происходит здесь в игре:** герой просыпается в аварийной криокапсуле (EVENT-001), выходит,
находит металлолом у разбитой капсулы, обыскивает медицинский шкаф и уходит через гермодверь в коридор.

**Настроение:** тишина после катастрофы. Отсек давно брошен, основное питание отключено,
работает только аварийная система. Стерильное когда-то помещение медленно гниёт.

### Разметка (слева направо)

Ширина комнаты в игре 1500 единиц → картинка **3000×960 px** (2 px на единицу).
Пол — горизонтальная линия на высоте **844 px сверху**. Потолок — у самого верха.

| Позиция, px от левого края | Что там | В фоне или отдельно |
|---|---|---|
| 0–120 | глухая стена, угол отсека | фон |
| 460 | **криокапсула героя** (рабочая, с голубой подсветкой внутри) | отдельно: ASSET-ROOM001-02 |
| 660 | красная аварийная лампа под потолком | корпус лампы в фоне, свет — игра |
| 840 | **разбитая криокапсула**, осколки стекла на полу | отдельно |
| 1040 | вентиляционная решётка в полу (из неё идёт пар) | фон |
| 1200 | **пустая тёмная криокапсула** | отдельно |
| 1580 | **настенный монитор** центр на ~500 px выше пола | отдельно: ASSET-ROOM001-04 |
| 1920 | **медицинская кушетка** с капельницей | отдельно: ASSET-ROOM001-03 |
| 2100 | красная аварийная лампа под потолком | корпус в фоне |
| 2100 | красный крест на стене (выцветший) | фон |
| 2400 | **медицинский шкаф** | отдельно: ASSET-ROOM001-05 |
| 2620 | решётка в полу (пар) | фон |
| 2860 | **гермодверь** в коридор | отдельно: ASSET-SHARED-01 |

### Что на стенах и вокруг (для фона)

- стеновые панели грязно-белого и серо-зелёного цвета, медицинская плитка, часть панелей **снята** — видны пучки кабелей;
- потолок: тяжёлые балки, 2–3 горизонтальные трубы с муфтами и вентилями;
- пол: металлическая решётка, плинтус с жёлто-чёрной разметкой вдоль стены;
- ржавые подтёки, тёмные пятна, царапины, следы влаги и капающей воды с потолка;
- над капсулами — трафаретная надпись в духе «CRYO BAY» (в игровой фон без текста; в концепт можно).

### Промпт: концепт-арт

```
Side-view cross-section of an abandoned cryo medical bay inside a derelict deep-sea research
ship. Three upright cryo pods on the left: the first one intact with a faint cold blue glow
inside and frosted glass, the second one shattered with glass shards on the floor, the third
dark and empty. In the middle a wall-mounted medical monitor with a dark screen, a medical bed
with a stained sheet and an IV stand. On the right a tall metal medical cabinet with its door
ajar, papers on the floor, and a heavy sliding bulkhead door with yellow-black hazard stripes.
Dirty off-white and grey-green wall panels, some panels missing with exposed cables, heavy
ceiling beams and pipes, metal grating floor, rust streaks, grime, dripping water.
Dim emergency red ceiling lamps, deep shadows, oppressive silence.
2D side-scrolling game concept art, strict side view, orthographic, no perspective,
dark industrial sci-fi horror, Pandorum movie inspired, desaturated muted palette,
no people, no creatures, no text, cinematic, high detail
```

### Промпт: игровой фон (пустой)

```
Empty side-view background of an abandoned cryo medical bay on a derelict ship, 3000x960,
flat back wall only: dirty off-white and grey-green medical wall panels and tiles, several
panels missing with exposed cable bundles, a faded red cross on the wall on the right side,
heavy ceiling beams with horizontal pipes and valves, two empty red emergency lamp housings
under the ceiling, metal grating floor strip at the bottom with yellow-black hazard stripes
along the baseboard, two floor vents, rust streaks, grime, water stains.
No furniture, no cryo pods, no doors, no monitors, no people, no text.
2D game background, strict side view, orthographic, no perspective, neutral flat lighting,
no colored light, no cast shadows, dark industrial sci-fi horror, desaturated muted palette
```

---

## ROOM-011 — Коридор

**Что происходит здесь в игре:** длинный коридор за медотсеком. Здесь герой находит трубу,
сталкивается с первым мутантом (ENEMY-001) и упирается в обесточенную дверь в конце.

**Настроение:** длинный, узкий, давящий. Аварийные лампы через большие промежутки, между ними —
темнота. Одна лампа неисправна и искрит.

### Разметка

Ширина 2600 единиц → картинка **5200×960 px**. Коридор ниже медотсека:
потолок на **164 px сверху**, пол на **844 px**. Над потолком — тёмные технические конструкции
(короба, трубы), видимые сквозь решётку.

| Позиция, px | Что там | В фоне или отдельно |
|---|---|---|
| 140 | гермодверь в медотсек | отдельно |
| 600 | красная аварийная лампа | корпус в фоне |
| 1120 | металлическая труба на полу | отдельно (предмет) |
| 1280 | решётка в полу (пар) | фон |
| 1800 | **неисправная лампа**: разбитый плафон, свисающие провода, следы копоти | корпус в фоне, искры — игра |
| 2500 | лужа под протекающим потолком | фон |
| 3000 | красная аварийная лампа | корпус в фоне |
| 2500–4000 | зона, где патрулирует мутант: следы когтей на стенах, тёмные пятна | фон |
| 3560 | решётка в полу (пар) | фон |
| 4300 | красная аварийная лампа | корпус в фоне |
| 4000 | лужа | фон |
| 5060 | **обесточенная гермодверь** в конце коридора, индикатор не горит | отдельно |

### Что на стенах

- ребристые металлические панели, вертикальные рёбра жёсткости, номера секций на стенах (в игровом фоне без текста);
- местами сорванные панели, торчащие кабели;
- **следы когтей и тёмные потёки** во второй половине коридора — там живёт мутант;
- потолок низкий, трубы и кабельные лотки.

### Промпт: концепт-арт

```
Side-view cross-section of a long narrow service corridor inside a derelict deep-sea research
ship. Ribbed dark metal wall panels with vertical stiffeners, some panels torn off with hanging
cables, low ceiling with pipes and cable trays, dark technical ducts visible above the ceiling.
Sparse red emergency lamps with long dark gaps between them, one broken lamp with shattered
cover and dangling wires. A rusty metal pipe lying on the floor. Claw marks and dark stains on
the walls in the far half of the corridor, puddles under a leaking ceiling. At the far right
end a heavy sealed bulkhead door with a dead indicator light.
2D side-scrolling game concept art, strict side view, orthographic, no perspective,
dark industrial sci-fi horror, Pandorum movie inspired, desaturated muted palette,
no people, no creatures, no text, cinematic, high detail
```

### Промпт: игровой фон (пустой)

```
Empty side-view background of a long narrow service corridor on a derelict ship, 5200x960,
flat back wall only: ribbed dark metal wall panels with vertical stiffeners, a few panels torn
off with hanging cables, low ceiling at the top quarter with pipes and cable trays, dark
technical ducts above the ceiling, four empty emergency lamp housings, one of them broken with
dangling wires and soot marks, claw marks and dark stains on the wall in the right half,
metal grating floor strip at the bottom, two floor vents, two puddles.
No doors, no objects, no people, no text. Horizontally seamless segments.
2D game background, strict side view, orthographic, no perspective, neutral flat lighting,
no colored light, no cast shadows, dark industrial sci-fi horror, desaturated muted palette
```

---

## ROOM-003 — Энергетический отсек

**Что происходит здесь в игре (этап 6, `QUEST-001`):** Марк входит по ключ-карте из коридора.
Главный генератор корабля стоит мёртвым. Марк осматривает его, приносит предохранитель
к электрощиту и провода к кабельному узлу, затем чинит генератор. Аварийный красный свет
сменяется рабочим белым.

**Настроение:** сердце корабля, которое остановилось. Высокий машинный зал, массивное
оборудование, толстые кабели, копоть от старого короткого замыкания. Тишина, гул где-то в стенах,
изредка — треск искр.

### Разметка (слева направо)

Ширина отсека в игре 1800 единиц → картинка **3600×960 px**. Пол на **844 px сверху**,
потолок у самого верха (зал высокий, как медотсек).

| Позиция, px | Что там | В фоне или отдельно |
|---|---|---|
| 140 | гермодверь из коридора | отдельно: ASSET-SHARED-01 |
| 420 | красная аварийная лампа | корпус в фоне, свет — игра |
| 700 | **электрощит** на стене, центр ~420 px над полом: открытая дверца, пустое гнездо предохранителя | отдельно: ASSET-ROOM003-03 |
| 900–2300 | толстые кабельные трассы по стене и полу, уходят к генератору | фон |
| 1600 | **главный генератор** — массивный, ~760 px шириной, ~560 px высотой, стоит на полу | отдельно: ASSET-ROOM003-02 |
| 1600 | над генератором — вытяжной короб и красная лампа | фон |
| 2500 | **кабельный узел**: распределительная коробка у пола, оборванные концы кабелей | отдельно: ASSET-ROOM003-04 |
| 2700 | решётка в полу (пар) | фон |
| 3000 | **пульт управления** с тёмными экранами, центр ~300 px над полом | отдельно: ASSET-ROOM003-05 |
| 3100 | красная аварийная лампа | корпус в фоне |
| 3460 | вторая гермодверь (дальше по кораблю, пока закрыта) | отдельно: ASSET-SHARED-01 |

### Что нарисовать отдельно и как

| ID | Что | Важно |
|---|---|---|
| `ASSET-ROOM003-02` | Главный генератор | **два слоя:** корпус и отдельно **сердечник** (круглая турбина или колба в центре). Сердечник движок будет вращать и подсвечивать, когда генератор заработает. Нарисовать выключенным |
| `ASSET-ROOM003-03` | Электрощит | **дверца отдельным слоем**; внутри — пустое гнездо под предохранитель |
| `ASSET-ROOM003-04` | Кабельный узел | **два варианта:** с оборванными концами кабелей и с подключёнными |
| `ASSET-ROOM003-05` | Пульт управления | **экраны пустые и тёмные**: изображение на них рисует движок |

### Что на стенах (для фона)

- высокие стены из тёмных металлических панелей с рёбрами, местами — решётчатые секции,
  за которыми видны трубы и кабели;
- по стенам и полу — толстые кабельные трассы и лотки, сходятся к месту генератора;
- **следы копоти и оплавления** вокруг места генератора и щита — здесь когда-то было замыкание;
- предупреждающая жёлто-чёрная разметка на полу вокруг генератора;
- под потолком — вытяжные короба, мостики, балки;
- пол — металлическая решётка, местами лужи масла.

### Промпт: концепт-арт

```
Side-view cross-section of the main power room of a derelict deep-sea research ship.
A tall machine hall with dark ribbed metal walls, grated wall sections showing pipes and cables
behind them, overhead ducts, catwalk beams and ventilation housings near the ceiling.
In the middle stands a massive dead power generator with a round turbine core, thick cables
running from it along the walls and floor. On the left wall an electrical fuse panel with its
door open and an empty fuse slot. On the right a cable junction box with torn cable ends near the
floor and a control console with dark screens. Heavy sliding bulkhead doors at both ends.
Soot and scorch marks around the generator and the panel from an old short circuit,
yellow-black hazard markings on the floor around the generator, oil puddles on the grating floor.
Dim red emergency lamps, deep shadows, oppressive silence.
2D side-scrolling game concept art, strict side view, orthographic, no perspective,
dark industrial sci-fi horror, Pandorum movie inspired, desaturated muted palette,
no people, no creatures, no text, cinematic, high detail
```

### Промпт: игровой фон (пустой)

```
Empty side-view background of the main power room of a derelict ship, 3600x960,
flat back wall only: tall dark ribbed metal wall panels, a few grated wall sections with pipes
and cables visible behind them, thick cable trays running along the wall and converging to the
center, soot and scorch marks on the wall in the center and on the left, overhead ducts and
beams near the ceiling, three empty red emergency lamp housings under the ceiling,
metal grating floor strip at the bottom with yellow-black hazard markings in the center,
one floor vent, oil puddles.
No machines, no generator, no panels, no consoles, no doors, no people, no text.
2D game background, strict side view, orthographic, no perspective, neutral flat lighting,
no colored light, no cast shadows, dark industrial sci-fi horror, desaturated muted palette
```

### Промпты: отдельные предметы

Добавьте в конец каждого: `isolated on flat solid pure green background #00FF00, no floor, no shadow,
strict side view, orthographic, neutral flat lighting, realistic dark industrial sci-fi, muted palette, no text`.

**Генератор, корпус (`ASSET-ROOM003-02`):**
```
Massive industrial power generator of a derelict ship, side view, switched off, heavy steel
housing with access hatches, pipes and thick cables coming out of the back, warning stickers
without text, soot around the vents. In the center an empty round opening where the turbine
core sits.
```

**Генератор, сердечник (`ASSET-ROOM003-02`, второй слой):**
```
Round industrial turbine core with radial metal blades and a central hub, separate object,
switched off, dark metal, side view facing the viewer.
```

**Электрощит (`ASSET-ROOM003-03`):**
```
Wall-mounted electrical fuse panel of a derelict ship, metal box with breakers and cables,
the door removed and shown separately next to it, one empty fuse slot in the center,
scorch marks.
```

**Кабельный узел (`ASSET-ROOM003-04`), два варианта:**
```
Floor-standing cable junction box of a derelict ship, thick industrial cables entering it,
two cables torn with exposed copper ends hanging loose.
```
```
Same cable junction box, same framing, the cables are reconnected with clamps and tape.
```

**Пульт управления (`ASSET-ROOM003-05`):**
```
Industrial control console of a derelict ship, standing on the floor, two dark empty screens,
switches and dials, worn metal, side view.
```

## Если генератор не умеет такие широкие картинки

Сгенерируйте **бесшовный фрагмент 1024×960 px** той же стены (добавьте в промпт
`horizontally seamless tileable segment`) и 2–3 его варианта: обычный, со снятой панелью,
с повреждениями. Я соберу из них длинную стену и расставлю детали (лампы, решётки, пятна)
по разметке выше.

## Другие помещения

Для `ROOM-002`, `ROOM-004`…`ROOM-010` из GDD описания пока не даю: в документе есть только их названия,
а внешний вид и расположение ещё не утверждены. Как только решите, где они и как связаны, —
подготовлю такие же листы.
