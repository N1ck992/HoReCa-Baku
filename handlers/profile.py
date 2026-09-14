from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery
from aiogram.utils.keyboard import InlineKeyboardBuilder

from database import crud
from database.database import async_session
from keyboards.keyboards import join_menu_kb, main_menu_kb, profile_kb
from services.rating import display_name, rank_progress_text
from utils import get_bot_username

router = Router(name="profile")


async def build_profile_view(session, telegram_id: int, username: str | None, full_name: str | None):
    """Собирает текст и клавиатуру экрана профиля. Вынесено отдельно, чтобы
    использовать и в обычном меню (cb_profile), и при переходе из группы
    заведения по кнопке «Мой профиль» (handlers/start.py)."""
    user = await crud.get_or_create_user(
        session, telegram_id=telegram_id, username=username, full_name=full_name
    )
    stats = await crud.get_user_stats(session, user.id)
    leaderboard_rank = await crud.get_user_rank(session, user.id)

    # Если сотрудник привязан к заведению ИЛИ администрирует его — покажем
    # это заведение и личное место в рейтинге внутри него. Раньше здесь
    # проверялась только привязка как сотрудник, из-за чего у "чистых"
    # менеджеров (без привязки как сотрудник) кнопка "Назад" в профиле
    # ошибочно вела в общее меню, а не в меню их заведения.
    restaurant = None
    restaurant_rank = None
    options = await crud.get_user_restaurant_options(session, telegram_id)
    if options:
        restaurant = options[0][0]
        restaurant_rank = await crud.get_user_rank_within_restaurant(session, user.id, restaurant.id)

    # Прогресс по каждой должности, которой человек вообще занимался —
    # раньше тут была одна "текущая должность", назначаемая вручную
    # администратором; теперь должность больше не назначается, поэтому
    # показываем сразу все, по которым есть хоть один пройденный тест,
    # с уровнем сложности вопросов, который сейчас открыт по каждой.
    level_names = {1: "лёгкий", 2: "средний", 3: "сложный"}
    position_progress = await crud.get_position_progress_for_user(session, user.id)
    progress_lines = [
        f"{p['position_emoji']} {p['position_name']}: уровень "
        f"{level_names.get(p['level'], p['level'])} ({p['tests_completed']} тестов)"
        for p in position_progress
    ]

    # Ранги по всем должностям — раньше это была отдельная кнопка "🎖 Мои ранги".
    # Ранг НЕ связан с экзаменами и считается только по ОБЩИМ должностям
    # (Position.restaurant_id is None) — тесты внутри конкретного заведения
    # на общий ранг пользователя не влияют, это отдельная система оценки
    # для самого заведения (см. панель менеджера).
    all_positions = [p for p in await crud.get_active_positions(session, user.restaurant_id) if p.restaurant_id is None]
    if not all_positions:
        all_positions = await crud.get_active_positions(session, None)
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

    # Куратор (кто пригласил) и стажёры (кого пригласил сам человек)
    curator_name = await crud.get_curator_name(session, user.telegram_id)
    trainee_count = await crud.get_trainee_count(session, user.telegram_id)

    leaderboard_rank_text = f"#{leaderboard_rank}" if leaderboard_rank else "нет данных (пройдите тест)"

    text = (
        "👤 Мой профиль\n\n"
        f"Telegram ID: {user.telegram_id}\n"
        f"Имя: {display_name(user)}\n"
    )
    if restaurant is not None:
        text += f"Заведение: {restaurant.name}\n"
    if curator_name:
        text += f"Куратор: {curator_name}\n"
    if trainee_count:
        text += f"Стажёров: {trainee_count}\n"

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

    if progress_lines:
        text += "\n\n📊 Уровень вопросов по должностям:\n" + "\n".join(progress_lines)

    if all_ranks_lines:
        text += "\n\n🎖 Ранги по должностям:\n" + "\n".join(all_ranks_lines)

    is_staff_here = restaurant is not None and user.restaurant_id == restaurant.id
    return text, profile_kb(restaurant.id if restaurant is not None else None, show_leave=is_staff_here)


@router.callback_query(F.data == "menu:profile")
async def cb_profile(callback: CallbackQuery) -> None:
    async with async_session() as session:
        text, kb = await build_profile_view(
            session, callback.from_user.id, callback.from_user.username, callback.from_user.full_name
        )
    await callback.message.edit_text(text, reply_markup=kb)
    await callback.answer()


@router.callback_query(F.data.startswith("back_to_restaurant:"))
async def cb_back_to_restaurant(callback: CallbackQuery, state: FSMContext) -> None:
    restaurant_id = int(callback.data.split(":")[1])
    async with async_session() as session:
        restaurant = await crud.get_restaurant_by_id(session, restaurant_id)
        if restaurant is None:
            await callback.answer("Заведение не найдено.", show_alert=True)
            return
        is_manager = await crud.is_restaurant_manager(session, restaurant_id, callback.from_user.id)

    await state.update_data(in_general_menu=False)
    username = await get_bot_username(callback.bot)
    await callback.message.edit_text(
        f"Меню «{restaurant.name}»:", reply_markup=join_menu_kb(username, restaurant_id, is_manager)
    )
    await callback.answer()


@router.callback_query(F.data.startswith("leave_restaurant_ask:"))
async def cb_leave_restaurant_ask(callback: CallbackQuery) -> None:
    restaurant_id = int(callback.data.split(":")[1])
    async with async_session() as session:
        restaurant = await crud.get_restaurant_by_id(session, restaurant_id)
    name = restaurant.name if restaurant else "заведения"

    builder = InlineKeyboardBuilder()
    builder.button(text="⚠️ Да, покинуть", callback_data=f"leave_restaurant_do:{restaurant_id}")
    builder.button(text="Отмена", callback_data="menu:profile")
    builder.adjust(1)

    await callback.message.edit_text(
        f"Вы уверены, что хотите покинуть «{name}»? Вы потеряете доступ к "
        "тестам и результатам этого заведения. Чтобы вернуться, понадобится "
        "новая ссылка от администратора.",
        reply_markup=builder.as_markup(),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("leave_restaurant_do:"))
async def cb_leave_restaurant_do(callback: CallbackQuery) -> None:
    restaurant_id = int(callback.data.split(":")[1])
    async with async_session() as session:
        user = await crud.get_user_by_telegram_id(session, callback.from_user.id)
        removed = user is not None and await crud.remove_user_from_restaurant(
            session, restaurant_id, user.id
        )

    if not removed:
        await callback.answer("Вы уже не в этом заведении.", show_alert=True)
    else:
        await callback.answer("Вы покинули заведение")

    await callback.message.edit_text(
        "Вы вышли из заведения. Теперь вам доступно только общее меню бота.",
    )
    await callback.message.answer("Главное меню:", reply_markup=main_menu_kb())
