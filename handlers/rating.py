from aiogram import F, Router
from aiogram.types import CallbackQuery

from database import crud
from database.database import async_session
from keyboards.keyboards import leaderboard_kb

router = Router(name="rating")


@router.callback_query(F.data == "menu:leaderboard")
async def cb_leaderboard(callback: CallbackQuery) -> None:
    """Рейтинг заведений (не отдельных людей) — средний результат тестов
    среди сотрудников каждого заведения."""
    async with async_session() as session:
        leaderboard = await crud.get_restaurant_leaderboard(session)

    if not leaderboard:
        text = (
            "🏢 Рейтинг заведений\n\n"
            "Пока нет заведений с результатами тестов сотрудников."
        )
    else:
        lines = ["🏢 Рейтинг заведений\n"]
        medals = {1: "🥇", 2: "🥈", 3: "🥉"}
        for idx, entry in enumerate(leaderboard, start=1):
            medal = medals.get(idx, f"{idx}.")
            name = entry["restaurant"].name
            lines.append(
                f"{medal} {name} — {entry['avg_percentage']}% "
                f"({entry['employees_count']} сотр.)"
            )
        text = "\n".join(lines)

    await callback.message.edit_text(text, reply_markup=leaderboard_kb())
    await callback.answer()
