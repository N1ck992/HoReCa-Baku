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
    """Собирает текст и клавиатуру экрана профиля в боте. Этот экран
    теперь открывается ТОЛЬКО из общего меню бота (menu:profile) —
    профиль внутри конкретного заведения показывается на сайте, поэтому
    «Назад» всегда ведёт в общее меню, без всякой попытки угадать
    заведение по привязке пользователя."""
    user = await crud.get_or_create_user(
        session, telegram_id=telegram_id, username=username, full_name=full_name
    )
    stats = await crud.get_user_stats(session, user.id)
    leaderboard_rank = await crud.get_user_rank(session, user.id)

    curator_name = await crud.get_curator_name(session, user.telegram_id)
    trainee_count = await crud.get_trainee_count(session, user.telegram_id)

    leaderboard_rank_text = f"#{leaderboard_rank}" if leaderboard_rank else "нет данных (пройдите пробный тест)"

    text = (
        "👤 Мой профиль\n\n"
        f"Telegram ID: {user.telegram_id}\n"
        f"Имя: {display_name(user)}\n"
    )
    if curator_name:
        text += f"Куратор: {curator_name}\n"
    if trainee_count:
        text += f"Стажёров: {trainee_count}\n"

    text += (
        "\nПробные тесты (с главной страницы бота, отдельно от заведений):\n"
        f"Пройдено тестов: {stats['tests_completed']}\n"
        f"Средний результат: {stats['avg_percentage']}%\n"
        f"Общий рейтинг бота: {leaderboard_rank_text}"
    )

    # Список заведений, к которым человек привязан — с должностью (или
    # статусом администратора) и прогрессом по тестам именно в этом
    # заведении. Тесты внутри заведений считаются отдельно от пробных.
    options = await crud.get_user_restaurant_options(session, telegram_id)
    if options:
        text += "\n\n🏢 Ваши заведения:"
        for restaurant, is_manager in options:
            restaurant_stats = await crud.get_user_stats_for_restaurant(session, user.id, restaurant.id)
            if is_manager:
                role_text = "администратор"
            elif user.restaurant_id == restaurant.id and user.current_position_id is not None:
                position = await crud.get_position_by_id(session, user.current_position_id)
                role_text = f"{position.emoji} {position.name}" if position else "сотрудник"
            else:
                role_text = "сотрудник"
            text += (
                f"\n• «{restaurant.name}» — {role_text} — "
                f"{restaurant_stats['tests_completed']} тестов, {restaurant_stats['avg_percentage']}%"
            )
    else:
        text += "\n\nВы пока не привязаны ни к одному заведению."

    leave_restaurant = None
    if user.restaurant_id is not None:
        staff_restaurant = await crud.get_restaurant_by_id(session, user.restaurant_id)
        if staff_restaurant is not None:
            leave_restaurant = (staff_restaurant.id, staff_restaurant.name)

    return text, profile_kb(leave_restaurant)


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
