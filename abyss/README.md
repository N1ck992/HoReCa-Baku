# ABYSS: LOST SIGNAL

Сюжетный sci-fi survival horror с видом сбоку. Браузерная игра на чистом JavaScript (canvas), без сборки и зависимостей.

- Основной документ: [docs/GDD-v0.1.md](docs/GDD-v0.1.md)
- Реестр ID и открытые вопросы: [docs/ID-REGISTRY.md](docs/ID-REGISTRY.md)
- Задание на графику для художника или нейросети: [docs/ART-BRIEF.md](docs/ART-BRIEF.md)
- Описание локаций для генерации фонов: [docs/LOCATIONS-ART.md](docs/LOCATIONS-ART.md)
- **Стандарт графики персонажей** и инструмент нарезки: [docs/CHARACTER-ART-SPEC.md](docs/CHARACTER-ART-SPEC.md), `tools/rig_from_fullbody.py`
- Согласованные дополнения к GDD: [docs/GDD-CHANGES.md](docs/GDD-CHANGES.md)

## Запуск

Откройте `index.html` в браузере. Сервер не нужен.

Управление: `A`/`D` или стрелки — идти, `Shift` — бег, `E` — действие, `F`/`J`/пробел/клик — удар, `I` или `Tab` — инвентарь, `M` — карта. На телефоне — экранные кнопки.

## Готово (этапы 1–6 из GDD §14)

1. **Основа и система ID.** Реестр `AB.ID` проверяет формат ID и не даёт зарегистрировать один ID дважды. Модули общаются через шину событий `AB.Bus`.
2. **Главный герой и управление.** `CHAR-001` — Марк, инженер: ходьба, бег, взаимодействие, плавный разгон и торможение, клавиатура и сенсорные кнопки.
3. **Медицинский отсек и первый коридор.** `ROOM-001` и `ROOM-011`, двери с условиями доступа, переходы между помещениями, сюжетное событие `EVENT-001` «Пробуждение», сохранение прогресса.
4. **Инвентарь и предметы.** Ресурсы из GDD §9 (`ITEM-001`…`ITEM-008`), ключ-карта `ITEM-010`. У персонажа два слота: оружие (сразу в руках) и рюкзак на одну вещь; подбор при занятом рюкзаке — обмен. Обыск контейнеров, медикаменты, выбрасывание, здоровье героя. Нажатие на персонажа показывает, что он несёт.
5. **Первый противник и бой.** `ENEMY-001` с конечным автоматом из GDD §10 (зрение, слух, реакция на свет, отступление), труба `ITEM-009` как оружие, урон и отбрасывание, гибель героя и загрузка сохранения (не сохраняется посреди боя).

6. **Задание из нескольких этапов.** `QUEST-001` «Восстановление энергоснабжения» в `ROOM-003`: QUEST SYSTEM (этапы и цели, проверка по состоянию мира), EQUIPMENT SYSTEM (`EQUIP-001…004`), навык инженера, работа с оборудованием с полосой прогресса. После запуска генератора на всём корабле аварийный красный свет сменяется рабочим.

Сюжет: после включения света — силуэт на пульте (`EVENT-002`) и встреча со спутницей в жилом секторе `ROOM-002` (`EVENT-003`), диалоги (`DIALOG-*`, окно с печатью текста), спутница следует за Марком между помещениями.

Навигация: мини-карта текущего помещения, карта корабля (`M`) и указатель на ближайший неисследованный или запертый проход.

## Структура

```
abyss/
  index.html
  css/style.css
  docs/                       GDD и реестр ID
  js/core/ids.js              пространство имён AB, реестр ID, шина событий
  js/data/                    данные по ID (без логики)
    assets.manifest.js        ASSET MANIFEST
    animations.js             ANIM-*
    characters.js             CHAR-*
    rooms.js                  ROOM-*
    events.js                 EVENT-*
    items.js                  ITEM-*
    equipment.js              EQUIP-*
    quests.js                 QUEST-*
    dialogs.js                DIALOG-*
    enemies.js                ENEMY-*
  js/systems/                 игровые системы (GDD §13)
    asset-manager.js          ASSET MANAGER
    animation-manager.js      ANIMATION MANAGER
    character-system.js       CHARACTER SYSTEM
    room-system.js            ROOM SYSTEM
    story-events.js           STORY EVENT MANAGER
    inventory.js              INVENTORY SYSTEM
    interaction.js            взаимодействие: двери, предметы, обыск
    equipment-system.js       EQUIPMENT SYSTEM и питание корабля
    quest-system.js           QUEST SYSTEM
    dialog.js                 DIALOG SYSTEM
    enemy-system.js           ENEMY SYSTEM
    combat.js                 COMBAT SYSTEM
    navigation.js             куда идти дальше
    save-system.js            SAVE SYSTEM
    input.js                  ввод
  js/render/renderer.js       отрисовка: свет, частицы, заглушки
  js/main.js                  запуск и игровой цикл
```

## Графика героя

Марк (`CHAR-001`) нарезан программой `tools/rig_from_fullbody.py` из одной фигуры в полный рост:
исходник `assets/source/CHAR001-01.png`, разметка суставов `tools/rigs/MARK.json`,
части `assets/char001/v2/01/`, скелет `js/data/rigs/MARK.js`. Как делать новых персонажей —
[docs/CHARACTER-ART-SPEC.md](docs/CHARACTER-ART-SPEC.md).

**Как откатить:**
- в игре: меню ☰ → «Графика героя: заглушка» (выбор запоминается);
- на первую версию графики: в `js/data/assets.manifest.js` вернуть `rig: 'CHAR001'` и `parts`
  из `assets/char001/01|02` (файлы и скелет первой версии сохранены);
- в git: отменить коммит «Марк из одной фигуры».

## Как подключить графику

1. Положите файл в `abyss/assets/` (например, `assets/char001-01.png`).
2. В `js/data/assets.manifest.js` у нужного ID замените `src: null` на путь к файлу.
3. Всё. Заглушка с этим ID сменится картинкой; данные персонажа и сюжет не меняются.

Пока у ресурса нет файла, игра рисует временную заглушку и подписывает её ID (кнопка **ID** в углу экрана скрывает подписи).
