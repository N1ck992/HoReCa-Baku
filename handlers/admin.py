from aiogram import F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message
from aiogram.utils.keyboard import InlineKeyboardBuilder

from config import ADMIN_ID
from database import crud
from database.database import async_session
from database.models import Restaurant
from keyboards.keyboards import admin_vacancies_log_kb
from services.rating import display_name

router = Router(name="admin")


class AdminRestaurantStates(StatesGroup):
    # Пошаговое создание заведения: название -> Telegram ID менеджера
    waiting_name = State()
    waiting_manager_id = State()


class AdminResetStatsStates(StatesGroup):
    waiting_telegram_id = State()


def _is_admin(telegram_id: int) -> bool:
    return ADMIN_ID != 0 and telegram_id == ADMIN_ID


def admin_menu_kb():
    builder = InlineKeyboardBuilder()
    builder.button(text="👥 Пользователи и результаты", callback_data="admin:users")
    builder.button(text="🔄 Сбросить статистику пользователя", callback_data="admin:reset_stats")
    builder.button(text="📋 Опубликованные вакансии", callback_data="admin:vacancies")
    builder.button(text="🏢 Рестораны", callback_data="admin:restaurants")
    builder.button(text="⬅️ Главное меню", callback_data="menu:main")
    builder.adjust(1)
    return builder.as_markup()


def admin_restaurants_kb(restaurants: list[Restaurant]):
    builder = InlineKeyboardBuilder()
    builder.button(text="➕ Добавить заведение", callback_data="admin:add_restaurant")
    for restaurant in restaurants:
        status = "🔗" if restaurant.group_chat_id else "❌ группа не привязана"
        builder.button(
            text=f"{restaurant.name} — {status}",
            callback_data=f"admin_restaurant_info:{restaurant.id}",
        )
    builder.button(text="⬅️ Админ-панель", callback_data="admin:menu")
    builder.adjust(1)
    return builder.as_markup()


@router.message(Command("admin"))
async def cmd_admin(message: Message) -> None:
    if not _is_admin(message.from_user.id):
        await message.answer("⛔ У вас нет доступа к админ-панели.")
        return

    await message.answer(
        "🛠 Админ-панель\n\n"
        "Здесь можно посмотреть пользователей и их результаты, журнал "
        "вакансий, опубликованных в канал, и управлять заведениями.\n"
        "Редактирование должностей/вопросов пока делается через "
        "файл data/seed.py — см. README.",
        reply_markup=admin_menu_kb(),
    )


@router.callback_query(F.data == "admin:menu")
async def cb_admin_menu(callback: CallbackQuery, state: FSMContext) -> None:
    if not _is_admin(callback.from_user.id):
        await callback.answer("⛔ Нет доступа.", show_alert=True)
        return
    await state.clear()
    await callback.message.edit_text("🛠 Админ-панель", reply_markup=admin_menu_kb())
    await callback.answer()


@router.callback_query(F.data == "admin:users")
async def cb_admin_users(callback: CallbackQuery) -> None:
    if not _is_admin(callback.from_user.id):
        await callback.answer("⛔ Нет доступа.", show_alert=True)
        return

    async with async_session() as session:
        users_data = await crud.get_all_users_with_stats(session)

    if not users_data:
        text = "Пользователей пока нет."
    else:
        lines = ["👥 Пользователи и результаты:\n"]
        for item in users_data:
            user = item["user"]
            position = item["position"]
            position_text = f"{position.emoji} {position.name}" if position else "—"
            lines.append(
                f"• {display_name(user)} (ID {user.telegram_id})\n"
                f"  Должность: {position_text} | Тестов: {item['tests_completed']} | "
                f"Средний %: {item['avg_percentage']}"
            )
        text = "\n".join(lines)

    # Telegram ограничивает длину сообщения — подстрахуемся
    if len(text) > 3900:
        text = text[:3900] + "\n\n… (список обрезан)"

    await callback.message.edit_text(text, reply_markup=admin_menu_kb())
    await callback.answer()


# ---------- Сброс статистики пользователя (только разработчик) ----------

@router.callback_query(F.data == "admin:reset_stats")
async def cb_admin_reset_stats_start(callback: CallbackQuery, state: FSMContext) -> None:
    if not _is_admin(callback.from_user.id):
        await callback.answer("⛔ Нет доступа.", show_alert=True)
        return
    await state.set_state(AdminResetStatsStates.waiting_telegram_id)
    await callback.message.edit_text(
        "Пришлите Telegram ID человека, которому нужно полностью обнулить "
        "историю тестов (и общих, и во всех заведениях сразу).\n\n"
        "Узнать ID можно в списке «👥 Пользователи и результаты».",
        reply_markup=admin_menu_kb(),
    )
    await callback.answer()


