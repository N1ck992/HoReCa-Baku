# PROJECT ABYSS — описание локаций для генерации графики

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

> **Получено:** концепт-арт (сейчас стоит в игре фоном целиком) и пустой фон
> (`assets/rooms/ROOM003-empty.jpg`). Чтобы перейти на пустой фон, нужны отдельные картинки
> оборудования из таблицы ниже — тогда генератор, щит и узел смогут двигаться по-настоящему.

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

## Новые помещения акта I

Все листы — в том же формате, что выше: **2 px на единицу игры, высота 960 px, пол на 844 px сверху**.
Мебель и предметы (койки, ящики, пульты, баки, стойки) пока рисует игра заглушками — в **пустой фон их не включать**.
Если захотите заменить их картинками — рисовать отдельно, на прозрачном фоне, как оборудование энергоотсека.

## ROOM-002 — Жилой сектор

**Файл в игре:** `ASSET-ROOM002-01` (фон). **Что происходит:** После включения питания Марк входит сюда из энергоотсека. Из темноты между койками выходит спутница (`EVENT-003`) — первая живая душа на корабле.

**Настроение:** Брошенный быт. Здесь жили люди: смятые одеяла, личные вещи, фотографии на шкафчиках, следы поспешного бегства. Уютное место, ставшее мёртвым.

### Разметка (слева направо)

Ширина в игре 1900 единиц → картинка **3800×960 px**, пол на **844 px сверху**.

| Позиция, px | Что там | В фоне или отдельно |
|---|---|---|
| 140 | гермодверь из энергоотсека | отдельно: ASSET-SHARED-01 |
| 520 | лампа под потолком | корпус в фоне, свет — игра |
| 840 | двухъярусная койка | пока рисует игра |
| 1120 | шкафчик | пока рисует игра |
| 1520 | лампа | корпус в фоне |
| 1640 | двухъярусная койка | пока рисует игра |
| 1920 | шкафчик | пока рисует игра |
| 2440 | двухъярусная койка | пока рисует игра |
| 3120 | двухъярусная койка | пока рисует игра |
| 3660 | гермодверь на склад | отдельно: ASSET-SHARED-01 |

### Что на стенах (для фона)

- стены из светлых когда-то пластиковых панелей поверх металла, местами отколоты — под ними трубы;
- узкие ниши с полками, на них кружки, книги, мелкие вещи; приклеенные фотографии и рисунки (без читаемого текста);
- номера кают — просто цифровые таблички без надписей;
- вентиляционные решётки, потёки воды и конденсата, пятна плесени у пола;
- пол — линолеум поверх решётки, местами вздут; разбросанные одеяла и обувь у стены.

### Промпт: концепт-арт

```
Side-view cross-section of the crew living quarters of a derelict deep-sea research ship. A long low dormitory with worn pale plastic wall panels over metal, some panels broken off showing pipes behind them. Rows of steel bunk beds with crumpled blankets, narrow personal lockers with photos and drawings taped on them, shelves with mugs and books, scattered shoes and bedding on the floor, signs of a hasty escape. Water stains, condensation streaks and mold near the floor. Heavy sliding bulkhead doors at both ends. Dim flickering ceiling lamps, deep shadows between the bunks, abandoned and quiet.
2D side-scrolling game concept art, strict side view, orthographic, no perspective, dark industrial sci-fi horror, Pandorum movie inspired, desaturated muted palette, no people, no creatures, no text, cinematic, high detail
```

### Промпт: игровой фон (пустой)

```
Empty side-view background of the crew living quarters of a derelict ship, 3800x960, worn pale plastic wall panels over metal, some panels missing with pipes behind, wall niches with small shelves, taped photos and drawings without readable text, ventilation grilles, water stains and mold near the floor, two empty ceiling lamp housings, floor strip at the bottom: old linoleum over metal grating, floor line at 844 px from the top,
flat back wall only, strict side view, orthographic, no perspective, no furniture in front of the wall, no doors, no people, no creatures, no text, neutral dim lighting without strong colored light, desaturated muted palette, dark industrial sci-fi horror, high detail
```

## ROOM-005 — Склад

**Файл в игре:** `ASSET-ROOM005-01` (фон). **Что происходит:** Здесь Марк и спутница впервые видят преследователя — фигуру в капюшоне в глубине склада (`EVENT-004`), потом он нападает (`EVENT-005`).

