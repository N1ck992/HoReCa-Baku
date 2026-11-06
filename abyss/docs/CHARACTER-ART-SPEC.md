# Стандарт графики персонажей — PROJECT ABYSS

Этот стандарт — для всех персонажей и существ с анимацией по частям.
Его можно целиком передать нейросети или художнику.

## Главное правило

**Одна картинка персонажа в полный рост — и больше ничего.**

Отдельные части (голова, руки, ботинки) рисовать **не нужно**: нейросеть всегда рисует их
в разном масштабе и ракурсе, и они не стыкуются. Части вырезает программа
(`tools/rig_from_fullbody.py`) из одной фигуры — тогда масштаб, ракурс, свет и стыки совпадают сами.

## Требования к картинке

| Что | Требование | Зачем |
|---|---|---|
| Формат | PNG, вертикальный, **1024×2048** (1:2) | хватает деталей для любого экрана |
| Фон | **сплошной ярко-зелёный `#00FF00`**, без градиента, пола и теней | программа точно отделит фигуру; на чёрном фоне теряются тёмные волосы и ботинки |
| Ракурс | **строго сбоку, лицом вправо**, без перспективы | игра — вид сбоку |
| Кадр | фигура **целиком**, от макушки до подошв, ничего не обрезано; рост ~1800 px | нужна вся фигура |
| Свет | ровный, мягкий, спереди; **без цветной подсветки и контрового света** | красный аварийный свет добавляет игра |
| Стиль | реалистичный, мрачный индустриальный sci-fi | как у вас сейчас |

### Поза («поза для нарезки») — самое важное

```
        голова
          │
   задняя │ ближняя рука —
   рука ↙ │ ↘ чуть вперёд, НЕ закрывает тело
          │
       ┌──┴──┐
       │торс │
       └─┬─┬─┘
  задняя ╱   ╲ ближняя нога —
  нога  ╱     ╲ полшага вперёд
```

- **Ближняя рука** (к зрителю) отведена **немного вперёд** от тела (~15°), локоть чуть согнут,
  кисть расслаблена. **Рука не должна закрывать торс.**
- **Дальняя рука** отведена **немного назад** (~15°), чтобы была видна за спиной.
- **Ноги — полшага**: ближняя чуть вперёд, дальняя чуть назад. **Голени и ботинки не перекрываются.**
- Стоит прямо, голова прямо, взгляд вперёд.
- Без предметов в руках, без плащей и длинных болтающихся деталей.

Почему так: всё, что закрыто другой частью тела, программа не видит. Если рука закрывает торс,
при взмахе руки на торсе останется «дыра».

### Варианты внешнего вида

Для каждого варианта (например, обычный и повреждённый костюм) — **отдельная картинка
в точно такой же позе и кадре**. Лучше всего делать второй вариант из первого
(image-to-image / inpaint), меняя только одежду.

## Промпты для Марка (`CHAR-001`)

**Обычный костюм — `ASSET-CHAR001-01`:**

```
Full body character, strict side profile facing right, orthographic, no perspective.
Mark, a male ship engineer in his 30s, short messy dark brown hair, stubble, tired face.
Worn grey-brown engineering jumpsuit with dark padded panels, utility belt with pouches,
shoulder straps, a small cyan status display patch on the near upper arm, heavy worn leather
work boots.
Pose for cut-out animation: standing upright, near arm slightly forward away from the body
(about 15 degrees), elbow slightly bent, relaxed open hand, far arm slightly behind the back,
legs in a half step — near leg slightly forward, far leg slightly back, lower legs not
overlapping. The near arm does not cover the torso.
Whole body visible from the top of the head to the soles, nothing cropped, character fills
90% of the image height.
Flat solid pure green background #00FF00, no floor, no shadow, no gradient.
Even soft neutral front lighting, no colored lights, no rim light.
Realistic, dark industrial sci-fi, Pandorum movie inspired, muted desaturated palette,
high detail, no text, no watermark. Vertical image 1024x2048.
```

**Повреждённый костюм — `ASSET-CHAR001-02`** (из первой картинки, та же поза и кадр):

```
Same character, same pose, same framing, same lighting, same green background.
The jumpsuit is torn and dirty: ripped sleeves and trouser legs, scorch marks, dried blood
stains, a cut on the forehead, grime on the face.
```

