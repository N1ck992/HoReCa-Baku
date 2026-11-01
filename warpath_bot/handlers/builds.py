"""Пошаговый подбор билда и карточка билда.

Шаги: игра → тип войск → задача → командир (если есть в данных) → результаты.
Все варианты строятся только из реально существующих в базе билдов.
"""
from __future__ import annotations

from html import escape

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, InlineKeyboardButton, Message

from bot_utils.telegram_safe import respond, safe_answer, safe_edit
from keyboards.build_menu import (
    build_card_kb,
    entity_list_kb,
    games_kb,
    no_results_kb,
    results_kb,
)
from keyboards.callbacks import BuildCB, MenuCB, SearchCB
from keyboards.main_menu import menu_only_kb
from locales import t
from models import COMMANDER, PURPOSE, UNIT_CLASS
from services.access_service import FEATURE_FAVORITE_ADD, FEATURE_SEARCH, AccessService
from services.build_service import BuildService
from views.build_view import PARTS, render_build

router = Router(name="builds")


async def start_search(event: Message | CallbackQuery, lang: str, build_service: BuildService) -> None:
    games = build_service.games()
    if len(games) == 1:
        await show_unit_classes(event, SearchCB(step="uc", g=games[0].id), lang, build_service)
    else:
        await respond(event, t("choose_game", lang), games_kb(games, lang))


@router.message(Command("build", "find"))
async def cmd_build(message: Message, lang: str, build_service: BuildService) -> None:
    await start_search(message, lang, build_service)


@router.callback_query(MenuCB.filter(F.action == "search"))
async def cb_search(callback: CallbackQuery, lang: str, build_service: BuildService) -> None:
    await start_search(callback, lang, build_service)


def _valid_entity(build_service: BuildService, entity_id: int, game_id: int, etype: str):
    e = build_service.entity(entity_id) if entity_id else None
    return e if e and e.game_id == game_id and e.entity_type == etype else None


async def _stale(callback: CallbackQuery | Message, lang: str) -> None:
    if isinstance(callback, CallbackQuery):
        await safe_answer(callback, t("stale_button", lang), show_alert=True)
    else:
        await respond(callback, t("stale_button", lang))


async def show_unit_classes(event, cb: SearchCB, lang: str, build_service: BuildService) -> None:
    game = build_service.game(cb.g)
    if game is None:
        return await _stale(event, lang)
    items = build_service.unit_classes(game.id)
    if not items:
        return await respond(event, t("no_data_yet", lang, game=escape(game.name)), menu_only_kb(lang))
    kb = entity_list_kb(
        items, cb.pg,
        make_item_cb=lambda e: SearchCB(step="p", g=game.id, u=e.id),
        make_page_cb=lambda pg: SearchCB(step="uc", g=game.id, pg=pg),
        back=MenuCB(action="main"), lang=lang)
    await respond(event, t("step_unit_class", lang, game=escape(game.name)), kb)


