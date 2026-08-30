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
