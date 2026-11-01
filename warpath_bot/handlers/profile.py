"""Профиль и избранное. Личные данные показываются только в личном чате."""
from __future__ import annotations

from html import escape

from aiogram import F, Router
from aiogram.enums import ChatType
from aiogram.filters import Command
from aiogram.types import CallbackQuery, Message

from bot_utils.telegram_safe import respond
from keyboards.build_menu import favorites_kb
from keyboards.callbacks import MenuCB
from keyboards.main_menu import menu_only_kb, open_private_kb
from locales import t
from services.access_service import FEATURE_SEARCH, AccessService
from services.build_service import BuildService

router = Router(name="profile")


def _chat_type(event: Message | CallbackQuery) -> str:
    msg = event.message if isinstance(event, CallbackQuery) else event
    return msg.chat.type if msg else ChatType.PRIVATE


async def show_profile(event: Message | CallbackQuery, lang: str, build_service: BuildService,
                       access_service: AccessService, bot_username: str | None) -> None:
    if _chat_type(event) != ChatType.PRIVATE:
        return await respond(event, t("profile_private_only", lang),
                             open_private_kb(bot_username, "profile", lang))
    user = event.from_user
    plan = access_service.effective_plan(user.id)
    decision = access_service.check(FEATURE_SEARCH, user.id)
    remaining = t("unlimited", lang) if decision.remaining is None else str(decision.remaining)
    name = escape(user.full_name or "—")
    if user.username:
        name += f" (@{escape(user.username)})"
    text = t("profile", lang, id=user.id, name=name, plan=t(f"plan_{plan}", lang), remaining=remaining,
             favorites=len(build_service.favorites(user.id)))
    await respond(event, text, menu_only_kb(lang))


async def show_favorites(event: Message | CallbackQuery, lang: str, build_service: BuildService,
                         bot_username: str | None) -> None:
    if _chat_type(event) != ChatType.PRIVATE:
        return await respond(event, t("profile_private_only", lang),
                             open_private_kb(bot_username, "fav", lang))
    items = build_service.favorites(event.from_user.id)
    if not items:
        return await respond(event, t("fav_empty", lang), menu_only_kb(lang))
    await respond(event, t("fav_title", lang, count=len(items)), favorites_kb(items, lang))


@router.message(Command("profile"))
async def cmd_profile(message: Message, lang: str, build_service: BuildService,
                      access_service: AccessService, bot_username: str | None) -> None:
    await show_profile(message, lang, build_service, access_service, bot_username)


@router.callback_query(MenuCB.filter(F.action == "profile"))
async def cb_profile(callback: CallbackQuery, lang: str, build_service: BuildService,
                     access_service: AccessService, bot_username: str | None) -> None:
    await show_profile(callback, lang, build_service, access_service, bot_username)


@router.message(Command("favorites", "fav"))
async def cmd_favorites(message: Message, lang: str, build_service: BuildService,
                        bot_username: str | None) -> None:
    await show_favorites(message, lang, build_service, bot_username)


@router.callback_query(MenuCB.filter(F.action == "fav"))
async def cb_favorites(callback: CallbackQuery, lang: str, build_service: BuildService,
                       bot_username: str | None) -> None:
    await show_favorites(callback, lang, build_service, bot_username)