## Спутница (`CHAR-002`) — два облика одного персонажа

По канону (docs/STORY.md §4) Марк видит обычную девушку, а все остальные — её **истинный облик**.
Это один персонаж с двумя внешними видами: `ASSET-CHAR002-01` (человек) и `ASSET-CHAR002-02` (существо).

### Облик для Марка — `ASSET-CHAR002-01`

Требования те же, что у Марка: 1024×2048, зелёный фон, строго сбоку лицом вправо, «поза для нарезки».
Волосы **собраны** (тугой хвост или узел) — распущенные длинные волосы при анимации рвутся на части.
Едва заметная странность: она **слишком опрятная** для корабля, где люди годами жили впроголодь.

```
Full body character, strict side profile facing right, orthographic, no perspective.
A young woman in her late 20s, expedition crew member, slim athletic build, calm pale face,
large dark eyes, dark hair pulled back into a tight low bun, no loose strands.
Fitted grey-blue expedition jumpsuit of the same research ship as an engineer's uniform,
dark padded shoulder and knee panels, thin utility belt, small mission patch on the near shoulder,
soft dark boots. The clothes are strangely clean and intact, almost no dirt or wear.
Pose for cut-out animation: standing upright, near arm slightly forward away from the body
(about 15 degrees), elbow slightly bent, relaxed open hand, far arm slightly behind the back,
legs in a half step — near leg slightly forward, far leg slightly back, lower legs not
overlapping. The near arm does not cover the torso.
Whole body visible from the top of the head to the soles, nothing cropped, character fills
90% of the image height.
Flat solid pure green background #00FF00, no floor, no shadow, no gradient.
Even soft neutral front lighting, no colored lights, no rim light.
Realistic, dark industrial sci-fi, Pandorum movie inspired, muted desaturated palette,
high detail, no text, no watermark. Vertical image 1024x2048.
```

### Истинный облик — `ASSET-CHAR002-02` (глубоководный арахнид)

Существо со дна чужого океана: что-то среднее между **морским пауком (пикногонидой)** и глубоководным
кальмаром. Длинные тонкие членистые ноги, полупрозрачное бледное тело, сквозь которое видны
светящиеся нервы. Ростом в холке — примерно по грудь человеку, размах ног — 2,5–3 человеческих роста.
Деталь-намёк: светящиеся точки на «голове» складываются в подобие **человеческого лица** —
тень того облика, который видит Марк.

Картинка 1 — **вся фигура** (для стиля и сборки):

```
Full body alien deep-sea creature, strict side profile facing right, orthographic, no perspective.
A giant sea spider like predator from an alien ocean floor: small elongated body made of a
cephalothorax and a slender abdomen, eight very long thin jointed legs with needle-like tips,
two shorter grasping front palps, a long proboscis-like mouth under the head.
Pale translucent bluish-white skin, faint glowing cyan nerve lines visible under the skin,
small cluster of bioluminescent dots on the head that faintly resembles a human face.
Wet, slimy, elegant and horrifying at the same time.
Pose for cut-out animation: standing on its legs, body raised to about human chest height,
near legs fully visible and spread apart, far legs slightly behind and partly visible,
legs do not cross each other or the body, all leg tips on the same ground line.
Whole creature visible, nothing cropped, fills 90% of the image width.
Flat solid pure green background #00FF00, no floor, no shadow, no water, no glow halo
around the body. Even neutral lighting.
Realistic dark sci-fi horror, Dead Space and deep-sea biology inspired, muted palette with
cyan bioluminescent accents, high detail, no text. Horizontal image 2048x1024.
```

Картинка 2 — **детали по отдельности** (для анимации: одну ногу игра размножит на все восемь):

```
Creature parts sheet of the same alien sea spider, strict side view facing right, orthographic,
each part separate with empty space between them on flat solid pure green background #00FF00:
head with proboscis and glowing face-like dots; cephalothorax; abdomen;
ONE leg split into three segments — upper leg, middle leg, lower leg with needle tip;
one grasping palp. Joint ends rounded so parts overlap at joints.
Even neutral lighting, no shadow, no text, same colors and translucent skin with cyan nerve lines.
```


