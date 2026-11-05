# ABYSS: LOST SIGNAL

Сюжетный sci-fi survival horror с видом сбоку. Браузерная игра на чистом JavaScript (canvas), без сборки и зависимостей.

- Основной документ: [docs/GDD-v0.1.md](docs/GDD-v0.1.md)
- Реестр ID и открытые вопросы: [docs/ID-REGISTRY.md](docs/ID-REGISTRY.md)
- Задание на графику для художника или нейросети: [docs/ART-BRIEF.md](docs/ART-BRIEF.md)
- Описание локаций для генерации фонов: [docs/LOCATIONS-ART.md](docs/LOCATIONS-ART.md)

## Запуск

Откройте `index.html` в браузере. Сервер не нужен.

Управление: `A`/`D` или стрелки — идти, `Shift` — бег, `E` — действие, `F`/`J`/пробел/клик — удар, `I` или `Tab` — инвентарь, `M` — карта. На телефоне — экранные кнопки.

## Готово (этапы 1–5 из GDD §14)

1. **Основа и система ID.** Реестр `AB.ID` проверяет формат ID и не даёт зарегистрировать один ID дважды. Модули общаются через шину событий `AB.Bus`.
2. **Главный герой и управление.** `CHAR-001`: ходьба, бег, взаимодействие, плавный разгон и торможение, клавиатура и сенсорные кнопки.
3. **Медицинский отсек и первый коридор.** `ROOM-001` и `ROOM-011`, двери с условиями доступа, переходы между помещениями, сюжетное событие `EVENT-001` «Пробуждение», сохранение прогресса.
4. **Инвентарь и предметы.** 8 ресурсов из GDD §9 (`ITEM-001`…`ITEM-008`), инвентарь на 8 ячеек со стаками, подбор с пола, обыск контейнеров, использование медикаментов, выбрасывание, здоровье героя.
5. **Первый противник и бой.** `ENEMY-001` с конечным автоматом из GDD §10 (зрение, слух, реакция на свет, отступление), труба `ITEM-009` как оружие, урон и отбрасывание, гибель героя и загрузка сохранения (не сохраняется посреди боя).

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
    enemies.js                ENEMY-*
  js/systems/                 игровые системы (GDD §13)
    asset-manager.js          ASSET MANAGER
    animation-manager.js      ANIMATION MANAGER
    character-system.js       CHARACTER SYSTEM
    room-system.js            ROOM SYSTEM
    story-events.js           STORY EVENT MANAGER
    inventory.js              INVENTORY SYSTEM
    interaction.js            взаимодействие: двери, предметы, обыск
    enemy-system.js           ENEMY SYSTEM
    combat.js                 COMBAT SYSTEM
    navigation.js             куда идти дальше
    save-system.js            SAVE SYSTEM
    input.js                  ввод
  js/render/renderer.js       отрисовка: свет, частицы, заглушки
  js/main.js                  запуск и игровой цикл
```

## Как подключить графику

1. Положите файл в `abyss/assets/` (например, `assets/char001-01.png`).
2. В `js/data/assets.manifest.js` у нужного ID замените `src: null` на путь к файлу.
3. Всё. Заглушка с этим ID сменится картинкой; данные персонажа и сюжет не меняются.

Пока у ресурса нет файла, игра рисует временную заглушку и подписывает её ID (кнопка **ID** в углу экрана скрывает подписи).