**Настроение:** Тесно и темно: штабеля ящиков создают тени, в которых может стоять кто угодно. Лучшее место для засады.

### Разметка (слева направо)

Ширина в игре 2100 единиц → картинка **4200×960 px**, пол на **844 px сверху**.

| Позиция, px | Что там | В фоне или отдельно |
|---|---|---|
| 140 | гермодверь из жилого сектора | отдельно: ASSET-SHARED-01 |
| 520 | лампа | корпус в фоне |
| 760 | штабель ящиков | пока рисует игра |
| 1280 | металлический шкаф | пока рисует игра |
| 1800 | штабель ящиков | пока рисует игра |
| 2000 | лампа | корпус в фоне |
| 2520 | штабель ящиков | пока рисует игра |
| 2960 | металлический шкаф | пока рисует игра |
| 3400 | лампа | корпус в фоне |
| 3440 | штабель ящиков | пока рисует игра |
| 4060 | гермодверь в командный центр | отдельно: ASSET-SHARED-01 |

### Что на стенах (для фона)

- высокие стеллажи вдоль задней стены с коробками и контейнерами, уходят в темноту под потолок;
- грузовые крюки, цепи и рельс кран-балки под потолком;
- жёлто-чёрная разметка погрузочных зон на полу, номера ячеек — простые цифры;
- сетчатые перегородки, за которыми видны ещё ряды полок;
- брезент, порванная плёнка, рассыпанные мелкие детали на полу.

### Промпт: концепт-арт

```
Side-view cross-section of a cargo storage hold of a derelict deep-sea research ship. Tall metal shelving racks along the back wall filled with crates and containers fading into darkness under the ceiling, wire mesh partitions with more shelves behind them, an overhead crane rail with hanging hooks and chains. Stacks of heavy cargo crates and tall metal cabinets on the floor creating deep pockets of shadow, torn tarps and plastic wrap, scattered small parts. Yellow-black loading zone markings on the floor. Heavy sliding bulkhead doors at both ends. Sparse dim lamps, very dark, feeling that something is watching from the shadows.
2D side-scrolling game concept art, strict side view, orthographic, no perspective, dark industrial sci-fi horror, Pandorum movie inspired, desaturated muted palette, no people, no creatures, no text, cinematic, high detail
```

### Промпт: игровой фон (пустой)

```
Empty side-view background of a cargo storage hold of a derelict ship, 4200x960, tall metal shelving racks against the back wall with boxes fading into darkness, wire mesh partitions, overhead crane rail with hanging hooks and chains near the ceiling, three empty lamp housings, metal floor strip at the bottom with yellow-black loading zone markings, floor line at 844 px from the top,
flat back wall only, strict side view, orthographic, no perspective, no furniture in front of the wall, no doors, no people, no creatures, no text, neutral dim lighting without strong colored light, desaturated muted palette, dark industrial sci-fi horror, high detail
```

## ROOM-008 — Командный центр (мостик)

**Файл в игре:** `ASSET-ROOM008-01` (фон). **Что происходит:** Безопасная зона. Здесь судовой врач (`EVENT-006`) и огромный иллюминатор: заслонки поднимаются, и Марк видит дно океана и проплывающего левиафана (`EVENT-007`). Момент, когда он понимает, что он на корабле на глубине 3000 м.

**Настроение:** Самое «чистое» помещение корабля: строгий мостик, пульты полукругом, огромное обзорное окно. Холодный свет экранов. Место надежды — и самого страшного открытия.

### Разметка (слева направо)

Ширина в игре 1500 единиц → картинка **3000×960 px**, пол на **844 px сверху**.

| Позиция, px | Что там | В фоне или отдельно |
|---|---|---|
| 140 | гермодверь со склада | отдельно: ASSET-SHARED-01 |
| 600 | лампа | корпус в фоне |
| 760–2280 | **иллюминатор** во всю стену: ~1520 px шириной, ~560 px высотой, низ рамы ~250 px над полом | проём в фоне, стекло — **чисто чёрное** (вид снаружи и заслонки рисует игра) |
| 940 | пульт | пока рисует игра |
| 1520 | центральный пульт (капитанский) | пока рисует игра |
| 1600 | лампа | корпус в фоне |
| 2100 | пульт | пока рисует игра |
| 2500 | лампа | корпус в фоне |
| 2860 | гермодверь в лабораторию | отдельно: ASSET-SHARED-01 |

