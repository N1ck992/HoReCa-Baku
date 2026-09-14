from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from config import DATABASE_URL
from database.models import Base

# echo=False -> установите True для отладки SQL-запросов
engine = create_async_engine(DATABASE_URL, echo=False)

async_session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def init_db() -> None:
    """Создаёт все таблицы, если их ещё нет. Безопасно вызывать при каждом запуске."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_add_missing_columns)


def _add_missing_columns(sync_conn) -> None:
    """Ручная лёгкая миграция: create_all создаёт только ЦЕЛИКОМ
    отсутствующие таблицы, но не добавляет новые столбцы в уже
    существующие (иначе на продакшене, где уже есть реальные данные,
    новый столбец questions.level просто никогда бы не появился).
    Безопасно вызывать при каждом запуске — если столбец уже есть,
    ничего не делает."""
    inspector = inspect(sync_conn)
    existing_columns = {col["name"] for col in inspector.get_columns("questions")}
    if "level" not in existing_columns:
        sync_conn.execute(text("ALTER TABLE questions ADD COLUMN level INTEGER"))
