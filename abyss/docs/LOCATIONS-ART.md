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

## Если генератор не умеет такие широкие картинки

Сгенерируйте **бесшовный фрагмент 1024×960 px** той же стены (добавьте в промпт
`horizontally seamless tileable segment`) и 2–3 его варианта: обычный, со снятой панелью,
с повреждениями. Я соберу из них длинную стену и расставлю детали (лампы, решётки, пятна)
по разметке выше.

## Другие помещения

Для `ROOM-002`…`ROOM-010` из GDD описания пока не даю: в документе есть только их названия,
а внешний вид и расположение ещё не утверждены. Как только решите, где они и как связаны, —
подготовлю такие же листы.