@router.message(AdminResetStatsStates.waiting_telegram_id)
async def cb_admin_reset_stats_id(message: Message, state: FSMContext) -> None:
    if not _is_admin(message.from_user.id):
        return
    if not message.text or not message.text.strip().isdigit():
        await message.answer("Нужно прислать числовой Telegram ID.")
        return

    telegram_id = int(message.text.strip())
    async with async_session() as session:
        user = await crud.get_user_by_telegram_id(session, telegram_id)
        if user is None:
            await message.answer("Пользователь с таким Telegram ID не найден.")
            return
        stats = await crud.get_user_stats(session, user.id)

    await state.update_data(reset_user_id=user.id, reset_telegram_id=telegram_id)
    builder = InlineKeyboardBuilder()
    builder.button(text="⚠️ Да, обнулить всю статистику", callback_data="admin_reset_confirm")
    builder.button(text="Отмена", callback_data="admin:menu")
    builder.adjust(1)
    await message.answer(
        f"Сбросить статистику для {display_name(user)} (ID {telegram_id})?\n\n"
        f"Сейчас у него {stats['tests_completed']} общих тестов в статистике "
        "(плюс всё, что есть по заведениям). Это действие необратимо — "
        "вся история тестов будет удалена без возможности восстановить.",
        reply_markup=builder.as_markup(),
    )


@router.callback_query(F.data == "admin_reset_confirm")
async def cb_admin_reset_stats_confirm(callback: CallbackQuery, state: FSMContext) -> None:
    if not _is_admin(callback.from_user.id):
        await callback.answer("⛔ Нет доступа.", show_alert=True)
        return

    data = await state.get_data()
    user_id = data.get("reset_user_id")
    telegram_id = data.get("reset_telegram_id")
    if user_id is None:
        await callback.answer("Сессия истекла, начните заново.", show_alert=True)
        return

    async with async_session() as session:
        deleted_count = await crud.reset_user_statistics(session, user_id)

    await state.clear()
    await callback.message.edit_text(
        f"✅ Готово. У пользователя с ID {telegram_id} удалено результатов тестов: {deleted_count}. "
        "Статистика полностью обнулена.",
        reply_markup=admin_menu_kb(),
    )
    await callback.answer()


# ---------- Журнал вакансий ----------
# Публикацией вакансий в канал теперь занимаются сами пользователи бота
# (см. handlers/vacancies.py). Здесь администратор видит журнал всех
# опубликованных вакансий и может удалить запись из базы (сообщение в
# самом Telegram-канале при этом нужно будет удалить вручную).

@router.callback_query(F.data == "admin:vacancies")
async def cb_admin_vacancies(callback: CallbackQuery) -> None:
    if not _is_admin(callback.from_user.id):
        await callback.answer("⛔ Нет доступа.", show_alert=True)
        return

    async with async_session() as session:
        vacancies = await crud.get_all_vacancies(session)

    if not vacancies:
        text = "📋 Опубликованных вакансий пока нет."
    else:
        lines = ["📋 Опубликованные вакансии:\n"]
        for vacancy in vacancies:
            lines.append(
                f"• {vacancy.title} — опубликовал {vacancy.created_by_name} "
                f"(ID {vacancy.created_by_telegram_id})"
            )
        text = "\n".join(lines)

    await callback.message.edit_text(text, reply_markup=admin_vacancies_log_kb(vacancies))
    await callback.answer()


@router.callback_query(F.data.startswith("admin_vacancy_delete:"))
async def cb_admin_vacancy_delete(callback: CallbackQuery) -> None:
    if not _is_admin(callback.from_user.id):
        await callback.answer("⛔ Нет доступа.", show_alert=True)
        return

    vacancy_id = int(callback.data.split(":")[1])
    async with async_session() as session:
        await crud.delete_vacancy(session, vacancy_id)
        vacancies = await crud.get_all_vacancies(session)

    await callback.message.edit_reply_markup(reply_markup=admin_vacancies_log_kb(vacancies))
    await callback.answer("Запись удалена из журнала")


# ---------- Управление заведениями (ресторанами) ----------

