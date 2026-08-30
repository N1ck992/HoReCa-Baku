from aiogram import F, Router
from aiogram.types import CallbackQuery

from database import crud
from database.database import async_session
from keyboards.keyboards import profile_kb
from services.rating import display_name, rank_progress_text

router = Router(name="profile")


@router.callback_query(F.data == "menu:profile")
async def cb_profile(callback: CallbackQuery) -> None:
    async with async_session() as session:
        user = await crud.get_or_create_user(
            session,
            telegram_id=callback.from_user.id,
            username=callback.from_user.username,
            full_name=callback.from_user.full_name,
        )
        stats = await crud.get_user_stats(session, user.id)
        leaderboard_rank = await crud.get_user_rank(session, user.id)
        position = (
            await crud.get_position_by_id(session, user.current_position_id)
            if user.current_position_id
            else None
        )

        # Если сотрудник привязан к заведению — покажем его заведение и
        # личное место в рейтинге внутри этого заведения (отдельно от
        # общего рейтинга среди вообще всех пользователей бота).
        restaurant = None
        restaurant_rank = None
        if user.restaurant_id is not None:
            restaurant = await crud.get_restaurant_by_id(session, user.restaurant_id)
            if restaurant is not None:
                restaurant_rank = await crud.get_user_rank_within_restaurant(
                    session, user.id, restaurant.id
                )

        # Ранг по текущей выбранной должности (показываем отдельной строкой сверху)
        current_job_rank_line = None
        if position is not None:
            xp = await crud.get_total_xp_for_position(session, user.id, position.id)
            ranks = await crud.get_ranks_for_position(session, position.id)
            current_rank = crud.get_rank_for_xp(ranks, xp)
            next_rank = crud.get_next_rank(ranks, current_rank)
            current_job_rank_line = rank_progress_text(current_rank, next_rank, xp)

        # Ранги по всем должностям — раньше это была отдельная кнопка "🎖 Мои ранги"
        all_positions = await crud.get_active_positions(session, user.restaurant_id)
        all_ranks_lines = []
        for pos in all_positions:
            xp = await crud.get_total_xp_for_position(session, user.id, pos.id)
            ranks = await crud.get_ranks_for_position(session, pos.id)
            if not ranks:
                continue
            current_rank = crud.get_rank_for_xp(ranks, xp)
            next_rank = crud.get_next_rank(ranks, current_rank)
            all_ranks_lines.append(
                f"{pos.emoji} {pos.name}: {rank_progress_text(current_rank, next_rank, xp)}"
            )

    position_text = f"{position.emoji} {position.name}" if position else "не выбрана"
    leaderboard_rank_text = f"#{leaderboard_rank}" if leaderboard_rank else "нет данных (пройдите тест)"

    text = (
        "👤 Мой профиль\n\n"
        f"Telegram ID: {user.telegram_id}\n"
        f"Имя: {display_name(user)}\n"
        f"Должность: {position_text}\n"
    )
    if restaurant is not None:
        text += f"Заведение: {restaurant.name}\n"
    if current_job_rank_line:
        text += f"Ранг: {current_job_rank_line}\n"

    text += (
        f"\nПройдено тестов: {stats['tests_completed']}\n"
        f"Правильных ответов: {stats['correct_total']}\n"
        f"Неправильных ответов: {stats['wrong_total']}\n"
        f"Средний результат: {stats['avg_percentage']}%\n"
        f"Личный рейтинг (среди всех пользователей бота): {leaderboard_rank_text}"
    )
    if restaurant is not None:
        restaurant_rank_text = (
            f"#{restaurant_rank}" if restaurant_rank else "нет данных (пройдите тест)"
        )
        text += f"\nРейтинг внутри «{restaurant.name}»: {restaurant_rank_text}"

    if all_ranks_lines:
        text += "\n\n🎖 Ранги по должностям:\n" + "\n".join(all_ranks_lines)

    await callback.message.edit_text(text, reply_markup=profile_kb())
    await callback.answer()
