from aiogram.types import InlineKeyboardMarkup, KeyboardButton, ReplyKeyboardMarkup, WebAppInfo
from aiogram.utils.keyboard import InlineKeyboardBuilder

from database.models import AnswerOption, Category, Position, Vacancy

MAIN_MENU_BUTTON_TEXT = "🏠 Главное меню"


def persistent_menu_kb() -> ReplyKeyboardMarkup:
    """Постоянная кнопка под полем ввода. Нажатие присылает текст
    MAIN_MENU_BUTTON_TEXT обычным сообщением — обработчик в handlers/start.py
    реагирует на него так же, как на /start (и в личке, и в группе)."""
    return ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text=MAIN_MENU_BUTTON_TEXT)]],
        resize_keyboard=True,
        is_persistent=True,
    )


def webapp_open_kb(url: str, button_text: str = "🎓 Открыть тест") -> InlineKeyboardMarkup:
    """Кнопка, открывающая сайт прямо внутри Telegram (Mini App).
    Работает только в личных сообщениях — таково ограничение Telegram
    для кнопок такого типа. Используется для теста, профиля, экзамена
    и панели администратора — просто с разным текстом и разной ссылкой
    (параметр ?screen=... в URL определяет, какой экран сайта открыть).

    Специально БЕЗ второй кнопки "Главное меню" — раньше она тут была,
    но вела в общее меню бота напрямую, без подтверждения, в обход
    логики в handlers/start.py (btn_main_menu), которая как раз и должна
    спрашивать "вы уверены?" перед выходом из меню заведения. Для
    возврата уже есть постоянная кнопка внизу экрана — дублировать её
    здесь не нужно."""
    builder = InlineKeyboardBuilder()
    builder.button(text=button_text, web_app=WebAppInfo(url=url))
    builder.adjust(1)
    return builder.as_markup()


def main_menu_kb() -> InlineKeyboardMarkup:
    """Общее (гостевое) меню бота. Кнопки экзамена тут больше нет —
    сдать экзамен можно только внутри меню своего заведения (кнопка
    «📩 Запросить экзамен» в join_menu_kb), потому что экзамен принимает
    именно тот менеджер, который пригласил человека своей ссылкой."""
    builder = InlineKeyboardBuilder()
    builder.button(text="🎯 Пробный тест", callback_data="menu:positions")
    builder.button(text="🏢 Рейтинг заведений", callback_data="menu:leaderboard")
    builder.button(text="👤 Мой профиль", callback_data="menu:profile")
    builder.button(text="💼 Вакансии", callback_data="menu:vacancies")
    builder.button(text="❓ Помощь", callback_data="menu:help")
    builder.adjust(1)
    return builder.as_markup()


def open_private_chat_kb(bot_username: str) -> InlineKeyboardMarkup:
    """Кнопка-ссылка, которая открывает личный чат с ботом (используется в
    сообщениях внутри групп заведений — чтобы сотрудник мог сразу перейти
    в личку одним кликом, а не искать бота вручную)."""
    builder = InlineKeyboardBuilder()
    builder.button(text="💬 Открыть бота в личке", url=f"https://t.me/{bot_username}?start=from_group")
    builder.adjust(1)
    return builder.as_markup()


def join_menu_kb(bot_username: str, restaurant_id: int, is_manager: bool = False) -> InlineKeyboardMarkup:
    """Личное меню сотрудника заведения — открывается сразу в личке по
    персональной пригласительной ссылке, без всякой группы. «Мой профиль» —
    настоящий экран с реальными данными и кнопкой выхода из заведения
    (это работающая функция, поэтому не через макет сайта). «Пройти тест» —
    ссылка на Mini App. «Запросить экзамен» — только для персонала:
    администратор сам ВЫДАЁТ код, а не запрашивает его, поэтому эта кнопка
    была бы для него бессмысленной и только путала бы. Кнопка панели
    администратора — только если человек уже добавлен менеджером этого
    заведения (проверяется на сервере)."""
    builder = InlineKeyboardBuilder()
    builder.button(text="👤 Мой профиль", callback_data="menu:profile")
    builder.button(text="🎓 Пройти тест", url=f"https://t.me/{bot_username}?start=tests_{restaurant_id}")
    if not is_manager:
        builder.button(
            text="📩 Запросить экзамен", url=f"https://t.me/{bot_username}?start=examcode_{restaurant_id}"
        )
    if is_manager:
        builder.button(
            text="🧑‍💼 Панель администратора",
            url=f"https://t.me/{bot_username}?start=manageropen_{restaurant_id}",
        )
    builder.adjust(1)
    return builder.as_markup()


