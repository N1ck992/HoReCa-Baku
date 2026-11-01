"""Главное меню, помощь, база знаний, выбор игры."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.enums import ChatType
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.types import CallbackQuery, Message

from bot_utils.telegram_safe import respond
from keyboards.build_menu import games_kb
from keyboards.callbacks import MenuCB
from keyboards.main_menu import main_menu_kb, menu_only_kb
from locales import t
from services.build_service import BuildService

router = Router(name="start")


@router.message(CommandStart())
async def cmd_start(message: Message, command: CommandObject, lang: str,
                    build_service: BuildService, access_service, bot_username: str | None) -> None:
    # Deep-link из группы: /start profile, /start fav, /start build
    payload = (command.args or "").strip()
    if message.chat.type == ChatType.PRIVATE and payload:
        from handlers import builds, profile  # локальный импорт: избегаем циклов
        if payload == "profile":
            return await profile.show_profile(message, lang, build_service, access_service, bot_username)
        if payload == "fav":
            return await profile.show_favorites(message, lang, build_service, bot_username)
        if payload == "build":
            return await builds.start_search(message, lang, build_service)
    is_private = message.chat.type == ChatType.PRIVATE
    await respond(message, t("welcome" if is_private else "welcome_group", lang), main_menu_kb(lang))


@router.message(Command("menu"))
async def cmd_menu(message: Message, lang: str) -> None:
    await respond(message, t("main_menu", lang), main_menu_kb(lang))


@router.message(Command("help"))
async def cmd_help(message: Message, lang: str) -> None:
    await respond(message, t("help", lang), menu_only_kb(lang))


@router.callback_query(MenuCB.filter(F.action == "main"))
async def cb_main(callback: CallbackQuery, lang: str) -> None:
    await respond(callback, t("main_menu", lang), main_menu_kb(lang))


@router.callback_query(MenuCB.filter(F.action == "help"))
async def cb_help(callback: CallbackQuery, lang: str) -> None:
    await respond(callback, t("help", lang), menu_only_kb(lang))


@router.callback_query(MenuCB.filter(F.action == "games"))
async def cb_games(callback: CallbackQuery, lang: str, build_service: BuildService) -> None:
    await respond(callback, t("choose_game", lang), games_kb(build_service.games(), lang))


@router.callback_query(MenuCB.filter(F.action == "kb"))
async def cb_knowledge(callback: CallbackQuery, lang: str, build_service: BuildService) -> None:
    from aiogram.utils.keyboard import InlineKeyboardBuilder

    games = build_service.games()
    parts = []
    for game in games:
        s = build_service.knowledge_summary(game.id)
        parts.append(t("kb_overview", lang, game=game.name, **s))
    kb = InlineKeyboardBuilder()
    kb.button(text=t("btn_kb_statuses", lang), callback_data=MenuCB(action="kbs"))
    kb.button(text=t("btn_menu", lang), callback_data=MenuCB(action="main"))
    kb.adjust(1)
    await respond(callback, "\n\n".join(parts) or t("no_results", lang), kb.as_markup())


@router.callback_query(MenuCB.filter(F.action == "kbs"))
async def cb_statuses(callback: CallbackQuery, lang: str) -> None:
    await respond(callback, t("kb_statuses", lang), menu_only_kb(lang, back=MenuCB(action="kb")))
