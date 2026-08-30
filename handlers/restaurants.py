from aiogram import Bot, F, Router
from aiogram.filters import Command, CommandObject
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message
from aiogram.utils.keyboard import InlineKeyboardBuilder

from database import crud
from database.database import async_session
from services.rating import display_name

router = Router(name="restaurants")


class ManagersStates(StatesGroup):
    # Ввод Telegram ID нового администратора (после /managers -> ➕ Добавить)
    waiting_new_manager_id = State()


async def _require_group_manager(message_or_callback, chat_id: int, telegram_id: int):
    """Общая проверка для команд/кнопок, доступных только администратору
    заведения внутри его группы. Возвращает restaurant или None (и уже сам
    отправляет пользователю объяснение, если что-то не так)."""
    async with async_session() as session:
        restaurant = await crud.get_restaurant_by_group_chat_id(session, chat_id)
        if restaurant is None:
            return None, "Эта группа пока не привязана как заведение."

        is_manager = await crud.is_restaurant_manager(session, restaurant.id, telegram_id)
        if not is_manager:
            return None, "⛔ Эта команда доступна только администраторам заведения."

        return restaurant, None


@router.message(Command("link_restaurant"))
async def cmd_link_restaurant(message: Message, command: CommandObject) -> None:
    """Администратор отправляет эту команду ВНУТРИ своей группы заведения:
    /link_restaurant <id_заведения>
    ID заведения даёт глобальный администратор бота после создания
    заведения через /admin → 🏢 Рестораны → ➕ Добавить заведение (или
    после одобрения заявки через ➕ Добавить заведение в главном меню).
    """
    if message.chat.type not in ("group", "supergroup"):
        await message.answer(
            "Эту команду нужно отправить внутри Telegram-группы вашего заведения, "
            "а не в личных сообщениях боту."
        )
        return

    if not command.args or not command.args.strip().isdigit():
        await message.answer(
            "Использование: /link_restaurant <id_заведения>\n"
            "ID заведения вам должен был сообщить администратор бота."
        )
        return

    restaurant_id = int(command.args.strip())

    async with async_session() as session:
        restaurant = await crud.get_restaurant_by_id(session, restaurant_id)
        if restaurant is None:
            await message.answer(f"Заведение с ID {restaurant_id} не найдено.")
            return

        is_manager = await crud.is_restaurant_manager(session, restaurant.id, message.from_user.id)
        if not is_manager:
            await message.answer(
                "⛔ Только администратор, назначенный для этого заведения, "
                "может привязать группу."
            )
            return

        if restaurant.group_chat_id is not None and restaurant.group_chat_id != message.chat.id:
            await message.answer(
                "⚠️ У этого заведения уже привязана другая группа. "
                "Обратитесь к администратору бота, если нужно перепривязать."
            )
            return

        await crud.set_restaurant_group_chat_id(session, restaurant.id, message.chat.id)

    await message.answer(
        f"✅ Группа привязана к заведению «{restaurant.name}»!\n\n"
        "Теперь любой сотрудник, кто отправит /start в этой группе, "
        "будет автоматически прикреплён к заведению.\n\n"
        "Полезные команды прямо в этой группе:\n"
        "/assign — назначить сотруднику должность\n"
        "/managers — добавить или убрать администратора\n"
        "/manager_help — как пользоваться ботом администратору"
    )


# ---------- Назначение должностей сотрудникам (прямо в группе) ----------

def _employees_kb(restaurant_id: int, employees: list[dict]):
    builder = InlineKeyboardBuilder()
    for item in employees:
        user = item["user"]
        position = item["position"]
        position_text = f" ({position.name})" if position else ""
        builder.button(
            text=f"{display_name(user)}{position_text}",
            callback_data=f"assign_pick_emp:{restaurant_id}:{user.id}",
        )
    builder.adjust(1)
    return builder.as_markup()


def _positions_kb(restaurant_id: int, user_id: int, positions):
    builder = InlineKeyboardBuilder()
    for position in positions:
        builder.button(
            text=f"{position.emoji} {position.name}",
            callback_data=f"assign_set_position:{restaurant_id}:{user_id}:{position.id}",
        )
    builder.adjust(1)
    return builder.as_markup()


