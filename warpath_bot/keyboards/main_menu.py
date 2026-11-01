from aiogram.types import InlineKeyboardMarkup
from aiogram.utils.keyboard import InlineKeyboardBuilder

from keyboards.callbacks import MenuCB
from locales import t


def main_menu_kb(lang: str = "ru") -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    kb.button(text=t("btn_games", lang), callback_data=MenuCB(action="games"))
    kb.button(text=t("btn_search", lang), callback_data=MenuCB(action="search"))
    kb.button(text=t("btn_kb", lang), callback_data=MenuCB(action="kb"))
    kb.button(text=t("btn_favorites", lang), callback_data=MenuCB(action="fav"))
    kb.button(text=t("btn_profile", lang), callback_data=MenuCB(action="profile"))
    kb.button(text=t("btn_help", lang), callback_data=MenuCB(action="help"))
    kb.adjust(2)
    return kb.as_markup()


def menu_only_kb(lang: str = "ru", back: MenuCB | None = None) -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    if back is not None:
        kb.button(text=t("btn_back", lang), callback_data=back)
    kb.button(text=t("btn_menu", lang), callback_data=MenuCB(action="main"))
    kb.adjust(2)
    return kb.as_markup()


def open_private_kb(bot_username: str | None, payload: str, lang: str = "ru") -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    if bot_username:
        kb.button(text=t("btn_open_private", lang), url=f"https://t.me/{bot_username}?start={payload}")
    kb.button(text=t("btn_menu", lang), callback_data=MenuCB(action="main"))
    kb.adjust(1)
    return kb.as_markup()
