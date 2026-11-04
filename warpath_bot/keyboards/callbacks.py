"""Callback-данные кнопок. Состояние поиска хранится в самой кнопке,
поэтому старые кнопки остаются рабочими после перезапуска бота
(а недействительные — корректно обрабатываются). Лимит Telegram — 64 байта."""
from aiogram.filters.callback_data import CallbackData


class MenuCB(CallbackData, prefix="m"):
    action: str  # main, games, search, kb, kbs, fav, profile, help


class SearchCB(CallbackData, prefix="s"):
    step: str     # uc — тип войск, p — задача, c — командир, r — результаты
    g: int
    u: int = 0
    p: int = 0
    c: int = 0
    pg: int = 0


class BuildCB(CallbackData, prefix="b"):
    action: str   # v — показать, f — избранное
    id: int
    part: str = "main"
    origin: str = "n"  # s — из поиска, f — из избранного, n — напрямую
    g: int = 0
    u: int = 0
    p: int = 0
    c: int = 0


class AdminCB(CallbackData, prefix="a"):
    action: str   # health, import_help, import_errors, log, apply, apply_upd, cancel
    run: int = 0
