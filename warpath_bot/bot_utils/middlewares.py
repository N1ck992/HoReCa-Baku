"""Middleware: регистрация пользователя по Telegram ID (без паролей и секретов)."""
from __future__ import annotations

import logging
import sqlite3
from typing import Any, Awaitable, Callable

from aiogram import BaseMiddleware
from aiogram.types import TelegramObject, User

from database.connection import transaction, utcnow_iso
from repositories.user_repository import UserRepository

logger = logging.getLogger(__name__)


class UserMiddleware(BaseMiddleware):
    def __init__(self, conn: sqlite3.Connection):
        self.users = UserRepository(conn)
        self.conn = conn

    async def __call__(self, handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
                       event: TelegramObject, data: dict[str, Any]) -> Any:
        user: User | None = data.get("event_from_user")
        lang = "ru"
        if user is not None and not user.is_bot:
            try:
                with transaction(self.conn):
                    self.users.upsert_user(user.id, user.username, user.first_name,
                                           user.language_code, utcnow_iso())
            except sqlite3.Error:
                logger.exception("Не удалось сохранить пользователя")
        # Пока доступен только русский; язык пользователя пригодится при добавлении переводов
        data["lang"] = lang
        return await handler(event, data)
