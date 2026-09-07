from aiogram import Bot

_cached_username: str | None = None


async def get_bot_username(bot: Bot) -> str:
    """Возвращает username бота (без @), кэшируя после первого запроса,
    чтобы не дёргать Telegram API на каждое сообщение в группе."""
    global _cached_username
    if _cached_username is None:
        me = await bot.get_me()
        _cached_username = me.username
    return _cached_username
