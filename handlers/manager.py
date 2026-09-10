from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, Message
from aiogram.utils.keyboard import InlineKeyboardBuilder

from database import crud
from database.database import async_session
from handlers.restaurants import _employees_kb, _managers_list_kb
from services.rating import display_name
from utils import get_bot_username

router = Router(name="manager")

MANAGER_HELP_TEXT = (
    "📖 Как пользоваться панелью администратора\n\n"
    "👥 Результаты сотрудников — список всех, кто прикреплён к вашему "
    "заведению (отправил /start в вашей группе), с должностью и "
    "статистикой тестов. Нажмите на сотрудника, чтобы увидеть его историю "
    "экзаменов: кто из администраторов выдавал коды, сколько баллов "
    "набрано, сдан экзамен или нет.\n\n"
    "🎓 Выдать код на экзамен — выберите должность, бот сгенерирует "
    "одноразовый код и покажет его вам. Передайте код сотруднику любым "
    "удобным способом.\n\n"
    "📩 Запросы на экзамен — если сотрудник сам запросит код через "
    "«🎓 Сдать экзамен» → «Запросить код», выбрав вас как администратора, "
    "вам придёт отдельное уведомление с кнопками «Выдать код» / "
    "«Отклонить» — код в этом случае доставляется сотруднику автоматически.\n\n"
    "Команды прямо в группе заведения (не в личке):\n"
    "/assign — назначить сотруднику должность\n"
    "/managers — посмотреть, добавить или убрать администраторов "
    "заведения (администраторов может быть несколько, любой может "
    "управлять списком)\n"
    "/link_restaurant <id> — привязать группу к заведению (один раз, "
    "при первой настройке)"
)


def manager_menu_kb(restaurant_id: int):
    builder = InlineKeyboardBuilder()
    builder.button(
        text="🔗 Ссылка для персонала", callback_data=f"manager_invite_link:{restaurant_id}"
    )
    builder.button(
        text="➕ Добавить персонал", callback_data=f"manager_assign_start:{restaurant_id}"
    )
    builder.button(
        text="👥 Результаты сотрудников", callback_data=f"manager_employees:{restaurant_id}"
    )
    builder.button(
        text="🧑‍💼 Администраторы заведения", callback_data=f"manager_show_admins:{restaurant_id}"
    )
    builder.button(
        text="🎓 Выдать код на экзамен", callback_data=f"manager_exam_position:{restaurant_id}"
    )
    builder.button(text="📖 Инструкция", callback_data=f"manager_help:{restaurant_id}")
    builder.adjust(1)
    return builder.as_markup()


def manager_exam_positions_kb(restaurant_id: int, positions):
    builder = InlineKeyboardBuilder()
    for position in positions:
        builder.button(
            text=f"{position.emoji} {position.name}",
            callback_data=f"manager_gen_code:{restaurant_id}:{position.id}",
        )
    builder.button(text="⬅️ Назад", callback_data=f"manager_menu:{restaurant_id}")
    builder.adjust(1)
    return builder.as_markup()


def restaurant_picker_kb(restaurants):
    builder = InlineKeyboardBuilder()
    for restaurant in restaurants:
        builder.button(text=restaurant.name, callback_data=f"manager_menu:{restaurant.id}")
    builder.adjust(1)
    return builder.as_markup()


async def _show_manager_menu(restaurant, edit_target) -> None:
    group_status = "✅ группа привязана" if restaurant.group_chat_id else "❌ группа ещё не привязана"
    text = f"🧑‍💼 Панель администратора — «{restaurant.name}»\n{group_status}"
    await edit_target(text, reply_markup=manager_menu_kb(restaurant.id))


@router.message(Command("manager_help"))
async def cmd_manager_help(message: Message) -> None:
    await message.answer(MANAGER_HELP_TEXT)


@router.message(Command("manager"))
async def cmd_manager(message: Message) -> None:
    async with async_session() as session:
        restaurants = await crud.get_restaurants_managed_by(session, message.from_user.id)

    if not restaurants:
        await message.answer(
            "⛔ Вы не назначены администратором ни одного заведения. "
            "Обратитесь к администратору бота или другому администратору "
            "вашего заведения (команда /managers в группе)."
        )
        return

    if len(restaurants) > 1:
        await message.answer(
            "Вы администратор нескольких заведений. Выберите, с каким работать:",
            reply_markup=restaurant_picker_kb(restaurants),
        )
        return

    await _show_manager_menu(restaurants[0], message.answer)


@router.callback_query(F.data.startswith("manager_menu:"))
async def cb_manager_menu(callback: CallbackQuery) -> None:
    restaurant_id = int(callback.data.split(":")[1])
    async with async_session() as session:
        restaurant = await crud.get_restaurant_by_id(session, restaurant_id)
        if restaurant is None or not await crud.is_restaurant_manager(
            session, restaurant_id, callback.from_user.id
        ):
            await callback.answer("⛔ Нет доступа.", show_alert=True)
            return

    await _show_manager_menu(restaurant, callback.message.edit_text)
    await callback.answer()


