from aiogram import F, Router
from aiogram.types import CallbackQuery

from database import crud
from database.database import async_session
from keyboards.keyboards import categories_kb, positions_kb
from services.rating import rank_progress_text

router = Router(name="positions")


async def _categories_screen_text(session, user_id: int, position) -> str:
    xp = await crud.get_total_xp_for_position(session, user_id, position.id)
    ranks = await crud.get_ranks_for_position(session, position.id)
    current_rank = crud.get_rank_for_xp(ranks, xp)
    next_rank = crud.get_next_rank(ranks, current_rank)
    rank_line = rank_progress_text(current_rank, next_rank, xp)
    return f"{position.emoji} {position.name}\n" f"Ваш ранг: {rank_line}\n\n" "Доступные категории:"


@router.callback_query(F.data == "menu:positions")
async def cb_choose_position(callback: CallbackQuery) -> None:
    async with async_session() as session:
        user = await crud.get_or_create_user(
            session,
            telegram_id=callback.from_user.id,
            username=callback.from_user.username,
            full_name=callback.from_user.full_name,
        )
        positions = await crud.get_active_positions(session, user.restaurant_id)

    if not positions:
        await callback.answer("Должности пока не настроены.", show_alert=True)
        return

    await callback.message.edit_text("Выберите должность:", reply_markup=positions_kb(positions))
    await callback.answer()


@router.callback_query(F.data.startswith("position:"))
async def cb_position_selected(callback: CallbackQuery) -> None:
    position_id = int(callback.data.split(":")[1])

    async with async_session() as session:
        position = await crud.get_position_by_id(session, position_id)
        if position is None:
            await callback.answer("Должность не найдена.", show_alert=True)
            return

        user = await crud.get_or_create_user(
            session,
            telegram_id=callback.from_user.id,
            username=callback.from_user.username,
            full_name=callback.from_user.full_name,
        )
        await crud.set_user_position(session, user, position.id)
        categories = await crud.get_categories_for_position(session, position.id)

        if not categories:
            await callback.answer("Для этой должности пока нет категорий тестов.", show_alert=True)
            return

        text = await _categories_screen_text(session, user.id, position)

    await callback.message.edit_text(text, reply_markup=categories_kb(categories, position.id))
    await callback.answer()


@router.callback_query(F.data == "menu:my_tests")
async def cb_my_tests(callback: CallbackQuery) -> None:
    """'Мои тесты' — показывает категории для текущей выбранной должности пользователя."""
    async with async_session() as session:
        user = await crud.get_or_create_user(
            session,
            telegram_id=callback.from_user.id,
            username=callback.from_user.username,
            full_name=callback.from_user.full_name,
        )
        if user.current_position_id is None:
            positions = await crud.get_active_positions(session, user.restaurant_id)
            await callback.message.edit_text(
                "Сначала выберите должность:", reply_markup=positions_kb(positions)
            )
            await callback.answer()
            return

        position = await crud.get_position_by_id(session, user.current_position_id)
        categories = await crud.get_categories_for_position(session, position.id)
        text = await _categories_screen_text(session, user.id, position)

    await callback.message.edit_text(text, reply_markup=categories_kb(categories, position.id))
    await callback.answer()
