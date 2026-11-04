"""Сборка приложения: база, сервисы, диспетчер. Отделено от bot.py для тестов."""
from __future__ import annotations

import sqlite3

from aiogram import Dispatcher

from bot_utils.middlewares import UserMiddleware
from config import Settings
from handlers import admin, builds, errors, profile, start
from services.access_service import AccessService
from services.admin_service import AdminService
from services.build_service import BuildService
from services.import_service import ImportService


def create_dispatcher(conn: sqlite3.Connection, settings: Settings) -> Dispatcher:
    dp = Dispatcher()
    dp["settings"] = settings
    dp["build_service"] = BuildService(conn, show_test_data=settings.show_test_data)
    dp["access_service"] = AccessService(conn, settings.admin_ids, settings.free_daily_search_limit)
    dp["import_service"] = ImportService(conn)
    dp["admin_service"] = AdminService(conn)
    dp["bot_username"] = None  # заполняется при запуске (get_me)

    user_mw = UserMiddleware(conn)
    dp.message.outer_middleware(user_mw)
    dp.callback_query.outer_middleware(user_mw)

    dp.include_routers(admin.guard_router, admin.router, start.router, builds.router,
                       profile.router, errors.router)  # errors — последним
    return dp
