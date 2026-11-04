"""Сквозные тесты обработчиков и обработки ошибок Telegram API."""
from __future__ import annotations

import asyncio
from pathlib import Path

import pytest
from aiogram.exceptions import TelegramBadRequest, TelegramForbiddenError
from aiogram.methods import AnswerCallbackQuery, EditMessageText, SendMessage
from conftest import build_id, entity_id, game_id
from fake_telegram import callback_update, fresh_dispatcher, make_bot, message_update


from bot_utils.telegram_safe import safe_answer, safe_edit, safe_send
from config import Settings
from keyboards.callbacks import BuildCB, SearchCB
from services.build_service import BuildService

ADMIN, USER, OTHER, GROUP = 100, 200, 300, -1001


def settings(**kw) -> Settings:
    base = dict(bot_token="42:TEST", admin_ids=frozenset({ADMIN}), database_path=Path(":memory:"),
                show_test_data=False, free_daily_search_limit=50)
    base.update(kw)
    return Settings(**base)


@pytest.fixture
def env(loaded_conn):
    bot, session = make_bot()
    dp = fresh_dispatcher(loaded_conn, settings())
    dp["bot_username"] = "test_bot"

    def feed(update):
        asyncio.run(dp.feed_update(bot, update))
        return session

    return feed, session, dp, loaded_conn


def all_texts(session) -> str:
    return "\n".join(r.text for r in session.requests if isinstance(r, (SendMessage, EditMessageText)))


def buttons(method) -> list[str]:
    return [b.text for row in method.reply_markup.inline_keyboard for b in row]


def test_start_shows_main_menu(env):
    feed, session, *_ = env
    feed(message_update(USER, "/start"))
    sent = session.of(SendMessage)[-1]
    assert "Warpath Assistant" in sent.text
    assert buttons(sent) == ["🎮 Выбрать игру", "🔍 Найти билд", "📚 База знаний",
                             "⭐ Избранное", "👤 Мой профиль", "❓ Помощь"]


def test_full_search_flow(env):
    feed, session, dp, conn = env
    g = game_id(conn)
    feed(callback_update(USER, "m:search"))
    edit = session.of(EditMessageText)[-1]
    assert "Шаг 1/3" in edit.text and set(buttons(edit)) >= {"Класс 1", "Класс 2"}
    assert "Тест-класс" not in " ".join(buttons(edit))  # тестовые данные скрыты

    uc, p = entity_id(conn, "unit_class", "class-1"), entity_id(conn, "purpose", "purpose-1")
    feed(callback_update(USER, SearchCB(step="p", g=g, u=uc).pack()))
    assert "Шаг 2/3" in session.of(EditMessageText)[-1].text
    feed(callback_update(USER, SearchCB(step="c", g=g, u=uc, p=p).pack()))
    edit = session.of(EditMessageText)[-1]
    assert "Шаг 3/3" in edit.text and "Любые командиры" in buttons(edit)
    feed(callback_update(USER, SearchCB(step="r", g=g, u=uc, p=p).pack()))
    edit = session.of(EditMessageText)[-1]
    assert "Найдено билдов: 2" in edit.text
    labels = buttons(edit)
    assert labels[0].startswith("✅") and labels[1].startswith("⚠️")

    bid = build_id(conn, "review-1")
    feed(callback_update(USER, BuildCB(action="v", id=bid, origin="s", g=g, u=uc, p=p).pack()))
    edit = session.of(EditMessageText)[-1]
    assert "Не проверено" in edit.text
    assert "⬅️ К результатам" in buttons(edit) and "🏠 В меню" in buttons(edit)


def test_no_results_message(env):
    feed, session, dp, conn = env
    g = game_id(conn)
    uc, p = entity_id(conn, "unit_class", "class-2"), entity_id(conn, "purpose", "purpose-2")
    feed(callback_update(USER, SearchCB(step="r", g=g, u=uc, p=p).pack()))
    edit = session.of(EditMessageText)[-1]
    assert "Подходящих билдов нет" in edit.text
    assert "🔁 Изменить критерии" in buttons(edit)


def test_empty_database_message(conn):
    bot, session = make_bot()
    dp = fresh_dispatcher(conn, settings())
    asyncio.run(dp.feed_update(bot, message_update(USER, "/build")))
    assert "пока нет проверяемых билдов" in session.of(SendMessage)[-1].text


def test_favorites_via_buttons(env):
    feed, session, dp, conn = env
    bid = build_id(conn, "verified-1")
    feed(callback_update(USER, BuildCB(action="f", id=bid).pack()))
    assert session.of(AnswerCallbackQuery)[-1].text == "⭐ Добавлено в избранное"
    service: BuildService = dp["build_service"]
    assert [f["id"] for f in service.favorites(USER)] == [bid]
    assert service.favorites(OTHER) == []
    feed(callback_update(USER, BuildCB(action="f", id=bid).pack()))
    assert service.favorites(USER) == []


def test_admin_commands_denied_for_regular_user(env):
    feed, session, *_ = env
    for cmd in ("/admin", "/status 1 verified ok", "/grant user 1 premium", "/health"):
        feed(message_update(USER, cmd))
        assert "только администраторам" in session.of(SendMessage)[-1].text
    feed(callback_update(USER, "a:health:0"))
    assert "только администраторам" in session.of(AnswerCallbackQuery)[-1].text


def test_admin_command_works_for_admin(env):
    feed, session, *_ = env
    feed(message_update(ADMIN, "/health"))
    assert "Состояние базы" in session.of(SendMessage)[-1].text
    feed(message_update(ADMIN, "/health", chat_id=GROUP))
    assert "только в личном чате" in session.of(SendMessage)[-1].text