@router.callback_query(F.data.startswith("manager_help:"))
async def cb_manager_help(callback: CallbackQuery) -> None:
    restaurant_id = int(callback.data.split(":")[1])
    async with async_session() as session:
        if not await crud.is_restaurant_manager(session, restaurant_id, callback.from_user.id):
            await callback.answer("⛔ Нет доступа.", show_alert=True)
            return

    builder = InlineKeyboardBuilder()
    builder.button(text="⬅️ Назад", callback_data=f"manager_menu:{restaurant_id}")
    await callback.message.edit_text(MANAGER_HELP_TEXT, reply_markup=builder.as_markup())
    await callback.answer()


async def build_employees_list_view(session, restaurant):
    """Собирает текст и клавиатуру списка сотрудников заведения. Вынесено
    отдельно, чтобы использовать и в обычной панели (cb_manager_employees),
    и при переходе из группы по кнопке «Список персонала»."""
    employees = await crud.get_employees_for_restaurant(session, restaurant.id)

    builder = InlineKeyboardBuilder()
    if not employees:
        text = "Пока ни один сотрудник не прикрепился к вашему заведению."
    else:
        text = f"👥 Сотрудники «{restaurant.name}» — нажмите на имя для подробностей:"
        for item in employees:
            user = item["user"]
            position = item["position"]
            position_text = f" — {position.name}" if position else ""
            builder.button(
                text=f"{display_name(user)}{position_text} ({item['avg_percentage']}%)",
                callback_data=f"manager_employee_detail:{restaurant.id}:{user.id}",
            )
    builder.button(text="⬅️ Назад", callback_data=f"manager_menu:{restaurant.id}")
    builder.adjust(1)
    return text, builder.as_markup()


@router.callback_query(F.data.startswith("manager_invite_link:"))
async def cb_manager_invite_link(callback: CallbackQuery) -> None:
    restaurant_id = int(callback.data.split(":")[1])
    async with async_session() as session:
        restaurant = await crud.get_restaurant_by_id(session, restaurant_id)
        if restaurant is None or not await crud.is_restaurant_manager(
            session, restaurant_id, callback.from_user.id
        ):
            await callback.answer("⛔ Нет доступа.", show_alert=True)
            return

    username = await get_bot_username(callback.bot)
    link = f"https://t.me/{username}?start=join_{restaurant_id}"

    await callback.message.edit_text(
        f"🔗 Личная ссылка для сотрудников «{restaurant.name}»:\n\n"
        f"`{link}`\n\n"
        "Отправьте её сотрудникам в WhatsApp, лично или любым удобным "
        "способом. Переход по ссылке сразу открывает личный чат с ботом "
        "и меню с тестами — без группы и лишних шагов.\n\n"
        "Нажмите на ссылку выше, чтобы скопировать её.",
        parse_mode="Markdown",
        reply_markup=manager_menu_kb(restaurant_id),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("manager_show_admins:"))
async def cb_manager_show_admins(callback: CallbackQuery) -> None:
    restaurant_id = int(callback.data.split(":")[1])
    async with async_session() as session:
        restaurant = await crud.get_restaurant_by_id(session, restaurant_id)
        if restaurant is None or not await crud.is_restaurant_manager(
            session, restaurant_id, callback.from_user.id
        ):
            await callback.answer("⛔ Нет доступа.", show_alert=True)
            return
        managers = await crud.get_restaurant_managers(session, restaurant_id)

    lines = [f"🧑‍💼 Администраторы «{restaurant.name}»:\n"]
    for manager in managers:
        lines.append(f"• {manager.name or 'без имени'} (ID {manager.telegram_id})")
    lines.append("\nЧтобы убрать администратора — нажмите на него ниже (последнего убрать нельзя).")

    await callback.message.edit_text(
        "\n".join(lines), reply_markup=_managers_list_kb(restaurant_id, managers)
    )
    await callback.answer()


@router.callback_query(F.data.startswith("manager_assign_start:"))
async def cb_manager_assign_start(callback: CallbackQuery) -> None:
    restaurant_id = int(callback.data.split(":")[1])
    async with async_session() as session:
        if not await crud.is_restaurant_manager(session, restaurant_id, callback.from_user.id):
            await callback.answer("⛔ Нет доступа.", show_alert=True)
            return
        employees = await crud.get_employees_for_restaurant(session, restaurant_id)

    if not employees:
        await callback.answer(
            "Пока никто из сотрудников не прикрепился к заведению.", show_alert=True
        )
        return

    await callback.message.edit_text(
        "Выберите сотрудника, которому нужно назначить должность:",
        reply_markup=_employees_kb(restaurant_id, employees),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("manager_employees:"))