@router.callback_query(F.data == "admin:restaurants")
async def cb_admin_restaurants(callback: CallbackQuery, state: FSMContext) -> None:
    if not _is_admin(callback.from_user.id):
        await callback.answer("⛔ Нет доступа.", show_alert=True)
        return

    await state.clear()
    async with async_session() as session:
        restaurants = await crud.get_all_restaurants(session)

    text = "🏢 Заведения\n\n"
    if not restaurants:
        text += "Пока не создано ни одного заведения."
    else:
        text += "🔗 — группа привязана, ❌ — менеджеру ещё нужно выполнить /link_restaurant."

    await callback.message.edit_text(text, reply_markup=admin_restaurants_kb(restaurants))
    await callback.answer()


@router.callback_query(F.data.startswith("admin_restaurant_info:"))
async def cb_admin_restaurant_info(callback: CallbackQuery) -> None:
    if not _is_admin(callback.from_user.id):
        await callback.answer("⛔ Нет доступа.", show_alert=True)
        return

    restaurant_id = int(callback.data.split(":")[1])
    async with async_session() as session:
        restaurant = await crud.get_restaurant_by_id(session, restaurant_id)
        if restaurant is None:
            await callback.answer("Заведение не найдено.", show_alert=True)
            return
        employees = await crud.get_employees_for_restaurant(session, restaurant_id)
        managers = await crud.get_restaurant_managers(session, restaurant_id)

    group_status = (
        f"привязана (chat_id: {restaurant.group_chat_id})"
        if restaurant.group_chat_id
        else "не привязана"
    )
    managers_text = "\n".join(
        f"  • {m.name or 'без имени'} (ID {m.telegram_id})" for m in managers
    )
    text = (
        f"🏢 {restaurant.name}\n\n"
        f"ID заведения: {restaurant.id}\n"
        f"Администраторы:\n{managers_text}\n"
        f"Группа: {group_status}\n"
        f"Сотрудников: {len(employees)}\n\n"
        f"Чтобы привязать группу, администратор должен отправить в группе заведения:\n"
        f"/link_restaurant {restaurant.id}\n\n"
        f"Добавлять и убирать администраторов друг у друга они могут сами "
        f"командой /managers внутри группы заведения."
    )
    await callback.answer()
    await callback.message.answer(text, reply_markup=admin_menu_kb())


@router.callback_query(F.data == "admin:add_restaurant")
async def cb_admin_add_restaurant(callback: CallbackQuery, state: FSMContext) -> None:
    if not _is_admin(callback.from_user.id):
        await callback.answer("⛔ Нет доступа.", show_alert=True)
        return

    await state.set_state(AdminRestaurantStates.waiting_name)
    await callback.message.edit_text("Введите название заведения:")
    await callback.answer()


@router.message(AdminRestaurantStates.waiting_name)
async def admin_restaurant_name(message: Message, state: FSMContext) -> None:
    if not _is_admin(message.from_user.id):
        return
    if not message.text or not message.text.strip():
        await message.answer("Пожалуйста, отправьте название текстом.")
        return
    await state.update_data(name=message.text.strip())
    await state.set_state(AdminRestaurantStates.waiting_manager_id)
    await message.answer(
        "Теперь отправьте Telegram ID менеджера этого заведения "
        "(узнать можно через @userinfobot)."
    )


@router.message(AdminRestaurantStates.waiting_manager_id)
async def admin_restaurant_manager_id(message: Message, state: FSMContext) -> None:
    if not _is_admin(message.from_user.id):
        return
    if not message.text or not message.text.strip().isdigit():
        await message.answer("Telegram ID — это просто число. Отправьте, пожалуйста, ещё раз.")
        return

    manager_id = int(message.text.strip())
    data = await state.get_data()
    await state.clear()

    async with async_session() as session:
        existing_user = await crud.get_user_by_telegram_id(session, manager_id)
        manager_name = display_name(existing_user) if existing_user else None
        restaurant = await crud.create_restaurant(session, data["name"], manager_id, manager_name)

    await message.answer(
        f"✅ Заведение «{restaurant.name}» создано (ID {restaurant.id}).\n\n"
        f"Передайте администратору (Telegram ID {manager_id}):\n"
        f"1. Добавить бота в Telegram-группу заведения.\n"
        f"2. Отправить в этой группе команду:\n"
        f"/link_restaurant {restaurant.id}\n\n"
        f"После этого сотрудники смогут прикрепиться к заведению, "
        f"просто отправив /start в той же группе. Добавить ещё "
        f"администраторов можно будет прямо в группе командой /managers.",
        reply_markup=admin_menu_kb(),
    )