### Что на стенах (для фона)

- массивная рама иллюминатора с заклёпками и толстыми болтами, по бокам — направляющие для бронезаслонок;
- над окном — ряд потухших мониторов и навигационные панели (без надписей);
- ровные тёмные панели стен, кабельные каналы аккуратно закрыты — это лучшее помещение корабля;
- на полу — ступень-подиум под пультами, решётки вентиляции;
- следы баррикады у входа: сдвинутые кресла, ящики (врач здесь заперся).

### Промпт: концепт-арт

```
Side-view cross-section of the command bridge of a derelict deep-sea research ship resting on the ocean floor. A huge panoramic observation window spans the whole back wall: thick riveted frame, heavy bolts, armored shutter rails on both sides, behind the glass the pitch-black deep ocean with faint searchlight beams and floating marine snow. Below the window a semicircle of control consoles with glowing screens, the captain's console in the center on a low raised platform. A row of dead monitors and navigation panels above the window. Clean dark wall panels, the most intact room of the ship. Remains of a barricade near the entrance: pushed chairs and crates. Heavy sliding bulkhead doors at both ends. Cold blue light from the screens, awe and dread.
2D side-scrolling game concept art, strict side view, orthographic, no perspective, dark industrial sci-fi horror, Pandorum movie inspired, desaturated muted palette, no people, no creatures, no text, cinematic, high detail
```

### Промпт: игровой фон (пустой)

```
Empty side-view background of the command bridge of a derelict ship, 3000x960, clean dark wall panels, a huge panoramic window opening in the back wall 1520 px wide and 560 px tall with its bottom edge 250 px above the floor line, thick riveted frame with heavy bolts and armored shutter rails on the sides, the glass area filled with pure flat black #000000 (to be cut out), a row of dead monitors above the window, three empty lamp housings, metal floor strip with a low raised platform in the middle, floor line at 844 px from the top,
flat back wall only, strict side view, orthographic, no perspective, no furniture in front of the wall, no doors, no people, no creatures, no text, neutral dim lighting without strong colored light, desaturated muted palette, dark industrial sci-fi horror, high detail
```

## ROOM-007 — Лаборатория

**Файл в игре:** `ASSET-ROOM007-01` (фон). **Что происходит:** Два мутанта и гарпуны на полу. В середине комнаты гаснет свет, и за стеклянной перегородкой на миг стоит фигура в капюшоне (`EVENT-008`).

**Настроение:** Здесь всё началось. Научная лаборатория: колбы с мутными образцами, разбитые резервуары, следы того, что эксперимент вышел из-под контроля. Холодно, стерильно и грязно одновременно.

### Разметка (слева направо)

Ширина в игре 2000 единиц → картинка **4000×960 px**, пол на **844 px сверху**.

| Позиция, px | Что там | В фоне или отдельно |
|---|---|---|
| 140 | гермодверь с мостика | отдельно: ASSET-SHARED-01 |
| 600 | лампа | корпус в фоне |
| 840 | резервуар-колба с образцом | пока рисует игра |
| 1280 | лабораторный стол | пока рисует игра |
| 1720 | резервуар-колба | пока рисует игра |
| 1720 | лампа | корпус в фоне |
| 2000 | лампа | корпус в фоне |
| 2300–2700 | стеклянная перегородка (за ней появляется фигура) | пока рисует игра — в фоне **не рисовать** |
| 3200 | разбитый резервуар | пока рисует игра |
| 3400 | лампа | корпус в фоне |
| 3560 | лабораторный стол, рядом гарпуны | пока рисует игра |
| 3860 | гермодверь в оружейную | отдельно: ASSET-SHARED-01 |

### Что на стенах (для фона)

- белые когда-то кафельные стены, заляпанные тёмной органикой и потёками;
- стенды с пробирками, вытяжные шкафы, схемы анатомии и ДНК (без читаемого текста);
- трубки и шланги, идущие от резервуаров в стену;
- разбитые стёкла и лужи зеленоватой жидкости на полу;
- странные наросты в углах — органика, проросшая через вентиляцию.

