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
    positions,
    profile,
    rating,
    restaurant_requests,
    restaurants,
    start,
    tests,
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

    app = web.Application()
    app.router.add_get("/", health)
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
    dp.include_router(positions.router)
    dp.include_router(tests.router)
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
