from aiogram.types import InlineKeyboardMarkup, KeyboardButton, ReplyKeyboardMarkup
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


def main_menu_kb(show_exam_button: bool = False) -> InlineKeyboardMarkup:
    """show_exam_button=True только для сотрудников, прикреплённых к
    заведению (т.е. отправивших /start в группе этого заведения) —
    у остальных пользователей кнопки экзамена быть не должно."""
    builder = InlineKeyboardBuilder()
    builder.button(text="👔 Выбрать должность", callback_data="menu:positions")
    builder.button(text="🏢 Рейтинг заведений", callback_data="menu:leaderboard")
    builder.button(text="➕ Добавить заведение", callback_data="menu:add_restaurant")
    builder.button(text="👤 Мой профиль", callback_data="menu:profile")
    builder.button(text="💼 Вакансии", callback_data="menu:vacancies")
    builder.button(text="❓ Помощь", callback_data="menu:help")
    if show_exam_button:
        builder.button(text="🎓 Сдать экзамен", callback_data="menu:exam")
    builder.adjust(1)
    return builder.as_markup()


def profile_kb() -> InlineKeyboardMarkup:
    """Клавиатура экрана профиля: тесты, рейтинг, назад."""
    builder = InlineKeyboardBuilder()
    builder.button(text="📝 Мои тесты", callback_data="menu:my_tests")
    builder.button(text="🏢 Рейтинг заведений", callback_data="menu:leaderboard")
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