def restaurant_switch_kb(restaurants) -> InlineKeyboardMarkup:
    """Список заведений для человека, который администрирует несколько —
    нажатие сразу открывает личное меню выбранного заведения (не просто
    панель администратора, а полное меню — на случай если он там ещё и
    сотрудник)."""
    builder = InlineKeyboardBuilder()
    for restaurant in restaurants:
        builder.button(text=restaurant.name, callback_data=f"choose_restaurant:{restaurant.id}")
    builder.adjust(1)
    return builder.as_markup()


def group_menu_kb(bot_username: str, restaurant_id: int) -> InlineKeyboardMarkup:
    """Единое меню группы заведения — видно всем участникам (ограничение
    Telegram — иначе никак). Три первые кнопки — обычные ссылки: по
    нажатию человек попадает в СВОЮ личку с ботом, приватно.

    Кнопка «Панель администратора» сделана НЕ ссылкой, а обычной
    callback-кнопкой: нажатие сначала уходит боту, тот проверяет, реальный
    ли это администратор заведения, и либо показывает alert «недостаточно
    прав» (не открывая личку), либо сам открывает личку на панели
    администратора — см. cb_group_admin_open в handlers/restaurants.py."""
    builder = InlineKeyboardBuilder()
    builder.button(text="👤 Мой профиль", url=f"https://t.me/{bot_username}?start=profile_{restaurant_id}")
    builder.button(text="🎓 Пройти тест", url=f"https://t.me/{bot_username}?start=tests_{restaurant_id}")
    builder.button(
        text="📩 Запросить экзамен", url=f"https://t.me/{bot_username}?start=examcode_{restaurant_id}"
    )
    builder.button(
        text="🧑‍💼 Панель администратора", callback_data=f"group_admin_open:{restaurant_id}"
    )
    builder.adjust(1)
    return builder.as_markup()


def profile_kb(restaurant_id: int | None = None) -> InlineKeyboardMarkup:
    """Клавиатура экрана профиля: тесты, рейтинг, назад. Если сотрудник
    привязан к заведению — добавляются кнопки возврата в меню заведения
    и выхода из него."""
    builder = InlineKeyboardBuilder()
    builder.button(text="📝 Мои тесты", callback_data="menu:my_tests")
    builder.button(text="🏢 Рейтинг заведений", callback_data="menu:leaderboard")
    if restaurant_id is not None:
        builder.button(
            text="🔙 Вернуться в меню заведения", callback_data=f"back_to_restaurant:{restaurant_id}"
        )
        builder.button(
            text="🚪 Покинуть заведение", callback_data=f"leave_restaurant_ask:{restaurant_id}"
        )
    builder.button(text="⬅️ Главное меню", callback_data="menu:main")
    builder.adjust(1)
    return builder.as_markup()


def positions_kb(positions: list[Position]) -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    for position in positions:
        builder.button(
            text=f"{position.emoji} {position.name}",
            callback_data=f"position:{position.id}",
        )
    builder.button(text="⬅️ Главное меню", callback_data="menu:main")
    builder.adjust(1)
    return builder.as_markup()


def categories_kb(categories: list[Category], position_id: int) -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    for category in categories:
        builder.button(
            text=f"{category.emoji} {category.name}",
            callback_data=f"category:{category.id}",
        )
    builder.button(text="👔 Другая должность", callback_data="menu:positions")
    builder.button(text="⬅️ Главное меню", callback_data="menu:main")
    builder.adjust(1)
    return builder.as_markup()


