from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup
from aiogram.utils.keyboard import InlineKeyboardBuilder

from keyboards.callbacks import BuildCB, MenuCB, SearchCB
from locales import t
from models import Entity, Game
from views.build_view import list_item_label

PAGE_SIZE = 8


def _nav_row(lang: str, back) -> list[InlineKeyboardButton]:
    row = []
    if back is not None:
        row.append(InlineKeyboardButton(text=t("btn_back", lang), callback_data=back.pack()))
    row.append(InlineKeyboardButton(text=t("btn_menu", lang), callback_data=MenuCB(action="main").pack()))
    return row


def _pager(total: int, page: int, make_cb) -> list[InlineKeyboardButton]:
    pages = max(1, (total + PAGE_SIZE - 1) // PAGE_SIZE)
    if pages <= 1:
        return []
    row = []
    if page > 0:
        row.append(InlineKeyboardButton(text=t("btn_prev"), callback_data=make_cb(page - 1).pack()))
    row.append(InlineKeyboardButton(text=f"{page + 1}/{pages}", callback_data=make_cb(page).pack()))
    if page < pages - 1:
        row.append(InlineKeyboardButton(text=t("btn_next"), callback_data=make_cb(page + 1).pack()))
    return row


def clamp_page(total: int, page: int) -> int:
    pages = max(1, (total + PAGE_SIZE - 1) // PAGE_SIZE)
    return min(max(page, 0), pages - 1)


def games_kb(games: list[Game], lang: str = "ru") -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    for g in games:
        kb.row(InlineKeyboardButton(text=f"🎮 {g.name}", callback_data=SearchCB(step="uc", g=g.id).pack()))
    kb.row(*_nav_row(lang, None))
    return kb.as_markup()


def entity_list_kb(items: list[Entity], page: int, make_item_cb, make_page_cb, back,
                   lang: str = "ru", extra: list[InlineKeyboardButton] | None = None) -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    page = clamp_page(len(items), page)
    for e in items[page * PAGE_SIZE:(page + 1) * PAGE_SIZE]:
        label = f"🧪 {e.name}" if e.is_test else e.name
        kb.row(InlineKeyboardButton(text=label[:60], callback_data=make_item_cb(e).pack()))
    for button in extra or []:
        kb.row(button)
    pager = _pager(len(items), page, make_page_cb)
    if pager:
        kb.row(*pager)
    kb.row(*_nav_row(lang, back))
    return kb.as_markup()


def results_kb(results: list[dict], cb: SearchCB, lang: str = "ru") -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    page = clamp_page(len(results), cb.pg)
    for item in results[page * PAGE_SIZE:(page + 1) * PAGE_SIZE]:
        kb.row(InlineKeyboardButton(
            text=list_item_label(item),
            callback_data=BuildCB(action="v", id=item["id"], origin="s",
                                  g=cb.g, u=cb.u, p=cb.p, c=cb.c).pack()))
    pager = _pager(len(results), page,
                   lambda pg: SearchCB(step="rb", g=cb.g, u=cb.u, p=cb.p, c=cb.c, pg=pg))
    if pager:
        kb.row(*pager)
    kb.row(InlineKeyboardButton(text=t("btn_change_criteria", lang),
                                callback_data=SearchCB(step="uc", g=cb.g).pack()))
    kb.row(*_nav_row(lang, None))
    return kb.as_markup()


def no_results_kb(g: int, lang: str = "ru") -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    kb.row(InlineKeyboardButton(text=t("btn_change_criteria", lang),
                                callback_data=SearchCB(step="uc", g=g).pack()))
    kb.row(*_nav_row(lang, None))
    return kb.as_markup()


def build_card_kb(cb: BuildCB, is_favorite: bool, lang: str = "ru") -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    parts = [("main", "btn_part_main"), ("tac", "btn_part_tactics"),
             ("pro", "btn_part_pros"), ("src", "btn_part_sources")]
    buttons = []
    for part, key in parts:
        text = t(key, lang)
        if part == cb.part:
            text = f"• {text}"
        buttons.append(InlineKeyboardButton(
            text=text, callback_data=BuildCB(action="v", id=cb.id, part=part, origin=cb.origin,
                                             g=cb.g, u=cb.u, p=cb.p, c=cb.c).pack()))
    kb.row(*buttons[:2])
    kb.row(*buttons[2:])
    kb.row(InlineKeyboardButton(
        text=t("btn_fav_remove" if is_favorite else "btn_fav_add", lang),
        callback_data=BuildCB(action="f", id=cb.id, part=cb.part, origin=cb.origin,
                              g=cb.g, u=cb.u, p=cb.p, c=cb.c).pack()))
    nav = []
    if cb.origin == "s":
        nav.append(InlineKeyboardButton(text=t("btn_to_results", lang), callback_data=SearchCB(
            step="rb", g=cb.g, u=cb.u, p=cb.p, c=cb.c).pack()))
    elif cb.origin == "f":
        nav.append(InlineKeyboardButton(text=t("btn_to_favorites", lang),
                                        callback_data=MenuCB(action="fav").pack()))
    nav.append(InlineKeyboardButton(text=t("btn_menu", lang), callback_data=MenuCB(action="main").pack()))
    kb.row(*nav)
    return kb.as_markup()


def favorites_kb(items: list[dict], lang: str = "ru") -> InlineKeyboardMarkup:
    kb = InlineKeyboardBuilder()
    for item in items[:30]:
        kb.row(InlineKeyboardButton(text=list_item_label(item),
                                    callback_data=BuildCB(action="v", id=item["id"], origin="f").pack()))
    kb.row(*_nav_row(lang, None))
    return kb.as_markup()