@router.message(Command("assign"))
async def cmd_assign(message: Message) -> None:
    """Администратор отправляет /assign ВНУТРИ группы заведения, чтобы
    назначить сотруднику должность (бармен, официант, хостес и т.д.)."""
    if message.chat.type not in ("group", "supergroup"):
        await message.answer(
            "Эту команду нужно отправить внутри Telegram-группы вашего заведения."
        )
        return

    restaurant, error = await _require_group_manager(message, message.chat.id, message.from_user.id)
    if error:
        await message.answer(error)
        return

    async with async_session() as session:
        employees = await crud.get_employees_for_restaurant(session, restaurant.id)

    if not employees:
        await message.answer(
            "Пока никто из сотрудников не прикрепился к заведению "
            "(они должны отправить /start в этой группе)."
        )
        return

    await message.answer(
        "Выберите сотрудника, которому нужно назначить должность:",
        reply_markup=_employees_kb(restaurant.id, employees),
    )


@router.callback_query(F.data.startswith("assign_pick_emp:"))
async def cb_assign_pick_employee(callback: CallbackQuery) -> None:
    _, restaurant_id_str, user_id_str = callback.data.split(":")
    restaurant_id = int(restaurant_id_str)
    user_id = int(user_id_str)

    async with async_session() as session:
        restaurant = await crud.get_restaurant_by_id(session, restaurant_id)
        if restaurant is None or not await crud.is_restaurant_manager(
            session, restaurant_id, callback.from_user.id
        ):
            await callback.answer("⛔ Нет доступа.", show_alert=True)
            return

        target_user = await crud.get_user_by_id(session, user_id)
        if target_user is None:
            await callback.answer("Сотрудник не найден.", show_alert=True)
            return

        positions = await crud.get_active_positions(session, restaurant_id)

    if not positions:
        await callback.answer("Должности пока не настроены.", show_alert=True)
        return

    await callback.answer()
    await callback.message.edit_text(
        f"Выберите должность для {display_name(target_user)}:",
        reply_markup=_positions_kb(restaurant_id, user_id, positions),
    )


@router.callback_query(F.data.startswith("assign_set_position:"))
async def cb_assign_set_position(callback: CallbackQuery) -> None:
    _, restaurant_id_str, user_id_str, position_id_str = callback.data.split(":")
    restaurant_id = int(restaurant_id_str)
    user_id = int(user_id_str)
    position_id = int(position_id_str)

    async with async_session() as session:
        restaurant = await crud.get_restaurant_by_id(session, restaurant_id)
        if restaurant is None or not await crud.is_restaurant_manager(
            session, restaurant_id, callback.from_user.id
        ):
            await callback.answer("⛔ Нет доступа.", show_alert=True)
            return

        target_user = await crud.get_user_by_id(session, user_id)
        position = await crud.get_position_by_id(session, position_id)
        if target_user is None or position is None:
            await callback.answer("Не найдено.", show_alert=True)
            return

        await crud.set_user_position(session, target_user, position.id)

    await callback.answer("Готово!")
    await callback.message.edit_text(
        f"✅ {display_name(target_user)} назначен(а) на должность "
        f"{position.emoji} {position.name}."
    )


# ---------- Несколько администраторов (/managers, прямо в группе) ----------

def _managers_list_kb(restaurant_id: int, managers):
    builder = InlineKeyboardBuilder()
    for manager in managers:
        builder.button(
            text=f"🗑 {manager.name or manager.telegram_id}",
            callback_data=f"managers_remove:{restaurant_id}:{manager.telegram_id}",
        )
    builder.button(text="➕ Добавить администратора", callback_data=f"managers_add_start:{restaurant_id}")
    builder.adjust(1)
    return builder.as_markup()