def question_kb(options: list[AnswerOption]) -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    labels = ["A", "B", "C", "D", "E", "F"]
    for idx, option in enumerate(options):
        label = labels[idx] if idx < len(labels) else str(idx + 1)
        builder.button(text=f"{label}) {option.text}", callback_data=f"answer:{option.id}")
    builder.adjust(1)
    return builder.as_markup()


def result_kb(position_id: int) -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    builder.button(text="📚 Другая категория", callback_data=f"position:{position_id}")
    builder.button(text="👤 Мой профиль", callback_data="menu:profile")
    builder.button(text="⬅️ Главное меню", callback_data="menu:main")
    builder.adjust(1)
    return builder.as_markup()


def back_to_main_kb() -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    builder.button(text="⬅️ Главное меню", callback_data="menu:main")
    builder.adjust(1)
    return builder.as_markup()


def leaderboard_kb() -> InlineKeyboardMarkup:
    """Клавиатура экрана «Рейтинг заведений» — сюда же перенесена кнопка
    добавления нового заведения (раньше была отдельным пунктом в главном
    меню, что смешивало общие функции бота с функциями конкретных
    заведений)."""
    builder = InlineKeyboardBuilder()
    builder.button(text="➕ Добавить моё заведение", callback_data="menu:add_restaurant")
    builder.button(text="⬅️ Главное меню", callback_data="menu:main")
    builder.adjust(1)
    return builder.as_markup()


# ---------- Экзамены ----------

def exam_entry_kb() -> InlineKeyboardMarkup:
    """Экран ввода кода: можно ввести код текстом или запросить его у менеджера."""
    builder = InlineKeyboardBuilder()
    builder.button(text="📩 Запросить код у менеджера", callback_data="exam_request_code")
    builder.button(text="⬅️ Главное меню", callback_data="menu:main")
    builder.adjust(1)
    return builder.as_markup()


def exam_request_positions_kb(positions) -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    for position in positions:
        builder.button(
            text=f"{position.emoji} {position.name}",
            callback_data=f"exam_request_position:{position.id}",
        )
    builder.button(text="⬅️ Главное меню", callback_data="menu:main")
    builder.adjust(1)
    return builder.as_markup()


def exam_request_managers_kb(position_id: int, managers) -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    for manager in managers:
        builder.button(
            text=manager.name or f"ID {manager.telegram_id}",
            callback_data=f"exam_request_manager:{position_id}:{manager.telegram_id}",
        )
    builder.button(text="⬅️ Главное меню", callback_data="menu:main")
    builder.adjust(1)
    return builder.as_markup()


def exam_request_decision_kb(request_id: int) -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    builder.button(text="✅ Выдать код", callback_data=f"exam_request_approve:{request_id}")
    builder.button(text="❌ Отклонить", callback_data=f"exam_request_decline:{request_id}")
    builder.adjust(2)
    return builder.as_markup()


# ---------- Вакансии ----------

def vacancies_menu_kb(channel_url: str, channel_configured: bool) -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    if channel_configured:
        builder.button(text="🔍 Поиск вакансии", url=channel_url)
    builder.button(text="📤 Опубликовать вакансию", callback_data="vacancy_publish_start")
    builder.button(text="⬅️ Главное меню", callback_data="menu:main")
    builder.adjust(1)
    return builder.as_markup()


def cancel_publish_kb() -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    builder.button(text="❌ Отмена", callback_data="menu:vacancies")
    builder.adjust(1)
    return builder.as_markup()


def admin_vacancies_log_kb(vacancies: list[Vacancy]) -> InlineKeyboardMarkup:
    """Для админ-панели: список опубликованных вакансий с удалением записи из лога."""
    builder = InlineKeyboardBuilder()
    for vacancy in vacancies:
        builder.button(
            text=f"🗑 {vacancy.title}",
            callback_data=f"admin_vacancy_delete:{vacancy.id}",
        )
    builder.button(text="⬅️ Админ-панель", callback_data="admin:menu")
    builder.adjust(1)
    return builder.as_markup()
