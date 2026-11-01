"""Имитация Telegram Bot API для сквозных тестов: запросы не уходят в сеть,
а записываются; можно задать ошибку для конкретного метода."""
from __future__ import annotations

import itertools
from datetime import datetime, timezone

from aiogram import Bot
from aiogram.client.session.base import BaseSession
from aiogram.methods import (
    EditMessageText,
    GetMe,
    SendMessage,
    TelegramMethod,
)
from aiogram.types import CallbackQuery, Chat, Message, Update, User

_ids = itertools.count(1000)


class FakeSession(BaseSession):
    def __init__(self):
        super().__init__()
        self.requests: list[TelegramMethod] = []
        self.errors: dict[type, Exception] = {}

    async def close(self):
        pass

    async def stream_content(self, *args, **kwargs):  # pragma: no cover
        raise NotImplementedError
        yield b""

    async def make_request(self, bot, method, timeout=None):
        self.requests.append(method)
        if type(method) in self.errors:
            raise self.errors[type(method)]
        if isinstance(method, GetMe):
            return User(id=42, is_bot=True, first_name="Bot", username="test_bot")
        if isinstance(method, (SendMessage, EditMessageText)):
            chat_id = method.chat_id or 0
            return Message(message_id=next(_ids), date=datetime.now(timezone.utc),
                           chat=Chat(id=chat_id, type="private" if chat_id > 0 else "group"),
                           text=method.text)
        return True

    def of(self, method_type) -> list:
        return [r for r in self.requests if isinstance(r, method_type)]


def make_bot() -> tuple[Bot, FakeSession]:
    session = FakeSession()
    return Bot("42:TESTTOKENTESTTOKENTESTTOKENTESTTOKEN", session=session), session


def user(uid: int) -> User:
    return User(id=uid, is_bot=False, first_name=f"U{uid}", username=f"u{uid}")


def chat(cid: int) -> Chat:
    return Chat(id=cid, type="private" if cid > 0 else "supergroup", title=None if cid > 0 else "G")


def message_update(uid: int, text: str, chat_id: int | None = None) -> Update:
    cid = uid if chat_id is None else chat_id
    return Update(update_id=next(_ids), message=Message(
        message_id=next(_ids), date=datetime.now(timezone.utc), chat=chat(cid), from_user=user(uid), text=text))


def callback_update(uid: int, data: str, chat_id: int | None = None) -> Update:
    cid = uid if chat_id is None else chat_id
    msg = Message(message_id=next(_ids), date=datetime.now(timezone.utc), chat=chat(cid),
                  from_user=User(id=42, is_bot=True, first_name="Bot"), text="старый экран")
    return Update(update_id=next(_ids), callback_query=CallbackQuery(
        id=str(next(_ids)), from_user=user(uid), chat_instance="ci", data=data, message=msg))


def fresh_dispatcher(conn, settings):
    """В рабочем коде диспетчер создаётся один раз; в тестах — для каждого теста,
    поэтому отвязываем модульные роутеры от предыдущего диспетчера."""
    from app import create_dispatcher
    from handlers import admin, builds, errors, profile, start

    for r in (admin.guard_router, admin.router, start.router, builds.router, profile.router, errors.router):
        r._parent_router = None
    return create_dispatcher(conn, settings)
