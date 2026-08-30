import os

from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN: str = os.getenv("BOT_TOKEN", "")
ADMIN_ID: int = int(os.getenv("ADMIN_ID", "0"))
DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./bot.db")

# Канал, куда бот публикует вакансии (формат "@channelusername").
# Бота нужно добавить в этот канал администратором с правом публикации сообщений.
VACANCIES_CHANNEL: str = os.getenv("VACANCIES_CHANNEL", "")


def vacancies_channel_url() -> str:
    """Ссылка t.me/... на канал с вакансиями для кнопки 'Поиск вакансии'."""
    username = VACANCIES_CHANNEL.lstrip("@")
    return f"https://t.me/{username}"


if not BOT_TOKEN:
    raise RuntimeError(
        "BOT_TOKEN не найден. Скопируйте .env.example в .env и укажите токен бота."
    )
