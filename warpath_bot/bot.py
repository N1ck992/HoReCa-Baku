"""Точка входа Warpath Assistant: python bot.py

Режим работы — long polling (без вебхуков). Остановка по SIGINT/SIGTERM
выполняется корректно: опрос завершается, health-сервер и база закрываются.
"""
from __future__ import annotations

import asyncio
import json
import logging
import sys

from aiogram import Bot
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.exceptions import TelegramNetworkError, TelegramUnauthorizedError
from aiogram.types import BotCommand, BotCommandScopeAllGroupChats, BotCommandScopeAllPrivateChats
from aiohttp import web

from app import create_dispatcher
from config import ConfigError, Settings, load_settings
from database.connection import open_database

logger = logging.getLogger("warpath_bot")

PRIVATE_COMMANDS = [
    BotCommand(command="start", description="Главное меню"),
    BotCommand(command="build", description="Подобрать билд"),
    BotCommand(command="favorites", description="Избранное"),
    BotCommand(command="profile", description="Мой профиль"),
    BotCommand(command="help", description="Помощь"),
]
GROUP_COMMANDS = [
    BotCommand(command="build", description="Подобрать билд"),
    BotCommand(command="menu", description="Меню бота"),
    BotCommand(command="help", description="Помощь"),
]


class _TokenFilter(logging.Filter):
    """Страховка: вырезает токен из любых сообщений лога."""

    def __init__(self, token: str):
        super().__init__()
        self.token = token

    def filter(self, record: logging.LogRecord) -> bool:
        if self.token:
            msg = record.getMessage()
            if self.token in msg:
                record.msg = msg.replace(self.token, "***")
                record.args = ()
        return True


def setup_logging(level: str, token: str = "") -> None:
    logging.basicConfig(level=level, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    for handler in logging.getLogger().handlers:
        handler.addFilter(_TokenFilter(token))
    logging.getLogger("aiogram.event").setLevel(logging.WARNING)


async def start_health_server(settings: Settings, conn, state: dict) -> web.AppRunner | None:
    if not settings.health_port:
        return None

    async def health(_: web.Request) -> web.Response:
        try:
            conn.execute("SELECT 1").fetchone()
            db_ok = True
        except Exception:
            db_ok = False
        ok = db_ok and state.get("polling", False)
        body = {"status": "ok" if ok else "degraded", "db": db_ok, "polling": state.get("polling", False)}
        return web.Response(text=json.dumps(body), content_type="application/json", status=200 if ok else 503)

    app = web.Application()
    app.router.add_get("/health", health)
    app.router.add_get("/", health)
    runner = web.AppRunner(app)
    await runner.setup()
    await web.TCPSite(runner, "0.0.0.0", settings.health_port).start()
    logger.info("Health-check: http://0.0.0.0:%s/health", settings.health_port)
    return runner


async def run(settings: Settings) -> int:
    conn = open_database(settings.database_path)
    logger.info("База данных: %s", settings.database_path)
    dp = create_dispatcher(conn, settings)
    bot = Bot(settings.bot_token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    state = {"polling": False}
    runner = None
    try:
        try:
            me = await bot.get_me()
        except TelegramUnauthorizedError:
            logger.error("Telegram отклонил токен. Проверьте BOT_TOKEN (или перевыпустите его в @BotFather).")
            return 3
        except TelegramNetworkError as exc:
            logger.error("Нет связи с Telegram API: %s", type(exc).__name__)
            return 4
        dp["bot_username"] = me.username
        logger.info("Бот @%s запущен (polling). Админов: %d. Тестовые данные: %s",
                    me.username, len(settings.admin_ids), "показываются" if settings.show_test_data else "скрыты")
        if not settings.admin_ids:
            logger.warning("ADMIN_IDS пуст — административные функции недоступны никому.")
        await bot.set_my_commands(PRIVATE_COMMANDS, scope=BotCommandScopeAllPrivateChats())
        await bot.set_my_commands(GROUP_COMMANDS, scope=BotCommandScopeAllGroupChats())
        await bot.delete_webhook(drop_pending_updates=False)
        runner = await start_health_server(settings, conn, state)
        state["polling"] = True
        await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())
        return 0
    finally:
        state["polling"] = False
        if runner is not None:
            await runner.cleanup()
        await bot.session.close()
        conn.close()
        logger.info("Бот остановлен, соединения закрыты.")


def main() -> int:
    try:
        settings = load_settings(require_token=True)
    except ConfigError as exc:
        setup_logging("INFO")
        logger.error("Ошибка конфигурации: %s", exc)
        return 2
    setup_logging(settings.log_level, settings.bot_token)
    try:
        return asyncio.run(run(settings))
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    sys.exit(main())
