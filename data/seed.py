"""
Начальные данные проекта: должности, категории тестов и вопросы с ответами.

Это единственный файл, который нужно редактировать, чтобы изменить или
расширить содержимое тестов — логика бота его не затрагивает.

Формат вопроса:
    {
        "text": "...текст вопроса...",
        "options": ["Вариант A", "Вариант B", "Вариант C", "Вариант D"],
        "correct_index": 0,  # индекс правильного варианта в списке options
        "difficulty": 1,     # необязательно: 1 лёгкий, 2 средний, 3 сложный
        "image": "caesar-salad.jpg",  # необязательно: имя файла картинки
    }

Картинка (если указана) должна лежать в webapp/images/questions/ — сайт
сам покажет её над текстом вопроса, аккуратно обрезанной под общий размер.
Пока картинок нигде не используется — это только фундамент на будущее.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database.models import AnswerOption, Category, Position, Question, Rank, Restaurant

POSITIONS: list[dict] = [
    {
        "code": "cook",
        "name": "Повар",
        "emoji": "👨‍🍳",
        "order": 1,
        "categories": [
            {
                "code": "general",
                "name": "Профессиональные знания",
                "emoji": "📚",
                "order": 1,
                "questions": [
                    {
                        "text": "Как правильно вести себя при получении критики от шеф-повара при коллегах?",
                        "options": [
                            "Выслушать и исправить",
                            "Отказаться работать",
                            "Спорить при всех",
                            "Проигнорировать",
                        ],
                        "correct_index": 0,
                        "difficulty": 1,
                    },
                    {
                        "text": "Как часто повар должен мыть руки во время смены?",
                        "options": [
                            "По ситуации",
                            "Раз в начале",
                            "После обеда",
                            "Необязательно",
                        ],
                        "correct_index": 0,
                        "difficulty": 1,
                    },
                    {
                        "text": "У гостя пищевая аллергия, но он забыл предупредить, и блюдо уже готовится с аллергеном. Что делать?",
                        "options": [
                            "Остановить и переделать",
                            "Продолжить готовить",
                            "Убрать кусочек",
                            "Ничего не делать",
                        ],
                        "correct_index": 0,
                        "difficulty": 1,
                    },
                    {
                        "text": "Для чего нужен этап 'мизанплас' перед началом смены?",
                        "options": [
                            "Подготовка ингредиентов",
                            "Мытьё посуды",
                            "Составление меню",
                            "Инвентаризация склада",
                        ],
                        "correct_index": 0,
                        "difficulty": 1,
                    },
                    {
                        "text": "Гость вернул блюдо, сказав, что оно пересолено. Действия повара?",
                        "options": [
                            "Принять и переделать",
                            "Спорить с официантом",
                            "Игнорировать жалобу",
                            "Повторно",
                        ],
                        "correct_index": 0,
                        "difficulty": 1,
                    },
                    {
                        "text": "Какой нож правильнее использовать для нарезки овощей?",
                        "options": ["Шеф-нож", "Нож для хлеба", "Нож для стейка", "Филейный нож"],
                        "correct_index": 0,
                        "difficulty": 2,
                    },
                    {
                        "text": "Для чего нужен кондитерский мешок?",
                        "options": [
                            "Нанесение крема",
                            "Просеивание муки",
                            "Взвешивание",
                            "Замес теста",
                        ],
                        "correct_index": 0,
                        "difficulty": 2,
                    },
                    {
                        "text": "Зачем нужны кондитерские весы с точностью до 1 грамма?",
                        "options": [
                            "Точность рецепта",
                            "Просто удобство",
                            "Только для готового",
                            "Обычные точнее",
                        ],
                        "correct_index": 0,
                        "difficulty": 2,
                    },
                    {
                        "text": "Для чего используется кулинарный (кондитерский) термометр?",
                        "options": [
                            "Контроль сиропа",
                            "Только духовка",
                            "Проверка яиц",
                            "На глаз точнее",
                        ],
                        "correct_index": 0,
                        "difficulty": 2,
                    },
                    {
                        "text": "Для чего нужен планетарный миксер, в отличие от обычного ручного?",
                        "options": [
                            "Долгое взбивание",
                            "Только для хлеба",
                            "Просто дороже",
                            "Нарезка овощей",
                        ],
                        "correct_index": 0,
                        "difficulty": 2,
                    },
                    {
                        "text": "Что такое бланширование?",
                        "options": [
                            "Обдача кипятком",
                            "Долгое тушение",
                            "Жарка во фритюре",
                            "Сухая засолка",
                        ],
                        "correct_index": 0,
                        "difficulty": 3,
                    },
                    {
                        "text": "Что означает термин 'аль денте'?",
                        "options": [
                            "Слегка твёрдое",
                            "Полностью мягкое",
                            "Совсем сырое",
                            "Подгоревшее",
                        ],
                        "correct_index": 0,
                        "difficulty": 3,
                    },
                    {
                        "text": "Что такое темперирование шоколада и зачем оно нужно?",
                        "options": [
                            "Нагрев и охлаждение",
                            "Разогрев в микроволновке",
                            "Смешать с водой",
                            "Хранить в морозилке",
                        ],
                        "correct_index": 0,
                        "difficulty": 3,
                    },
                    {
                        "text": "Что такое карвинг в кулинарии?",
                        "options": [
                            "Художественная резьба",
                            "Способ жарки",
                            "Вид маринада",
                            "Разделка мяса",
                        ],
                        "correct_index": 0,
                        "difficulty": 3,
                    },
                    {
                        "text": "Что такое су-вид (sous-vide) как метод приготовления?",
                        "options": [
                            "Варка в вакууме",
                            "Жарка на гриле",
                            "Холодное копчение",
                            "Быстрая заморозка",
                        ],
                        "correct_index": 0,
                        "difficulty": 3,
                    },
                    {
                        "text": "Как называется предварительная организация рабочего места и всех компонентов перед началом сервиса?",
                        "options": [
                            "Mise en place",
                            "Bain-marie",
                            "À la minute",
                            "Chafing dish",
                        ],
                        "correct_index": 0,
                        "difficulty": 4,
                    },
                    {
                        "text": "Какой метод приготовления предполагает быстрое обжаривание продукта при высокой температуре с небольшим количеством жира?",
                        "options": [
                            "Соте",
                            "Брезирование",
                            "Конфи",
                            "Поширование",
                        ],
                        "correct_index": 0,
                        "difficulty": 4,
                    },
                    {
                        "text": "Как называется процесс быстрого охлаждения приготовленного продукта для безопасного хранения?",
                        "options": [
                            "Шоковое охлаждение",
                            "Медленное охлаждение",
                            "Термальная выдержка",
                            "Сухое охлаждение",
                        ],
                        "correct_index": 0,
                        "difficulty": 4,
                    },
                    {
                        "text": "Какая часть мяса обычно используется для приготовления классического ростбифа?",
                        "options": [
                            "Вырезка",
                            "Рёбра",
                            "Голяшка",
                            "Грудинка",
                        ],
                        "correct_index": 1,
                        "difficulty": 4,
                    },
                    {
                        "text": "Как называется соус, приготовленный на основе мясного коричневого фонда с последующим увариванием?",
                        "options": [
                            "Деми-глас",
                            "Бешамель",
                            "Велюте",
                            "Голландез",
                        ],
                        "correct_index": 0,
                        "difficulty": 4,
                    },
                ],
            },
        ],
    },
    {
        "code": "bartender",
        "name": "Бармен",
        "emoji": "🍸",
        "order": 2,
        "categories": [
            {
                "code": "general",
                "name": "Профессиональные знания",
                "emoji": "📚",
                "order": 1,
                "questions": [
                    {
                        "text": "Гость за барной стойкой явно выпил уже достаточно и просит ещё крепкий напиток. Действия бармена?",
                        "options": [
                            "Отказать",
                            "Всё равно",
                            "Двойную порцию",
                            "Проигнорировать просьбу",
                        ],
                        "correct_index": 0,
                        "difficulty": 1,
                    },
                    {
                        "text": "Как правильно уточнить у гостя предпочтения, если он не может определиться с напитком?",
                        "options": [
                            "Задать вопросы",
                            "Предложить первое",
                            "Сам решает",
                            "Самый дорогой",
                        ],
                        "correct_index": 0,
                        "difficulty": 1,
                    },
                    {
                        "text": "Гость просит порекомендовать безалкогольный коктейль. Что важно учесть?",
                        "options": [
                            "Вкусовые предпочтения",
                            "Предложить сок",
                            "Таких не бывает",
                            "Отказать в обслуживании",
                        ],
                        "correct_index": 0,
                        "difficulty": 1,
                    },
                    {
                        "text": "Как бармену вести себя, если гость пытается завязать личную беседу не по делу во время наплыва заказов?",
                        "options": [
                            "Кратко ответить",
                            "Игнорировать гостя",
                            "Резко прервать",
                            "Остановить работу",
                        ],
                        "correct_index": 0,
                        "difficulty": 1,
                    },
                    {
                        "text": "Гость просит проверить состав коктейля из-за возможной аллергии. Действия бармена?",
                        "options": [
                            "Перечислить состав",
                            "Сказать неважно",
                            "Приблизительно назвать",
                            "Отказать в информации",
                        ],
                        "correct_index": 0,
                        "difficulty": 1,
                    },
                    {
                        "text": "Что такое джиггер?",
                        "options": [
                            "Мерный стакан",
                            "Колка льда",
                            "Вид шейкера",
                            "Бокал для виски",
                        ],
                        "correct_index": 0,
                        "difficulty": 2,
                    },
                    {
                        "text": "В каком бокале традиционно подают коктейль 'Маргарита'?",
                        "options": [
                            "Коупет",
                            "Хайбол",
                            "Шот",
                            "Кружка",
                        ],
                        "correct_index": 0,
                        "difficulty": 2,
                    },
                    {
                        "text": "Зачем используется стрейнер (strainer)?",
                        "options": [
                            "Процедить лёд",
                            "Охладить бокал",
                            "Измерить крепость",
                            "Взбить сливки",
                        ],
                        "correct_index": 0,
                        "difficulty": 2,
                    },
                    {
                        "text": "Что такое 'гарнир' в контексте коктейля?",
                        "options": [
                            "Украшение напитка",
                            "Основной алкоголь",
                            "Тип бокала",
                            "Способ охлаждения",
                        ],
                        "correct_index": 0,
                        "difficulty": 2,
                    },
                    {
                        "text": "Как правильно охладить бокал перед подачей коктейля без льда (например, для мартини)?",
                        "options": [
                            "В морозилке",
                            "Комнатной температуры",
                            "Согреть руками",
                            "Горячей водой",
                        ],
                        "correct_index": 0,
                        "difficulty": 2,
                    },
                    {
                        "text": "Что означает термин 'билд' (build) при приготовлении коктейля?",
                        "options": [
                            "Смешать в бокале",
                            "В блендере",
                            "Двойная перегонка",
                            "Настаивание на травах",
                        ],
                        "correct_index": 0,
                        "difficulty": 3,
                    },
                    {
                        "text": "Из какой страны происходит коктейль 'Куба Либре'?",
                        "options": [
                            "Куба",
                            "Мексика",
                            "Испания",
                            "США",
                        ],
                        "correct_index": 0,
                        "difficulty": 3,
                    },
                    {
                        "text": "Что такое инфьюз (infusion) в баре?",
                        "options": [
                            "Настаивание алкоголя",
                            "Взбивание коктейля",
                            "Охлаждение бокала",
                            "Двойная перегонка",
                        ],
                        "correct_index": 0,
                        "difficulty": 3,
                    },
                    {
                        "text": "Что такое карвинг применительно к барной стойке?",
                        "options": [
                            "Резьба по фруктам",
                            "Способ взбалтывания",
                            "Метод перегонки",
                            "Вид бокала",
                        ],
                        "correct_index": 0,
                        "difficulty": 3,
                    },
                    {
                        "text": "Что такое мадлинг (muddling) при приготовлении коктейля?",
                        "options": [
                            "Растирание ингредиентов",
                            "Взбалтывание льда",
                            "Процеживание",
                            "Подогрев бокала",
                        ],
                        "correct_index": 0,
                        "difficulty": 3,
                    },
                ],
            },
        ],
    },
    {
        "code": "waiter",
        "name": "Официант",
        "emoji": "🍽",
        "order": 3,
        "categories": [
            {
                "code": "basics",
                "name": "Основы профессии",
                "emoji": "📚",
                "order": 1,
                "questions": [
                    {
                        "text": "С какой стороны от гостя принято подавать блюда?",
                        "options": ["Слева", "Справа", "От кухни", "Неважно"],
                        "correct_index": 0,
                        "difficulty": 1,
                    },
                    {
                        "text": "С какой стороны принято убирать использованную посуду?",
                        "options": [
                            "Справа",
                            "Слева",
                            "Перегнувшись",
                            "Неважно",
                        ],
                        "correct_index": 0,
                        "difficulty": 1,
                    },
                    {
                        "text": "Что должен знать официант о блюдах меню перед началом смены?",
                        "options": [
                            "Состав и аллергены",
                            "Только название",
                            "Только цену",
                            "Работа повара",
                        ],
                        "correct_index": 0,
                        "difficulty": 2,
                    },
                    {
                        "text": "Как правильно принять заказ у гостя?",
                        "options": [
                            "Выслушать и повторить",
                            "Записать на слух",
                            "Отправить на кухню",
                            "Уйти без уточнений",
                        ],
                        "correct_index": 0,
                        "difficulty": 2,
                    },
                    {
                        "text": "Когда правильно приносить счёт гостю?",
                        "options": [
                            "По просьбе гостя",
                            "После блюда",
                            "В начале визита",
                            "Не приносить",
                        ],
                        "correct_index": 0,
                        "difficulty": 3,
                    },
                    {
                        "text": "Для какого напитка используется бокал на высокой ножке с узким верхом (флюте)?",
                        "options": [
                            "Шампанское",
                            "Пиво",
                            "Крепкий алкоголь",
                            "Горячий чай",
                        ],
                        "correct_index": 0,
                        "difficulty": 2,
                    },
                    {
                        "text": "Где по правилам сервировки должна лежать вилка относительно тарелки?",
                        "options": ["Слева", "Справа", "Поверх", "Без правил"],
                        "correct_index": 0,
                        "difficulty": 1,
                    },
                    {
                        "text": "Что нужно сделать в первую очередь, заметив на подносе шаткий или треснувший бокал?",
                        "options": [
                            "Заменить бокал",
                            "Всё равно",
                            "Протереть салфеткой",
                            "Спросить гостя",
                        ],
                        "correct_index": 0,
                        "difficulty": 2,
                    },
                    {
                        "text": "Зачем перед началом смены официант проверяет наличие расходников (салфетки, приборы, бланки заказов)?",
                        "options": [
                            "Не отвлекаться потом",
                            "Не его обязанность",
                            "Только по указанию",
                            "Раз в неделю",
                        ],
                        "correct_index": 0,
                        "difficulty": 1,
                    },
                    {
                        "text": "Как правильно переносить поднос с несколькими напитками?",
                        "options": [
                            "На ладони, у плеча",
                            "В одной руке",
                            "Прижав к груди",
                            "Как угодно",
                        ],
                        "correct_index": 0,
                        "difficulty": 2,
                    },
                ],
            },
            {
                "code": "guests",
                "name": "Работа с гостями",
                "emoji": "👥",
                "order": 2,
                "questions": [
                    {
                        "text": "Гость недоволен тем, что его заказ задерживается. Что правильнее всего сделать?",
                        "options": [
                            "Игнорировать гостя",
                            "Объяснить и уточнить",
                            "Проблема кухни",
                            "Попросить подождать",
                        ],
                        "correct_index": 1,
                        "difficulty": 1,
                    },
                    {
                        "text": "Как официанту лучше встретить гостей, впервые пришедших в заведение?",
                        "options": [
                            "Поприветствовать и проводить",
                            "Указать на стол",
                            "Молча вручить",
                            "Подождать в стороне",
                        ],
                        "correct_index": 0,
                        "difficulty": 1,
                    },
                    {
                        "text": "Гость просит порекомендовать блюдо. Что важно учесть при рекомендации?",
                        "options": [
                            "Предпочтения гостя",
                            "Самое дорогое",
                            "Что проще",
                            "Свои вкусы",
                        ],
                        "correct_index": 0,
                        "difficulty": 2,
                    },
                    {
                        "text": "Как правильно обслуживать гостя с ребёнком?",
                        "options": [
                            "Детское меню",
                            "Как обычно",
                            "Просить не приходить",
                            "Игнорировать ребёнка",
                        ],
                        "correct_index": 0,
                        "difficulty": 2,
                    },
                    {
                        "text": "Гость long time сидит с пустым бокалом, но ничего не просит. Действия официанта?",
                        "options": [
                            "Ненавязчиво предложить",
                            "Ждать в стороне",
                            "Молча убрать",
                            "Спросить напрямую",
                        ],
                        "correct_index": 0,
                        "difficulty": 3,
                    },
                ],
            },
            {
                "code": "orders",
                "name": "Работа с заказами",
                "emoji": "🧾",
                "order": 3,
                "questions": [
                    {
                        "text": "Гость просит заменить гарнир. Как должен поступить официант?",
                        "options": [
                            "Уточнить на кухне",
                            "Сразу отказать",
                            "Заменить самому",
                            "Замены невозможны",
                        ],
                        "correct_index": 0,
                        "difficulty": 1,
                    },
                    {
                        "text": "Официант заметил, что забыл передать часть заказа на кухню. Что делать?",
                        "options": [
                            "Сообщить сразу",
                            "Промолчать",
                            "Соврать о меню",
                            "Отменить заказ",
                        ],
                        "correct_index": 0,
                        "difficulty": 1,
                    },
                    {
                        "text": "Как правильно вносить заказ в систему учёта (POS)?",
                        "options": [
                            "Сразу и точно",
                            "В конце смены",
                            "Только блюда",
                            "Устно на кухню",
                        ],
                        "correct_index": 0,
                        "difficulty": 2,
                    },
                    {
                        "text": "Гостю принесли не то блюдо, которое он заказывал. Действия официанта?",
                        "options": [
                            "Извиниться и заменить",
                            "Убедить гостя",
                            "Оставить",
                            "Предложить доплату",
                        ],
                        "correct_index": 0,
                        "difficulty": 2,
                    },
                    {
                        "text": "Как правильно разделить счёт, если компания гостей просит оплатить раздельно?",
                        "options": [
                            "Уточнить и разделить",
                            "Поровну без уточнений",
                            "Отказать в разделении",
                            "Сами решают",
                        ],
                        "correct_index": 0,
                        "difficulty": 3,
                    },
                ],
            },
            {
                "code": "conflicts",
                "name": "Конфликтные ситуации",
                "emoji": "⚠️",
                "order": 4,
                "questions": [
                    {
                        "text": "Гость громко высказывает недовольство качеством блюда при других посетителях. Действия официанта?",
                        "options": [
                            "Извиниться",
                            "Спорить с гостем",
                            "Проигнорировать замечание",
                            "Попросить уйти",
                        ],
                        "correct_index": 0,
                        "difficulty": 1,
                    },
                    {
                        "text": "Гость отказывается платить за блюдо, которое, по его словам, было невкусным, хотя претензий по качеству не было при подаче. Действия официанта?",
                        "options": [
                            "Передать менеджеру",
                            "Списать самому",
                            "Настаивать резко",
                            "Проигнорировать гостя",
                        ],
                        "correct_index": 0,
                        "difficulty": 1,
                    },
                    {
                        "text": "Два гостя за соседними столами конфликтуют из-за шума. Действия официанта?",
                        "options": [
                            "Урегулировать ситуацию",
                            "Встать на сторону",
                            "Не вмешиваться",
                            "Попросить уйти",
                        ],
                        "correct_index": 0,
                        "difficulty": 2,
                    },
                    {
                        "text": "Гость ведёт себя грубо и повышает голос на официанта необоснованно. Как правильно реагировать?",
                        "options": [
                            "Сохранять спокойствие",
                            "Ответить грубо",
                            "Молча уйти",
                            "Вступить в спор",
                        ],
                        "correct_index": 0,
                        "difficulty": 2,
                    },
                    {
                        "text": "Официант случайно пролил напиток на гостя. Правильные действия?",
                        "options": [
                            "Извиниться и помочь",
                            "Сделать вид",
                            "Обвинить гостя",
                            "Просто извиниться",
                        ],
                        "correct_index": 0,
                        "difficulty": 3,
                    },
                ],
            },
        ],
    },
]


# Ранги для системы прогрессии: пользователь получает опыт (XP) за каждый
# правильный ответ (сложность вопроса × 10 XP) и поднимается по рангам
# внутри выбранной должности. min_xp — порог общего накопленного опыта по
# этой должности, начиная с которого присваивается ранг.
RANKS: dict[str, list[dict]] = {
    "cook": [
        {"level": 1, "title": "Стажёр повара", "emoji": "🥄", "min_xp": 0},
        {"level": 2, "title": "Повар", "emoji": "👨‍🍳", "min_xp": 150},
        {"level": 3, "title": "Су-шеф", "emoji": "🔪", "min_xp": 400},
        {"level": 4, "title": "Шеф-повар", "emoji": "🎩", "min_xp": 800},
        {"level": 5, "title": "Бренд-шеф", "emoji": "⭐", "min_xp": 1500},
    ],
    "bartender": [
        {"level": 1, "title": "Барбэк", "emoji": "🧊", "min_xp": 0},
        {"level": 2, "title": "Бармен", "emoji": "🍸", "min_xp": 150},
        {"level": 3, "title": "Миксолог", "emoji": "🍹", "min_xp": 400},
        {"level": 4, "title": "Бренд-бармен", "emoji": "🥂", "min_xp": 800},
        {"level": 5, "title": "Сомелье", "emoji": "🍷", "min_xp": 1500},
    ],
    "waiter": [
        {"level": 1, "title": "Стажёр", "emoji": "🍽", "min_xp": 0},
        {"level": 2, "title": "Официант", "emoji": "🧑‍🍳", "min_xp": 150},
        {"level": 3, "title": "Старший официант", "emoji": "🎯", "min_xp": 400},
        {"level": 4, "title": "Метрдотель", "emoji": "🎩", "min_xp": 800},
        {"level": 5, "title": "Мастер сервиса", "emoji": "👑", "min_xp": 1500},
    ],
}


async def _seed_position(
    session: AsyncSession, position_data: dict, restaurant_id: int | None = None
) -> None:
    """Создаёт одну должность (с категориями/вопросами/рангами) из словаря
    в формате POSITIONS / RESTAURANT_POSITIONS. restaurant_id=None означает
    общую должность, видную всем; иначе — уникальную должность заведения."""
    position = Position(
        code=position_data["code"],
        name=position_data["name"],
        emoji=position_data["emoji"],
        order=position_data["order"],
        is_active=True,
        restaurant_id=restaurant_id,
    )
    session.add(position)
    await session.flush()  # получить position.id

    for category_data in position_data["categories"]:
        category = Category(
            position_id=position.id,
            code=category_data["code"],
            name=category_data["name"],
            emoji=category_data["emoji"],
            order=category_data["order"],
        )
        session.add(category)
        await session.flush()

        for q_order, question_data in enumerate(category_data["questions"], start=1):
            question = Question(
                category_id=category.id,
                text=question_data["text"],
                order=q_order,
                difficulty=question_data.get("difficulty", 1),
                image_path=question_data.get("image"),
            )
            session.add(question)
            await session.flush()

            for o_order, option_text in enumerate(question_data["options"]):
                session.add(
                    AnswerOption(
                        question_id=question.id,
                        text=option_text,
                        is_correct=(o_order == question_data["correct_index"]),
                        order=o_order,
                    )
                )

    for rank_data in RANKS.get(position_data["code"], []):
        session.add(
            Rank(
                position_id=position.id,
                level=rank_data["level"],
                title=rank_data["title"],
                emoji=rank_data["emoji"],
                min_xp=rank_data["min_xp"],
            )
        )


async def seed_data(session: AsyncSession) -> None:
    """Заполняет базу общими должностями (Повар/Бармен/Официант), если их
    ещё нет. Уникальные должности отдельных заведений сеются отдельно —
    см. seed_restaurant_positions() ниже."""
    result = await session.execute(select(Position).where(Position.restaurant_id.is_(None)))
    if result.scalars().first() is not None:
        return  # общие должности уже созданы — переходим к досеиванию новых вопросов
        # (см. sync_new_questions ниже — вызывается отдельно в main.py)

    for position_data in POSITIONS:
        await _seed_position(session, position_data, restaurant_id=None)

    await session.commit()


async def cleanup_removed_categories(session: AsyncSession) -> None:
    """НЕ используется активно — оставлено намеренно неразрушительным.

    Раньше эта функция физически удаляла категории (и всю историю
    тестов по ним), которых больше нет в текущей структуре файла для
    данной должности. Отказались от этого подхода, чтобы не терять
    историю уже пройденных тестов при реструктуризации контента —
    вместо этого устаревшие категории просто СКРЫВАЮТСЯ из списка на
    сайте (см. _current_category_codes_for_position и его использование
    в webapp_api.py), а сами данные остаются в базе нетронутыми."""
    return


def _current_category_codes_for_position(position_code: str) -> set[str] | None:
    """Коды категорий, которые сейчас актуальны для этой должности по
    данным этого файла — используется, чтобы скрыть с сайта категории,
    оставшиеся в базе от старой структуры контента (без их удаления, во
    избежание потери истории уже пройденных по ним тестов)."""
    position_data = next((p for p in POSITIONS if p["code"] == position_code), None)
    if position_data is None:
        return None
    return {c["code"] for c in position_data["categories"]}


async def sync_question_options(session: AsyncSession) -> None:
    """Обновляет тексты и правильность вариантов ответа для УЖЕ
    существующих в базе вопросов, если они изменились в этом файле.
    Обычное досеивание (sync_new_questions ниже) сверяет только текст
    самого ВОПРОСА — если он не поменялся, вопрос считается "уже есть" и
    пропускается, даже если варианты ОТВЕТОВ внутри него изменились.
    Эта функция закрывает именно этот пробел: применяется и к общим
    тестам, и ко всем уже созданным копиям тестов для каждого заведения
    (Michel и т.д.), а не только к общим."""
    result = await session.execute(select(Position))
    all_positions = list(result.scalars().unique().all())
    updated = 0

    for position in all_positions:
        position_data = next((p for p in POSITIONS if p["code"] == position.code), None)
        if position_data is None:
            continue

        for category_data in position_data["categories"]:
            result = await session.execute(
                select(Category).where(
                    Category.position_id == position.id, Category.code == category_data["code"]
                )
            )
            category = result.scalars().first()
            if category is None:
                continue

            for question_data in category_data["questions"]:
                result = await session.execute(
                    select(Question).where(
                        Question.category_id == category.id,
                        Question.text == question_data["text"],
                    )
                )
                question = result.scalars().first()
                if question is None:
                    continue

                result = await session.execute(
                    select(AnswerOption)
                    .where(AnswerOption.question_id == question.id)
                    .order_by(AnswerOption.order)
                )
                db_options = list(result.scalars().all())
                file_options = question_data["options"]

                if len(db_options) != len(file_options):
                    continue  # структура разошлась — на всякий случай пропускаем

                for i, db_opt in enumerate(db_options):
                    new_text = file_options[i]
                    new_is_correct = i == question_data["correct_index"]
                    if db_opt.text != new_text or db_opt.is_correct != new_is_correct:
                        db_opt.text = new_text
                        db_opt.is_correct = new_is_correct
                        updated += 1

    if updated:
        await session.commit()


async def sync_new_questions(session: AsyncSession) -> None:
    """Безопасно добавляет новые категории/вопросы, которых ещё нет в
    базе — сравнение идёт по точному тексту вопроса (внутри категории)
    или по коду категории (для совсем новых категорий). Применяется и к
    общим тестам, и ко всем уже созданным копиям тестов для каждого
    заведения (Michel и т.д.) — раньше это касалось только общих тестов,
    из-за чего у заведений с собственной копией новые категории могли не
    появляться после реструктуризации содержимого."""
    added = 0
    result = await session.execute(select(Position))
    all_positions = list(result.scalars().unique().all())

    for position in all_positions:
        position_data = next((p for p in POSITIONS if p["code"] == position.code), None)
        if position_data is None:
            continue

        for category_data in position_data["categories"]:
            result = await session.execute(
                select(Category).where(
                    Category.position_id == position.id, Category.code == category_data["code"]
                )
            )
            category = result.scalars().first()
            if category is None:
                # Совершенно новая категория (например, только что добавленная
                # в этот файл) — создаём её целиком со всеми вопросами разом.
                category = Category(
                    position_id=position.id,
                    code=category_data["code"],
                    name=category_data["name"],
                    emoji=category_data.get("emoji", ""),
                    order=category_data.get("order", 0),
                )
                session.add(category)
                await session.flush()

                for q_order, question_data in enumerate(category_data["questions"], start=1):
                    question = Question(
                        category_id=category.id,
                        text=question_data["text"],
                        order=q_order,
                        difficulty=question_data.get("difficulty", 1),
                        image_path=question_data.get("image"),
                    )
                    session.add(question)
                    await session.flush()
                    added += 1
                    for o_order, option_text in enumerate(question_data["options"]):
                        session.add(
                            AnswerOption(
                                question_id=question.id,
                                text=option_text,
                                is_correct=(o_order == question_data["correct_index"]),
                                order=o_order,
                            )
                        )
                continue  # категория только что полностью создана целиком

            result = await session.execute(
                select(Question.text).where(Question.category_id == category.id)
            )
            existing_texts = {row[0] for row in result.all()}

            result = await session.execute(
                select(Question.order)
                .where(Question.category_id == category.id)
                .order_by(Question.order.desc())
                .limit(1)
            )
            next_order = (result.scalar() or 0) + 1

            for question_data in category_data["questions"]:
                if question_data["text"] in existing_texts:
                    continue

                question = Question(
                    category_id=category.id,
                    text=question_data["text"],
                    order=next_order,
                    difficulty=question_data.get("difficulty", 1),
                    image_path=question_data.get("image"),
                )
                session.add(question)
                await session.flush()
                next_order += 1
                added += 1

                for o_order, option_text in enumerate(question_data["options"]):
                    session.add(
                        AnswerOption(
                            question_id=question.id,
                            text=option_text,
                            is_correct=(o_order == question_data["correct_index"]),
                            order=o_order,
                        )
                    )

    if added:
        await session.commit()


# ---------- Уникальные должности отдельных заведений ----------
# Ключ словаря — ТОЧНОЕ название заведения, как оно указано в /admin при
# создании через "➕ Добавить заведение" (регистр и пробелы важны). Как
# только заведение с таким именем появится в базе, при следующем запуске
# бота ему автоматически добавятся указанные здесь должности с уникальными
# тестами — ничего вручную пересоздавать не нужно.
#
# Формат такой же, как у POSITIONS выше. Пример:
#
# RESTAURANT_POSITIONS: dict[str, list[dict]] = {
#     "Gazelli Cafe": [
#         {
#             "code": "gazelli_barista",
#             "name": "Бариста Gazelli Cafe",
#             "emoji": "☕",
#             "order": 1,
#             "categories": [...],  # тот же формат, что и в POSITIONS
#         },
#     ],
# }
RESTAURANT_POSITIONS: dict[str, list[dict]] = {
    # Временная заглушка: копия общих тестов (Повар/Бармен/Официант),
    # помеченная как уникальные тесты именно заведения "Michel" — чтобы
    # его результаты корректно отображались в панели администратора,
    # пока у заведения ещё нет по-настоящему своих уникальных тестов.
    # Название заведения указано ТОЧНО как при создании через /admin.
    "Michel": POSITIONS,
}


async def seed_missing_restaurant_positions(session: AsyncSession) -> None:
    """Проходит по ВСЕМ уже существующим заведениям и досоздаёт им
    собственные уникальные тесты, если их ещё нет — на случай, если
    заведение было создано до того, как это стало происходить
    автоматически при одобрении. Безопасно вызывать при каждом
    перезапуске: у заведений, где свои должности уже есть, ничего не
    меняется."""
    result = await session.execute(select(Restaurant))
    for restaurant in result.scalars().all():
        await seed_positions_for_restaurant(session, restaurant.id)


async def seed_positions_for_restaurant(session: AsyncSession, restaurant_id: int) -> None:
    """Создаёт для НОВОГО заведения копию общих должностей/категорий/
    вопросов как его собственные уникальные тесты. Раньше это делалось
    вручную только для одного заведения (Michel) через RESTAURANT_POSITIONS
    — из-за этого у всех остальных новых заведений результаты тестов
    персонала не засчитывались в статистику (админ-панель считает только
    тесты именно СВОЕЙ должности, а без этой копии сотрудники проходили
    только общие тесты). Теперь это происходит автоматически при
    одобрении каждого нового заведения, без ручной правки этого файла."""
    result = await session.execute(
        select(Position).where(Position.restaurant_id == restaurant_id)
    )
    if result.scalars().first() is not None:
        return  # у этого заведения уже есть свои должности — не дублируем

    for position_data in POSITIONS:
        await _seed_position(session, position_data, restaurant_id=restaurant_id)

    await session.commit()


async def seed_restaurant_positions(session: AsyncSession) -> None:
    """Добавляет уникальные должности для заведений из RESTAURANT_POSITIONS,
    если у соответствующего заведения их ещё нет. Безопасно вызывать при
    каждом запуске бота — уже созданные должности не дублируются, а для
    заведений, которых ещё нет в базе, содержимое просто ждёт своей очереди
    и добавится само после того, как заведение создадут через /admin."""
    if not RESTAURANT_POSITIONS:
        return

    for restaurant_name, position_list in RESTAURANT_POSITIONS.items():
        result = await session.execute(
            select(Restaurant).where(Restaurant.name == restaurant_name)
        )
        restaurant = result.scalars().first()
        if restaurant is None:
            continue  # заведение ещё не создано через /admin — пропускаем пока

        for position_data in position_list:
            existing = await session.execute(
                select(Position).where(
                    Position.code == position_data["code"],
                    Position.restaurant_id == restaurant.id,
                )
            )
            if existing.scalars().first() is not None:
                continue  # эта должность уже была добавлена раньше

            await _seed_position(session, position_data, restaurant_id=restaurant.id)

    await session.commit()