### Промпт: концепт-арт

```
Side-view cross-section of a biology research laboratory of a derelict deep-sea research ship where an experiment went wrong. Once-white tiled walls smeared with dark organic stains and streaks, tall cylindrical specimen tanks with murky liquid, one tank shattered, lab tables with instruments and scattered sample tubes, fume hoods, anatomy and DNA diagrams on the walls without readable text, tubes and hoses running from the tanks into the walls, a tall glass partition in the middle of the room. Pools of greenish liquid and broken glass on the floor, organic growths creeping out of the vents in the corners. Heavy sliding bulkhead doors at both ends. Cold sickly greenish light from the tanks, sterile and filthy at the same time.
2D side-scrolling game concept art, strict side view, orthographic, no perspective, dark industrial sci-fi horror, Pandorum movie inspired, desaturated muted palette, no people, no creatures, no text, cinematic, high detail
```

### Промпт: игровой фон (пустой)

```
Empty side-view background of a biology research laboratory of a derelict ship, 4000x960, once-white tiled walls with dark organic stains and streaks, empty wall shelves with sample racks, diagrams on the walls without readable text, hoses and tubes running into the wall, organic growths near the vents in the upper corners, four empty lamp housings, tiled floor strip with puddles of greenish liquid, floor line at 844 px from the top,
flat back wall only, strict side view, orthographic, no perspective, no furniture in front of the wall, no doors, no people, no creatures, no text, neutral dim lighting without strong colored light, desaturated muted palette, dark industrial sci-fi horror, high detail
```

## ROOM-006 — Оружейная

**Файл в игре:** `ASSET-ROOM006-01` (фон). **Что происходит:** Марк находит гарпунное ружьё в шкафу (`ITEM-011`) и гарпуны. Первое оружие дальнего боя.

**Настроение:** Маленькая укреплённая комната. Пустые стойки: всё, что было, давно разобрали. Остался один запертый шкаф.

### Разметка (слева направо)

Ширина в игре 1200 единиц → картинка **2400×960 px**, пол на **844 px сверху**.

| Позиция, px | Что там | В фоне или отдельно |
|---|---|---|
| 140 | гермодверь из лаборатории | отдельно: ASSET-SHARED-01 |
| 760 | оружейная стойка (пустая) | пока рисует игра |
| 1200 | лампа | корпус в фоне |
| 1280 | **шкаф с оружием** | **получено**: ASSET-ROOM006-02 (закрыт), ASSET-ROOM006-03 (открыт) |
| 1760 | оружейная стойка (пустая) | пока рисует игра |
| 2260 | гермодверь в систему жизнеобеспечения | отдельно: ASSET-SHARED-01 |

### Что на стенах (для фона)

- толстые бронированные стены с усиленными рёбрами, решётки на вентиляции;
- пустые крепления для оружия на стенах, контуры снятых винтовок пылью на панелях;
- водолазное и спасательное снаряжение: баллоны, ласты, гарпуны на стене без ружей;
- жёлто-чёрная разметка «стоп» у шкафа;
- перевёрнутые пустые ящики из-под патронов на полу.

### Промпт: концепт-арт

```
Side-view cross-section of a small armory room of a derelict deep-sea research ship. Thick armored walls with reinforced ribs, empty weapon racks and wall mounts with dusty outlines where rifles used to hang, diving and rescue gear: air tanks, fins, spare harpoon bolts on the wall. A single heavy locked weapon locker against the back wall in the center, yellow-black hazard marking on the floor in front of it, overturned empty ammo boxes on the floor. Heavy sliding bulkhead doors at both ends. One dim red lamp, cramped and looted.
2D side-scrolling game concept art, strict side view, orthographic, no perspective, dark industrial sci-fi horror, Pandorum movie inspired, desaturated muted palette, no people, no creatures, no text, cinematic, high detail
```

### Промпт: игровой фон (пустой)

```
Empty side-view background of a small armory room of a derelict ship, 2400x960, thick armored wall panels with reinforced ribs, empty weapon wall mounts with dusty outlines of removed rifles, diving air tanks and fins hanging on hooks, ventilation grilles with bars, one empty lamp housing in the center, metal floor strip with a yellow-black hazard marking in the center, floor line at 844 px from the top,
flat back wall only, strict side view, orthographic, no perspective, no furniture in front of the wall, no doors, no people, no creatures, no text, neutral dim lighting without strong colored light, desaturated muted palette, dark industrial sci-fi horror, high detail
```

