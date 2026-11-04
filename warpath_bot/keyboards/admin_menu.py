from aiogram.types import InlineKeyboardMarkup
from aiogram.utils.keyboard import InlineKeyboardBuilder

from keyboards.callbacks import AdminCB, MenuCB


def admin_menu_kb() -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    kb.button(text="📊 Состояние БД", callback_data=AdminCB(action="health"))
    kb.button(text="📥 Импорт", callback_data=AdminCB(action="import_help"))
    kb.button(text="🧾 Ошибки импорта", callback_data=AdminCB(action="import_errors"))
    kb.button(text="📜 Журнал", callback_data=AdminCB(action="log"))
    kb.button(text="⌨️ Команды", callback_data=AdminCB(action="commands"))
    kb.button(text="🏠 В меню", callback_data=MenuCB(action="main"))
    kb.adjust(2)
    return kb.as_markup()


def import_confirm_kb(run_id: int, can_apply: bool, can_update: bool) -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    if can_apply:
        kb.button(text="✅ Применить", callback_data=AdminCB(action="apply", run=run_id))
    if can_update:
        kb.button(text="🔁 Применить с обновлением существующих",
                  callback_data=AdminCB(action="apply_upd", run=run_id))
    kb.button(text="❌ Отмена", callback_data=AdminCB(action="cancel", run=run_id))
    kb.adjust(1)
    return kb.as_markup()


def admin_back_kb() -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    kb.button(text="⬅️ Админ-меню", callback_data=AdminCB(action="menu"))
    return kb.as_markup()
