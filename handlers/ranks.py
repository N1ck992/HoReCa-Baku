from aiogram import F, Router
from aiogram.types import CallbackQuery

from database import crud
from database.database import async_session
from keyboards.keyboards import back_to_main_kb
from services.rating import rank_progress_text

router = Router(name="ranks")


@router.callback_query(F.data == "menu:ranks")
async def cb_my_ranks(callback: CallbackQuery) -> None:
    async with async_session() as session:
        user = await crud.get_or_create_user(
            session,
            telegram_id=callback.from_user.id,
            username=callback.from_user.username,
            full_name=callback.from_user.full_name,
        )
        positions = await crud.get_active_positions(session)

        lines = ["🎖 Мои ранги\n"]
        any_progress = False
        for position in positions:
            xp = await crud.get_user_xp_for_position(session, user.id, position.id)
            ranks = await crud.get_ranks_for_position(session, position.id)
            if not ranks:
                continue
            current_rank = crud.get_rank_for_xp(ranks, xp)
            next_rank = crud.get_next_rank(ranks, current_rank)
            if xp > 0:
                any_progress = True
            lines.append(
                f"{position.emoji} {position.name}: "
                f"{rank_progress_text(current_rank, next_rank, xp)}"
            )

    if not any_progress:
        lines.append("\nПройдите хотя бы один тест по любой должности, чтобы начать зарабатывать опыт!")

    await callback.message.edit_text("\n".join(lines), reply_markup=back_to_main_kb())
    await callback.answer()