## ROOM-009 — Система жизнеобеспечения

**Файл в игре:** `ASSET-ROOM009-01` (фон). **Что происходит:** Логово Колосса (`ENEMY-003`). Пол дрожит, лампы мигают, из огромного резервуара поднимается босс (`EVENT-009`). Пока он жив, проход в шлюз закрыт.

**Настроение:** Огромный машинный зал с гигантскими баками воды и кислорода. Влажно, капает, ржавчина. Тяжело дышать — система, которая должна давать воздух, стала гнездом.

### Разметка (слева направо)

Ширина в игре 2000 единиц → картинка **4000×960 px**, пол на **844 px сверху**.

| Позиция, px | Что там | В фоне или отдельно |
|---|---|---|
| 140 | гермодверь из оружейной | отдельно: ASSET-SHARED-01 |
| 700 | лампа | корпус в фоне |
| 840 | гарпуны на полу | предмет, рисует игра |
| 1280 | большой бак (кислород) | пока рисует игра |
| 2000 | лампа | корпус в фоне |
| 2500 | большой бак — **резервуар, где спит Колосс**: разбитый, вскрытый изнутри | пока рисует игра |
| 3300 | лампа | корпус в фоне |
| 3400 | большой бак (вода) | пока рисует игра |
| 3860 | гермодверь в шлюз | отдельно: ASSET-SHARED-01 |

### Что на стенах (для фона)

- высокий зал с трубами в два обхвата, вентили-колёса, манометры (стрелки без цифр);
- фильтры-кассеты в стене, часть вырвана;
- ржавчина, конденсат, капающая вода, пар из решёток;
- **органическая слизь и наросты** вокруг центрального резервуара — тянутся по стенам к потолку;
- на полу — лужи, следы волочения, обломки.

### Промпт: концепт-арт

```
Side-view cross-section of a huge life support hall of a derelict deep-sea research ship. Giant cylindrical oxygen and water tanks standing on the floor, the central tank cracked and torn open from the inside, thick pipes, valve wheels and pressure gauges without numbers on the walls, filter cassettes in the wall with some ripped out. Rust, dripping condensation, steam rising from floor grates. Slimy organic growths spreading from the central tank across the walls up to the ceiling like a nest. Puddles, drag marks and debris on the floor. Heavy sliding bulkhead doors at both ends. Dim flickering lamps, humid suffocating atmosphere, lair of something huge.
2D side-scrolling game concept art, strict side view, orthographic, no perspective, dark industrial sci-fi horror, Pandorum movie inspired, desaturated muted palette, no people, no creatures, no text, cinematic, high detail
```

### Промпт: игровой фон (пустой)

```
Empty side-view background of a huge life support hall of a derelict ship, 4000x960, tall back wall with thick pipes, valve wheels and pressure gauges without numbers, filter cassettes in the wall with some missing, rust and condensation streaks, slimy organic growths spreading across the wall from the center up to the ceiling, three empty lamp housings, wet metal grating floor strip with puddles and steam grates, floor line at 844 px from the top,
flat back wall only, strict side view, orthographic, no perspective, no furniture in front of the wall, no doors, no people, no creatures, no text, neutral dim lighting without strong colored light, desaturated muted palette, dark industrial sci-fi horror, high detail
```

## ROOM-010 — Шлюз

**Файл в игре:** `ASSET-ROOM010-01` (фон). **Что происходит:** Финал первого акта. Три стойки с глубоководными экзокостюмами, целый только один (`EQUIP-005`). Марк осматривает его, затемнение, «Конец первого акта». Восточный люк ведёт наружу — в океан.

**Настроение:** Порог между кораблём и бездной. Холодный, тяжёлый, промышленный. Огромный люк в океан, мокрые следы на полу, костюмы как спящие гиганты в стойках.

### Разметка (слева направо)

Ширина в игре 1500 единиц → картинка **3000×960 px**, пол на **844 px сверху**.

