import os

from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN: str = os.getenv("BOT_TOKEN", "")
ADMIN_ID: int = int(os.getenv("ADMIN_ID", "0"))
DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./bot.db")

# Прогрессивные уровни тестов на сайте. Уровни 1-3 (лёгкий/средний/сложный)
# открыты всегда. Уровни 4..MAX_QUESTION_LEVEL ("экспертные") открываются
# по цепочке: уровень N доступен, только когда пройдены (хотя бы по одному
# завершённому тесту) ВСЕ уровни 1..N-1 — независимо от процента правильных
# ответов. Все эти уровни используют одну и ту же сложность вопросов
# (EXPERT_DIFFICULTY) — какому именно уровню принадлежит конкретный
# экспертный вопрос, определяет поле Question.level, а не difficulty.
# Увеличивайте MAX_QUESTION_LEVEL по мере добавления новых вопросов —
# уровни без вопросов просто остаются пустыми и помечены "скоро появятся".
EXPERT_DIFFICULTY: int = 4
MAX_QUESTION_LEVEL: int = 10

# Ссылка на веб-приложение (Mini App) с тестами — сайт на Netlify.
# Если не задано, бот покажет старый способ (выбор должности текстом в чате).
WEBAPP_URL: str = os.getenv("WEBAPP_URL", "")

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