async def cb_manager_employees(callback: CallbackQuery) -> None:
    restaurant_id = int(callback.data.split(":")[1])
    async with async_session() as session:
        restaurant = await crud.get_restaurant_by_id(session, restaurant_id)
        if restaurant is None or not await crud.is_restaurant_manager(
            session, restaurant_id, callback.from_user.id
        ):
            await callback.answer("⛔ Нет доступа.", show_alert=True)
            return
        text, kb = await build_employees_list_view(session, restaurant)

    await callback.message.edit_text(text, reply_markup=kb)
    await callback.answer()


@router.callback_query(F.data.startswith("manager_employee_detail:"))
async def cb_manager_employee_detail(callback: CallbackQuery) -> None:
    _, restaurant_id_str, user_id_str = callback.data.split(":")
    restaurant_id = int(restaurant_id_str)
    user_id = int(user_id_str)

    async with async_session() as session:
        if not await crud.is_restaurant_manager(session, restaurant_id, callback.from_user.id):
            await callback.answer("⛔ Нет доступа.", show_alert=True)
            return

        target_user = await crud.get_user_by_id(session, user_id)
        if target_user is None:
            await callback.answer("Сотрудник не найден.", show_alert=True)
            return

        stats = await crud.get_user_stats_for_restaurant(session, user_id, restaurant_id)
        position = (
            await crud.get_position_by_id(session, target_user.current_position_id)
            if target_user.current_position_id
            else None
        )
        exam_history = await crud.get_exam_history_for_user(session, user_id)

        # Резолвим telegram_id администраторов, выдавших коды, в имена
        issuer_names: dict[int, str] = {}
        for entry in exam_history:
            tid = entry["issued_by_telegram_id"]
            if tid is not None and tid not in issuer_names:
                issuer_user = await crud.get_user_by_telegram_id(session, tid)
                issuer_names[tid] = display_name(issuer_user) if issuer_user else f"ID {tid}"

    position_text = f"{position.emoji} {position.name}" if position else "не выбрана"
    lines = [
        f"👤 {display_name(target_user)} (ID {target_user.telegram_id})",
        f"Должность: {position_text}",
        f"Тестов пройдено: {stats['tests_completed']} | Средний %: {stats['avg_percentage']}",
        "",
        "🎓 История экзаменов:",
    ]
    if not exam_history:
        lines.append("Экзаменов ещё не было.")
    else:
        for entry in exam_history:
            status = "✅ Сдан" if entry["passed"] else "❌ Не сдан"
            issuer = issuer_names.get(entry["issued_by_telegram_id"], "неизвестно")
            date_str = entry["created_at"].strftime("%d.%m.%Y")
            lines.append(
                f"• {entry['position'].name}: {entry['correct_count']}/{entry['total_count']} "
                f"| {status} | код выдал: {issuer} | {date_str}"
            )

    text = "\n".join(lines)
    if len(text) > 3900:
        text = text[:3900] + "\n\n… (обрезано)"

    builder = InlineKeyboardBuilder()
    builder.button(text="⬅️ К сотрудникам", callback_data=f"manager_employees:{restaurant_id}")
    await callback.message.edit_text(text, reply_markup=builder.as_markup())
    await callback.answer()


@router.callback_query(F.data.startswith("manager_exam_position:"))
async def cb_manager_exam_position(callback: CallbackQuery) -> None:
    restaurant_id = int(callback.data.split(":")[1])
    async with async_session() as session:
        if not await crud.is_restaurant_manager(session, restaurant_id, callback.from_user.id):
            await callback.answer("⛔ Нет доступа.", show_alert=True)
            return
        positions = await crud.get_active_positions(session, restaurant_id)

    await callback.message.edit_text(
        "На какую должность выдать код на экзамен?",
        reply_markup=manager_exam_positions_kb(restaurant_id, positions),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("manager_gen_code:"))
async def cb_manager_gen_code(callback: CallbackQuery) -> None:
    _, restaurant_id_str, position_id_str = callback.data.split(":")
    restaurant_id = int(restaurant_id_str)
    position_id = int(position_id_str)

    async with async_session() as session:
        restaurant = await crud.get_restaurant_by_id(session, restaurant_id)
        if restaurant is None or not await crud.is_restaurant_manager(
            session, restaurant_id, callback.from_user.id
        ):
            await callback.answer("⛔ Нет доступа.", show_alert=True)
            return
        position = await crud.get_position_by_id(session, position_id)
        exam_code = await crud.create_exam_code(
            session,
            restaurant_id=restaurant_id,
            position_id=position_id,
            created_by_telegram_id=callback.from_user.id,
        )
        hard_questions = await crud.get_hard_questions_for_position(session, position_id)

    minutes = exam_code.time_limit_seconds // 60
    await callback.answer()
    await callback.message.answer(
        f"🎓 Код на экзамен по должности {position.emoji} {position.name}:\n\n"
        f"`{exam_code.code}`\n\n"
        f"Передайте этот код сотруднику. У него будет {minutes} мин. на "
        f"{len(hard_questions)} вопросов. Код одноразовый.",
        parse_mode="Markdown",
    )
    await _show_manager_menu(restaurant, callback.message.answer)