| Позиция, px | Что там | В фоне или отдельно |
|---|---|---|
| 140 | гермодверь из системы жизнеобеспечения | отдельно: ASSET-SHARED-01 |
| 800 | лампа | корпус в фоне |
| 960 | стойка с разбитым экзокостюмом | ASSET-ROOM010-02, затемнён |
| 1960 | стойка с **целым экзокостюмом** | отдельно: ASSET-ROOM010-02 |
| 2000 | лампа | корпус в фоне |
| 1460 | стойка с разбитым экзокостюмом | ASSET-ROOM010-02, затемнён |
| 2860 | **внешний люк** — круглый, массивный, со штурвалом | **получено**: ASSET-ROOM010-03 |

### Что на стенах (для фона)

- толстые стены, рассчитанные на давление: рёбра жёсткости, огромные заклёпки;
- шланги подачи воздуха и энергии, свисающие к стойкам костюмов;
- лампы-маячки (без цвета — цвет даёт игра), индикатор давления у люка — стрелка без цифр;
- решётка в полу для слива воды, мокрый пол, соль и водоросли у люка;
- ящики с инструментом и запасными баллонами.

### Промпт: концепт-арт

```
Side-view cross-section of the airlock and dive suit bay of a derelict deep-sea research ship. Massive pressure-rated walls with stiffening ribs and huge rivets, three heavy maintenance gantries holding deep-sea mechanized exosuits like sleeping giants, two suits wrecked, one intact. Air and power hoses hanging down to the gantries, beacon lamps, a pressure gauge without numbers next to a huge round outer hatch with a wheel on the right. Drain grating in the floor, wet floor, salt crust and seaweed near the hatch, tool crates and spare air tanks. Heavy sliding bulkhead door on the left. Cold dim light, threshold between the ship and the abyss.
2D side-scrolling game concept art, strict side view, orthographic, no perspective, dark industrial sci-fi horror, Pandorum movie inspired, desaturated muted palette, no people, no creatures, no text, cinematic, high detail
```

### Промпт: игровой фон (пустой)

```
Empty side-view background of the airlock and dive suit bay of a derelict ship, 3000x960, massive pressure-rated wall panels with stiffening ribs and huge rivets, air and power hoses hanging from the ceiling, empty mounting points on the wall, salt crust and seaweed stains on the right side of the wall, two empty lamp housings, wet metal floor strip with a drain grating, floor line at 844 px from the top,
flat back wall only, strict side view, orthographic, no perspective, no furniture in front of the wall, no doors, no people, no creatures, no text, neutral dim lighting without strong colored light, desaturated muted palette, dark industrial sci-fi horror, high detail
```

## Отдельные предметы новых помещений

| ID | Что | Промпт (на прозрачном или однотонном зелёном фоне) |
|---|---|---|
| `ASSET-ROOM006-02`, `-03` (получено) | Шкаф с оружием, **два варианта: закрытый и открытый пустой** | `Heavy armored weapon locker of a derelict sci-fi ship, strict side view, orthographic, scratched dark metal, yellow-black hazard stripes, keypad lock without text, {закрытый: doors closed / открытый: doors open, empty inside with weapon mounts}, isolated on flat green background, no text, game asset` |
| `ASSET-ROOM010-02` (получено) | Целый экзокостюм в стойке | `Massive deep-sea mechanized exosuit standing in a maintenance gantry, heavy armored powered suit like a walking diving bell with a round armored helmet and narrow glowing visor slit, thick hydraulic arms and legs, oxygen tanks and reactor pack on the back, scratched industrial yellow-grey paint, strict side view facing right, orthographic, isolated on flat green background, no text, game asset` |
| `ASSET-ROOM010-03` (получено) | Внешний люк шлюза | `Huge round pressure hatch of a submarine airlock with a central wheel, massive hinges and bolts, salt crust, strict front view, isolated on flat green background, no text, game asset` |

## Если генератор не умеет такие широкие картинки

Сгенерируйте **бесшовный фрагмент 1024×960 px** той же стены (добавьте в промпт
`horizontally seamless tileable segment`) и 2–3 его варианта: обычный, со снятой панелью,
с повреждениями. Я соберу из них длинную стену и расставлю детали (лампы, решётки, пятна)
по разметке выше.

## Ещё не построено

`ROOM-004` (инженерная мастерская) — только название из GDD. Как решите, где она и что в ней, — подготовлю лист.