@router.message(Command("managers"))
async def cmd_managers(message: Message, state: FSMContext) -> None:
    """Список администраторов заведения — с кнопками добавить/убрать.
    Доступно любому текущему администратору, прямо в группе заведения."""
    if message.chat.type not in ("group", "supergroup"):
        await message.answer(
            "Эту команду нужно отправить внутри Telegram-группы вашего заведения."
        )
        return

    await state.clear()
    restaurant, error = await _require_group_manager(message, message.chat.id, message.from_user.id)
    if error:
        await message.answer(error)
        return

    async with async_session() as session:
        managers = await crud.get_restaurant_managers(session, restaurant.id)

    lines = [f"👥 Администраторы «{restaurant.name}»:\n"]
    for manager in managers:
        lines.append(f"• {manager.name or 'без имени'} (ID {manager.telegram_id})")
    lines.append("\nЧтобы убрать администратора — нажмите на него ниже (последнего убрать нельзя).")

    await message.answer("\n".join(lines), reply_markup=_managers_list_kb(restaurant.id, managers))


@router.callback_query(F.data.startswith("managers_remove:"))
async def cb_managers_remove(callback: CallbackQuery) -> None:
    _, restaurant_id_str, telegram_id_str = callback.data.split(":")
    restaurant_id = int(restaurant_id_str)
    target_telegram_id = int(telegram_id_str)

    async with async_session() as session:
        restaurant = await crud.get_restaurant_by_id(session, restaurant_id)
        if restaurant is None or not await crud.is_restaurant_manager(
            session, restaurant_id, callback.from_user.id
        ):
            await callback.answer("⛔ Нет доступа.", show_alert=True)
            return

        removed = await crud.remove_restaurant_manager(session, restaurant_id, target_telegram_id)
        if not removed:
            await callback.answer(
                "Нельзя убрать последнего администратора заведения.", show_alert=True
            )
            return

        managers = await crud.get_restaurant_managers(session, restaurant_id)

    await callback.answer("Администратор удалён")
    lines = [f"👥 Администраторы «{restaurant.name}»:\n"]
    for manager in managers:
        lines.append(f"• {manager.name or 'без имени'} (ID {manager.telegram_id})")
    await callback.message.edit_text(
        "\n".join(lines), reply_markup=_managers_list_kb(restaurant_id, managers)
    )


@router.callback_query(F.data.startswith("managers_add_start:"))
async def cb_managers_add_start(callback: CallbackQuery, state: FSMContext) -> None:
    restaurant_id = int(callback.data.split(":")[1])

    async with async_session() as session:
        if not await crud.is_restaurant_manager(session, restaurant_id, callback.from_user.id):
            await callback.answer("⛔ Нет доступа.", show_alert=True)
            return

    await state.set_state(ManagersStates.waiting_new_manager_id)
    await state.update_data(restaurant_id=restaurant_id)
    await callback.answer()
    await callback.message.answer(
        "Отправьте Telegram ID нового администратора (узнать можно через @userinfobot)."
    )


@router.message(ManagersStates.waiting_new_manager_id)
async def process_new_manager_id(message: Message, state: FSMContext, bot: Bot) -> None:
    if not message.text or not message.text.strip().isdigit():
        await message.answer("Telegram ID — это просто число. Отправьте, пожалуйста, ещё раз.")
        return

    new_manager_id = int(message.text.strip())
    data = await state.get_data()
    restaurant_id = data["restaurant_id"]
    await state.clear()

    async with async_session() as session:
        if not await crud.is_restaurant_manager(session, restaurant_id, message.from_user.id):
            await message.answer("⛔ Нет доступа.")
            return

        restaurant = await crud.get_restaurant_by_id(session, restaurant_id)
        existing_user = await crud.get_user_by_telegram_id(session, new_manager_id)
        new_name = display_name(existing_user) if existing_user else None

        added = await crud.add_restaurant_manager(
            session,
            restaurant_id=restaurant_id,
            telegram_id=new_manager_id,
            name=new_name,
            added_by_telegram_id=message.from_user.id,
        )

    if added is None:
        await message.answer("Этот пользователь уже администратор заведения.")
        return

    await message.answer(
        f"✅ {new_name or new_manager_id} добавлен(а) администратором «{restaurant.name}»."
    )

    try:
        await bot.send_message(
            chat_id=new_manager_id,
            text=(
                f"🧑‍💼 Вас назначили администратором заведения «{restaurant.name}».\n\n"
                f"Напишите мне /manager, чтобы открыть панель управления, или "
                f"/manager_help — короткая инструкция, что вы теперь можете делать."
            ),
        )
    except Exception:
        pass
