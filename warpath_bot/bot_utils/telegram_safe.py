"""Обёртки над вызовами Telegram API, устойчивые к типичным ошибкам:
повторные нажатия («message is not modified»), слишком старые сообщения
и callback-запросы, отсутствие прав в группе, блокировка бота пользователем."""
from __future__ import annotations

import logging

from aiogram import Bot
from aiogram.exceptions import TelegramAPIError, TelegramBadRequest, TelegramForbiddenError
from aiogram.types import CallbackQuery, InlineKeyboardMarkup, Message

logger = logging.getLogger(__name__)

_EDIT_FALLBACK_ERRORS = (
    "message can't be edited",
    "message to edit not found",
    "there is no text in the message to edit",
    "message_id_invalid",
)


async def safe_send(bot: Bot, chat_id: int, text: str,
                    reply_markup: InlineKeyboardMarkup | None = None) -> Message | None:
    """Отправка сообщения. При отсутствии прав/блокировке возвращает None."""
    try:
        return await bot.send_message(chat_id, text, reply_markup=reply_markup,
                                      disable_web_page_preview=True)
    except TelegramForbiddenError:
        logger.info("Нет прав писать в чат %s (бот заблокирован или ограничен)", chat_id)
    except TelegramBadRequest as exc:
        logger.warning("Не удалось отправить сообщение в чат %s: %s", chat_id, exc.message)
    return None


async def safe_edit(message: Message | None, text: str, reply_markup: InlineKeyboardMarkup | None = None,
                    bot: Bot | None = None, chat_id: int | None = None) -> bool:
    """Редактирует сообщение; если нельзя — отправляет новое. True при успехе."""
    if isinstance(message, Message):
        try:
            await message.edit_text(text, reply_markup=reply_markup, disable_web_page_preview=True)
            return True
        except TelegramBadRequest as exc:
            msg = exc.message.lower()
            if "message is not modified" in msg:
                return True  # повторное нажатие той же кнопки — ничего не делаем
            if not any(e in msg for e in _EDIT_FALLBACK_ERRORS):
                raise
        except TelegramForbiddenError:
            logger.info("Нет прав редактировать сообщение в чате %s", message.chat.id)
            return False
        bot = bot or message.bot
        chat_id = chat_id or message.chat.id
    if bot is None or chat_id is None:
        return False
    return await safe_send(bot, chat_id, text, reply_markup) is not None


async def safe_answer(callback: CallbackQuery, text: str | None = None, show_alert: bool = False) -> None:
    """Ответ на callback. Устаревший запрос («query is too old») не считается ошибкой."""
    try:
        await callback.answer(text, show_alert=show_alert)
    except TelegramBadRequest as exc:
        logger.debug("callback.answer пропущен: %s", exc.message)
    except TelegramAPIError as exc:
        logger.warning("callback.answer не выполнен: %s", type(exc).__name__)


async def respond(event: Message | CallbackQuery, text: str,
                  reply_markup: InlineKeyboardMarkup | None = None) -> None:
    """Показать экран: для кнопки — отредактировать сообщение, для команды — ответить."""
    if isinstance(event, CallbackQuery):
        chat_id = event.message.chat.id if event.message else event.from_user.id
        await safe_edit(event.message if isinstance(event.message, Message) else None,
                        text, reply_markup, bot=event.bot, chat_id=chat_id)
        await safe_answer(event)
    else:
        await safe_send(event.bot, event.chat.id, text, reply_markup)
