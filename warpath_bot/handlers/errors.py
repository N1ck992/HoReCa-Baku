"""Глобальная обработка ошибок и устаревших кнопок. Подключается последним."""
from __future__ import annotations

import logging

from aiogram import Router
from aiogram.exceptions import TelegramAPIError
from aiogram.types import CallbackQuery, ErrorEvent

from bot_utils.telegram_safe import safe_answer, safe_send
from locales import t

logger = logging.getLogger(__name__)
router = Router(name="errors")


@router.callback_query()
async def stale_callback(callback: CallbackQuery) -> None:
    """Кнопка, которую не распознал ни один обработчик (старая версия бота и т.п.)."""
    await safe_answer(callback, t("stale_button"), show_alert=True)


@router.errors()
async def on_error(event: ErrorEvent) -> bool:
    # Пользователю — нейтральное сообщение без деталей; в лог — тип и трассировка.
    logger.error("Ошибка при обработке update %s: %s", event.update.update_id,
                 type(event.exception).__name__, exc_info=event.exception)
    update = event.update
    try:
        if update.callback_query:
            await safe_answer(update.callback_query, t("generic_error"), show_alert=True)
        elif update.message and update.message.bot:
            await safe_send(update.message.bot, update.message.chat.id, t("generic_error"))
    except TelegramAPIError:
        logger.warning("Не удалось сообщить пользователю об ошибке")
    return True