@router.callback_query(SearchCB.filter())
async def cb_search_step(callback: CallbackQuery, callback_data: SearchCB, lang: str,
                         build_service: BuildService, access_service: AccessService) -> None:
    cb = callback_data
    if cb.step == "uc":
        return await show_unit_classes(callback, cb, lang, build_service)

    game = build_service.game(cb.g)
    unit_class = _valid_entity(build_service, cb.u, cb.g, UNIT_CLASS) if game else None
    if unit_class is None:
        return await _stale(callback, lang)

    if cb.step == "p":
        items = build_service.purposes(game.id, unit_class.id)
        if not items:
            return await respond(callback, t("no_results", lang), no_results_kb(game.id, lang))
        kb = entity_list_kb(
            items, cb.pg,
            make_item_cb=lambda e: SearchCB(step="c", g=game.id, u=unit_class.id, p=e.id),
            make_page_cb=lambda pg: SearchCB(step="p", g=game.id, u=unit_class.id, pg=pg),
            back=SearchCB(step="uc", g=game.id), lang=lang)
        return await respond(callback, t("step_purpose", lang, game=escape(game.name),
                                         unit_class=escape(unit_class.name)), kb)

    purpose = _valid_entity(build_service, cb.p, cb.g, PURPOSE)
    if purpose is None:
        return await _stale(callback, lang)

    if cb.step == "c":
        commanders = build_service.commanders(game.id, unit_class.id, purpose.id)
        if commanders:
            any_btn = InlineKeyboardButton(
                text=t("btn_any_commander", lang),
                callback_data=SearchCB(step="r", g=game.id, u=unit_class.id, p=purpose.id).pack())
            kb = entity_list_kb(
                commanders, cb.pg,
                make_item_cb=lambda e: SearchCB(step="r", g=game.id, u=unit_class.id, p=purpose.id, c=e.id),
                make_page_cb=lambda pg: SearchCB(step="c", g=game.id, u=unit_class.id, p=purpose.id, pg=pg),
                back=SearchCB(step="p", g=game.id, u=unit_class.id), lang=lang, extra=[any_btn])
            return await respond(callback, t("step_commander", lang, unit_class=escape(unit_class.name),
                                             purpose=escape(purpose.name)), kb)
        # Командиров в данных нет — шаг пропускается
        cb = SearchCB(step="r", g=game.id, u=unit_class.id, p=purpose.id)

    if cb.step not in ("r", "rb"):
        return await _stale(callback, lang)

    commander = None
    if cb.c:
        commander = _valid_entity(build_service, cb.c, cb.g, COMMANDER)
        if commander is None:
            return await _stale(callback, lang)

    # Лимит считается только при новом поиске (не при листании и возврате к результатам)
    if cb.step == "r" and cb.pg == 0:
        decision = access_service.check(FEATURE_SEARCH, callback.from_user.id,
                                        callback.message.chat.id if callback.message else None)
        if not decision.allowed:
            return await safe_answer(callback, t(decision.reason, lang), show_alert=True)
        access_service.register_use(FEATURE_SEARCH, callback.from_user.id)

    results = build_service.search(game.id, unit_class.id, purpose.id, commander.id if commander else None)
    if not results:
        return await respond(callback, t("no_results", lang), no_results_kb(game.id, lang))
    commander_line = t("results_commander", lang, name=escape(commander.name)) if commander else ""
    text = t("results_title", lang, count=len(results), unit_class=escape(unit_class.name),
             purpose=escape(purpose.name), commander=commander_line)
    await respond(callback, text, results_kb(results, cb, lang))


@router.callback_query(BuildCB.filter(F.action == "v"))
async def cb_build_view(callback: CallbackQuery, callback_data: BuildCB, lang: str,
                        build_service: BuildService, access_service: AccessService) -> None:
    build = build_service.get_build(callback_data.id, for_admin=access_service.is_admin(callback.from_user.id))
    if build is None:
        return await safe_answer(callback, t("build_not_found", lang), show_alert=True)
    part = callback_data.part if callback_data.part in PARTS else "main"
    cb = callback_data.model_copy(update={"part": part})
    is_fav = build_service.is_favorite(callback.from_user.id, build.id)
    await respond(callback, render_build(build, part, lang), build_card_kb(cb, is_fav, lang))


@router.callback_query(BuildCB.filter(F.action == "f"))
async def cb_build_favorite(callback: CallbackQuery, callback_data: BuildCB, lang: str,
                            build_service: BuildService, access_service: AccessService) -> None:
    user_id = callback.from_user.id
    build = build_service.get_build(callback_data.id, for_admin=access_service.is_admin(user_id))
    if build is None:
        return await safe_answer(callback, t("build_not_found", lang), show_alert=True)
    if not build_service.is_favorite(user_id, build.id):
        decision = access_service.check(FEATURE_FAVORITE_ADD, user_id)
        if not decision.allowed:
            return await safe_answer(callback, t(decision.reason, lang), show_alert=True)
    now_fav = build_service.toggle_favorite(user_id, build.id)
    # В группе у разных людей своё избранное: кнопку не перерисовываем,
    # чтобы не вводить в заблуждение других участников — только уведомление.
    if callback.message and callback.message.chat.type == "private":
        cb = callback_data.model_copy(update={"action": "v"})
        part = cb.part if cb.part in PARTS else "main"
        await safe_edit(callback.message, render_build(build, part, lang),
                        build_card_kb(cb, now_fav, lang))
    await safe_answer(callback, t("fav_added" if now_fav else "fav_removed", lang))
