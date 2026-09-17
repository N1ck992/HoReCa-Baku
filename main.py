import asyncio
import logging
import os

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiohttp import web

from config import BOT_TOKEN
from data.seed import (
    seed_data,
    seed_foundation_position,
    seed_missing_restaurant_positions,
    seed_restaurant_positions,
    sync_new_questions,
    sync_question_options,
)
from database.database import async_session, init_db
from handlers import (
    admin,
    exams,
    manager,
    profile,
    rating,
    restaurant_requests,
    restaurants,
    start,
    vacancies,
)
from handlers import help as help_handlers
from webapp_api import routes as webapp_routes

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def start_web_server() -> None:
    """Веб-сервер на том же процессе, что и бот — без него бесплатный
    Web Service на Render считает приложение "неживым" и останавливает
    (см. пояснение ниже про порт). Заодно тут же обслуживаются настоящие
    API-запросы от сайта (Mini App) — см. webapp_api.py."""

    async def health(request: web.Request) -> web.Response:
        return web.Response(text="Бот работает")

    async def serve_webapp(request: web.Request) -> web.Response:
        """Отдаёт саму HTML-страницу Mini App напрямую с Render — раньше
        для этого использовался отдельный хостинг (Netlify), теперь всё
        (и страница, и API) на одном домене, без лишней зависимости.

        Cache-Control: no-cache обязателен — Telegram WebView (и браузеры)
        иначе агрессивно кэшируют эту страницу на устройстве, и после
        любого обновления кода пользователь может ещё долго видеть старую
        версию сайта, хотя на сервере уже задеплоен фикс (источник
        нескольких запутанных "багов", которые на деле были просто
        устаревшим кэшем на телефоне)."""
        response = web.FileResponse(
            path=os.path.join(os.path.dirname(__file__), "webapp", "index.html")
        )
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        return response

    app = web.Application()
    app.router.add_get("/", health)
    app.router.add_get("/webapp", serve_webapp)
    app.add_routes(webapp_routes)

    runner = web.AppRunner(app)
    await runner.setup()
    port = int(os.getenv("PORT", "10000"))
    site = web.TCPSite(runner, "0.0.0.0", port)
    await site.start()
    logger.info(f"Веб-сервер (сайт + служебная проверка) запущен на порту {port}")


async def main() -> None:
    await init_db()
    async with async_session() as session:
        await seed_data(session)
        await seed_foundation_position(session)
        await seed_restaurant_positions(session)
        await seed_missing_restaurant_positions(session)
        await sync_new_questions(session)
        await sync_question_options(session)

    bot = Bot(token=BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    dp = Dispatcher()

    # Порядок важен: более специфичные роутеры регистрируются раньше,
    # но т.к. фильтры не пересекаются, порядок здесь не критичен.
    dp.include_router(start.router)
    dp.include_router(restaurants.router)
    dp.include_router(restaurant_requests.router)
    dp.include_router(profile.router)
    dp.include_router(rating.router)
    dp.include_router(vacancies.router)
    dp.include_router(exams.router)
    dp.include_router(manager.router)
    dp.include_router(help_handlers.router)
    dp.include_router(admin.router)

    logger.info("Бот запускается...")
    await bot.delete_webhook(drop_pending_updates=True)
    await asyncio.gather(
        dp.start_polling(bot),
        start_web_server(),
    )


if __name__ == "__main__":
    asyncio.run(main())