def test_group_behaviour(env):
    feed, session, *_ = env
    feed(message_update(USER, "/build", chat_id=GROUP))
    assert "Шаг 1/3" in session.of(SendMessage)[-1].text
    feed(message_update(USER, "/profile", chat_id=GROUP))
    sent = session.of(SendMessage)[-1]
    assert "в личном чате" in sent.text
    assert sent.reply_markup.inline_keyboard[0][0].url == "https://t.me/test_bot?start=profile"
    before = len(session.requests)
    feed(message_update(USER, "обычное сообщение в группе", chat_id=GROUP))
    assert len(session.requests) == before  # бот не реагирует на обычные сообщения


def test_stale_and_invalid_callbacks(env):
    feed, session, dp, conn = env
    feed(callback_update(USER, "zz:old-format"))
    assert "устарела" in session.of(AnswerCallbackQuery)[-1].text
    feed(callback_update(USER, BuildCB(action="v", id=999999).pack()))
    assert "недоступен" in session.of(AnswerCallbackQuery)[-1].text
    feed(callback_update(USER, SearchCB(step="p", g=game_id(conn), u=999999).pack()))
    assert "устарела" in session.of(AnswerCallbackQuery)[-1].text
    # Тестовый билд при выключенном SHOW_TEST_DATA недоступен даже по прямой кнопке
    feed(callback_update(USER, BuildCB(action="v", id=build_id(conn, "test-build")).pack()))
    assert "недоступен" in session.of(AnswerCallbackQuery)[-1].text


def test_repeated_press_not_modified(env):
    feed, session, *_ = env
    session.errors[EditMessageText] = TelegramBadRequest(
        method=EditMessageText(text="x"), message="Bad Request: message is not modified")
    feed(callback_update(USER, "m:main"))
    assert not session.of(SendMessage)  # повтор не создаёт новое сообщение
    assert session.of(AnswerCallbackQuery)


def test_old_message_falls_back_to_new(env):
    feed, session, *_ = env
    session.errors[EditMessageText] = TelegramBadRequest(
        method=EditMessageText(text="x"), message="Bad Request: message can't be edited")
    feed(callback_update(USER, "m:help"))
    assert "Помощь" in session.of(SendMessage)[-1].text


def test_handler_exception_reported_without_details(env, monkeypatch):
    feed, session, dp, conn = env

    def boom(*a, **k):
        raise RuntimeError("secret internal detail")

    monkeypatch.setattr(dp["build_service"], "get_build", boom)
    feed(callback_update(USER, BuildCB(action="v", id=1).pack()))
    answer = session.of(AnswerCallbackQuery)[-1]
    assert "Что-то пошло не так" in answer.text
    assert "secret" not in all_texts(session) + (answer.text or "")


def test_safe_send_forbidden_and_answer_too_old():
    bot, session = make_bot()
    session.errors[SendMessage] = TelegramForbiddenError(
        method=SendMessage(chat_id=1, text="x"), message="Forbidden: bot was blocked by the user")
    assert asyncio.run(safe_send(bot, 1, "привет")) is None

    session.errors[AnswerCallbackQuery] = TelegramBadRequest(
        method=AnswerCallbackQuery(callback_query_id="1"), message="Bad Request: query is too old")
    cb = callback_update(USER, "m:main").callback_query.as_(bot)
    asyncio.run(safe_answer(cb, "x"))  # не выбрасывает исключение


def test_safe_edit_reraises_unexpected_errors():
    bot, session = make_bot()
    session.errors[EditMessageText] = TelegramBadRequest(
        method=EditMessageText(text="x"), message="Bad Request: can't parse entities")
    msg = callback_update(USER, "m:main").callback_query.message.as_(bot)
    with pytest.raises(TelegramBadRequest):
        asyncio.run(safe_edit(msg, "<b>"))


def test_admin_import_via_document_flow(env, monkeypatch, fixture_data):
    """Импорт документом: предпроверка → кнопка «Применить» → запись."""
    import io
    import json

    from aiogram import Bot
    from aiogram.types import Document

    feed, session, dp, conn = env
    data = {"game": "warpath", "entities": [{"type": "purpose", "code": "doc-purpose", "name": "Из документа"}]}
    payload = json.dumps(data, ensure_ascii=False).encode()

    async def fake_download(self, file, destination=None, **kw):
        return io.BytesIO(payload)

    monkeypatch.setattr(Bot, "download", fake_download)
    upd = message_update(ADMIN, "")
    msg = upd.message.model_copy(update={"text": None, "document": Document(
        file_id="f", file_unique_id="u", file_name="data.json", file_size=len(payload))})
    upd = upd.model_copy(update={"message": msg})
    feed(upd)
    sent = session.of(SendMessage)[-1]
    assert "Предпроверка импорта" in sent.text and "✅ Применить" in buttons(sent)
    assert conn.execute("SELECT COUNT(*) FROM entities WHERE code = 'doc-purpose'").fetchone()[0] == 0
    apply_data = sent.reply_markup.inline_keyboard[0][0].callback_data
    feed(callback_update(ADMIN, apply_data))
    assert "применён" in session.of(EditMessageText)[-1].text
    assert conn.execute("SELECT COUNT(*) FROM entities WHERE code = 'doc-purpose'").fetchone()[0] == 1

    # Обычный пользователь не может загрузить файл
    upd2 = upd.model_copy(update={"message": msg.model_copy(update={"from_user": msg.from_user.model_copy(
        update={"id": USER}), "chat": msg.chat.model_copy(update={"id": USER})})})
    feed(upd2)
    assert "только администраторам" in session.of(SendMessage)[-1].text