## Мутант `ENEMY-001` (`ASSET-ENEMY001-01`) — та же графика для `ENEMY-004`, `ENEMY-005`

**Каким он должен быть (как в игре сейчас):** бывший член экипажа, которого «переделала» лаборатория.
Ходит на четырёх конечностях, сгорблен; передние лапы длинные, с когтями; задние — короткие,
согнутые, как у собаки. Бледная больная кожа, сквозь неё — рёбра; на спине вросшие металлические
пластины и трубки, по хребту — шипы. Маленькая голова с челюстью-капканом, глаза светятся оранжевым.
На спине 2 светящихся желтовато-зелёных нароста (биолюминесценция).

**Размер:** в холке примерно по пояс–грудь Марку (≈ 70% роста человека), длина тела ≈ 1,5 высоты.

**Важно для анимации:** все четыре лапы видны и не перекрывают тело и друг друга; пасть чуть
приоткрыта; глаза и наросты рисовать **тускло** — свечение добавит игра.

### Промпт

```
Full body biomechanical mutant creature, former human crew member transformed by a lab experiment,
strict side profile facing right, orthographic, no perspective.
Hunched predator walking on all fours: very long thin front arms ending in three long hooked claws,
short bent dog-like hind legs, elongated arched torso with ribs visible under pale sickly grey-pink skin,
dark metal armor plates grown into the back, black rubber tubes and wires growing out of the spine,
a row of bony spikes along the spine, two swollen dim yellow-green bioluminescent sacs on the back.
Small elongated hairless head, no nose, jaw like a bear trap slightly open with thin needle teeth,
small dull orange eyes.
Pose for cut-out animation: all four limbs fully visible and separated, near front arm slightly forward,
far front arm slightly back, near hind leg slightly back, far hind leg slightly forward,
limbs do not overlap the body or each other, claws and feet touch the same ground line.
Flat solid pure green background #00FF00, no floor, no shadow, no glow, even neutral lighting.
Realistic dark sci-fi horror, Pandorum and Dead Space inspired, muted desaturated palette,
high detail, no text. Horizontal image 2048x1024, creature fills about 80% of the width.
```

### Если генератор путает позу — второй вариант: детали по отдельности

```
Character parts sheet of the same biomechanical mutant, strict side view facing right, orthographic,
each part separate with empty space between them on flat solid pure green background #00FF00:
torso with back plates, tubes, spikes and sacs; head with closed jaw; lower jaw separately;
front upper arm; front forearm with three hooked claws; hind thigh; hind shin with foot.
Joint ends rounded so parts overlap at joints. Even neutral lighting, no shadow, no text,
realistic dark sci-fi horror, muted palette, high detail.
```

## Что происходит после

1. Вы присылаете картинку.
2. Я отмечаю на ней суставы (макушка, шея, плечи, локти, запястья, таз, колени, лодыжки, подошва) —
   это ~15 точек, несколько минут.
3. Программа вырезает части, считает длины костей и точки вращения и создаёт скелет для игры.
4. Персонаж появляется в игре с теми же анимациями. Пропорции — ровно как на картинке.

## Для разработчика: как нарезать персонажа

```
pip install opencv-python-headless    # один раз: достраивание закрытых мест
python3 tools/rig_from_fullbody.py tools/rigs/<RIG>.json
```

Разметка `tools/rigs/<RIG>.json` — координаты суставов в пикселях картинки
(формат описан в начале `tools/rig_from_fullbody.py`). Правила:

- **точки — в центре сустава**, а не на краю одежды;
- **толщина частей (`radius`) — половина ширины части плюс 10–15%**: если указать меньше,
  края руки достанутся торсу и останутся на нём «призраком»;
- все варианты костюма — в одной позе и кадре: разметка одна на всех.

Программа создаёт части в `assets/...` и файл скелета `js/data/rigs/<RIG>.js`.
Подключить в игру:

1. добавить `<script src="js/data/rigs/<RIG>.js">` в `index.html` перед `js/data/rigs.js`;
2. в `js/data/assets.manifest.js` у ресурса указать `type: 'rig', rig: '<RIG>', variant: '01'`
   вместо списка `parts`.

Части, которые на картинке почти не видны (обычно дальнее плечо за торсом), программа
пропускает — игра возьмёт ближнюю пару и затемнит её.
