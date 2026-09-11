from aiogram import Bot, F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message, WebAppInfo
from aiogram.utils.keyboard import InlineKeyboardBuilder

import config
from database import crud
from database.database import async_session
from handlers.restaurants import _managers_list_kb, _remove_employee_kb
from keyboards.keyboards import join_menu_kb, main_menu_kb, manager_menu_kb, restaurant_switch_kb
from services.rating import display_name
from utils import get_bot_username

router = Router(name="manager")

MANAGER_HELP_TEXT = (
    "📖 Как пользоваться панелью администратора\n\n"
    "🔗 Ссылка для персонала — личная ссылка вашего заведения. Отправьте "
    "её сотрудникам (WhatsApp, лично и т.д.). Переход по ней просит вашего "
    "подтверждения — вы получите запрос с кнопками «Одобрить»/«Отклонить», "
    "прежде чем человек получит доступ к тестам.\n\n"
    "🗑 Удалить персонал — убрать сотрудника из заведения.\n\n"
    "🧑‍💼 Администраторы заведения — добавить или убрать других "
    "администраторов (их может быть несколько).\n\n"
    "🎓 Выдать код на экзамен — выберите должность, бот сгенерирует "
    "одноразовый код. Передайте его сотруднику любым удобным способом.\n\n"
    "📋 Результаты тестов персонала теперь смотрятся на сайте — кнопка "
    "«🧑‍💼 Панель администратора» в личном меню вашего заведения → "
    "«Список персонала»."
)


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
    if message.chat.type != "private":
        await message.answer("Напишите мне это в личные сообщения: /manager")
        return

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
    # Ссылка персональная — привязана именно к вам как администратору.
    # Заявки по ней придут уведомлением только вам, а не всем
    # администраторам заведения разом (чтобы у остальных не "висели"
    # неактуальные кнопки после того, как кто-то уже принял решение).
    link = f"https://t.me/{username}?start=joinm_{restaurant_id}_{callback.from_user.id}"

    await callback.message.edit_text(
        f"🔗 Ваша личная ссылка для приглашения в «{restaurant.name}»:\n\n"
        f"`{link}`\n\n"
        "Отправьте её сотрудникам в WhatsApp, лично или любым удобным "
        "способом. Переход по ссылке сразу открывает личный чат с ботом "
        "и меню с тестами — без группы и лишних шагов. Заявки по этой "
        "ссылке придут уведомлением именно вам.\n\n"
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


@router.callback_query(F.data.startswith("manager_remove_start:"))
async def cb_manager_remove_start(callback: CallbackQuery) -> None:
    restaurant_id = int(callback.data.split(":")[1])
    async with async_session() as session:
        if not await crud.is_restaurant_manager(session, restaurant_id, callback.from_user.id):
            await callback.answer("⛔ Нет доступа.", show_alert=True)
            return
        employees = await crud.get_employees_for_restaurant(session, restaurant_id)

    if not employees:
        await callback.answer("Пока никто из сотрудников не прикрепился к заведению.", show_alert=True)
        return

    await callback.message.edit_text(
        "⚠️ Выберите сотрудника, которого нужно убрать из заведения "
        "(он потеряет доступ к тестам этого заведения):",
        reply_markup=_remove_employee_kb(restaurant_id, employees),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("manager_remove_confirm:"))
async def cb_manager_remove_confirm(callback: CallbackQuery) -> None:
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
        removed = await crud.remove_user_from_restaurant(session, restaurant_id, user_id)

    if not removed:
        await callback.answer("Сотрудник не найден.", show_alert=True)
        return

    await callback.answer("Сотрудник удалён из заведения")
    await callback.message.edit_text(
        f"✅ {display_name(target_user)} убран(а) из «{restaurant.name}».",
        reply_markup=manager_menu_kb(restaurant_id),
    )

    try:
        await callback.bot.send_message(
            chat_id=target_user.telegram_id,
            text=f"Вас удалили из заведения «{restaurant.name}». "
            "Чтобы снова получить доступ, обратитесь к администратору за новой ссылкой.",
        )
    except Exception:
        pass


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


# ---------- Архивирование заведения ----------

@router.callback_query(F.data.startswith("archive_restaurant_start:"))
async def cb_archive_restaurant_start(callback: CallbackQuery) -> None:
    restaurant_id = int(callback.data.split(":")[1])
    async with async_session() as session:
        restaurant = await crud.get_restaurant_by_id(session, restaurant_id)
        if restaurant is None or not await crud.is_restaurant_manager(
            session, restaurant_id, callback.from_user.id
        ):
            await callback.answer("⛔ Нет доступа.", show_alert=True)
            return

        existing = await crud.get_pending_archive_request(session, restaurant_id)
        if existing is not None:
            await callback.answer(
                "По этому заведению уже есть заявка на архивирование в процессе.",
                show_alert=True,
            )
            return

        managers = await crud.get_restaurant_managers(session, restaurant_id)

    builder = InlineKeyboardBuilder()
    if len(managers) == 1:
        text = (
            f"⚠️ Вы уверены, что хотите архивировать «{restaurant.name}»? "
            "Заведение станет неактивным (тесты, панель и рейтинг больше "
            "не будут доступны), но данные и история персонала сохранятся."
        )
        builder.button(text="🗄 Да, архивировать", callback_data=f"archive_solo_confirm:{restaurant_id}")
    else:
        text = (
            f"⚠️ Вы инициируете архивирование «{restaurant.name}». Так как "
            f"администраторов несколько ({len(managers)}), потребуется "
            "согласие каждого из них. Продолжить?"
        )
        builder.button(
            text="🗄 Да, отправить остальным на одобрение",
            callback_data=f"archive_initiate:{restaurant_id}",
        )
    builder.button(text="Отмена", callback_data=f"manager_menu:{restaurant_id}")
    builder.adjust(1)

    await callback.message.edit_text(text, reply_markup=builder.as_markup())
    await callback.answer()


@router.callback_query(F.data.startswith("archive_solo_confirm:"))
async def cb_archive_solo_confirm(callback: CallbackQuery) -> None:
    restaurant_id = int(callback.data.split(":")[1])
    async with async_session() as session:
        if not await crud.is_restaurant_manager(session, restaurant_id, callback.from_user.id):
            await callback.answer("⛔ Нет доступа.", show_alert=True)
            return
        restaurant = await crud.get_restaurant_by_id(session, restaurant_id)
        await crud.archive_restaurant(session, restaurant_id)

    await callback.answer("Заведение архивировано")
    await callback.message.edit_text(f"🗄 «{restaurant.name}» архивировано.")


@router.callback_query(F.data.startswith("archive_initiate:"))
async def cb_archive_initiate(callback: CallbackQuery, bot: Bot) -> None:
    restaurant_id = int(callback.data.split(":")[1])
    async with async_session() as session:
        if not await crud.is_restaurant_manager(session, restaurant_id, callback.from_user.id):
            await callback.answer("⛔ Нет доступа.", show_alert=True)
            return

        restaurant = await crud.get_restaurant_by_id(session, restaurant_id)
        managers = await crud.get_restaurant_managers(session, restaurant_id)
        request = await crud.create_archive_request(session, restaurant_id, callback.from_user.id)
        initiator_name = display_name_for_manager(managers, callback.from_user.id)

    await callback.answer()

    builder = InlineKeyboardBuilder()
    builder.button(
        text="📩 Написать в поддержку", callback_data=f"archive_support:{request.id}"
    )
    await callback.message.edit_text(
        f"⏳ Заявка на архивирование «{restaurant.name}» отправлена остальным "
        f"администраторам ({len(managers) - 1}). Как только все одобрят — "
        "заведение архивируется автоматически. Если кто-то из них "
        "недоступен — можно написать в поддержку.",
        reply_markup=builder.as_markup(),
    )

    vote_kb = InlineKeyboardBuilder()
    vote_kb.button(text="✅ Одобрить", callback_data=f"archive_vote_approve:{request.id}")
    vote_kb.button(text="❌ Отклонить", callback_data=f"archive_vote_decline:{request.id}")
    vote_kb.adjust(2)

    for manager in managers:
        if manager.telegram_id == callback.from_user.id:
            continue
        try:
            await bot.send_message(
                chat_id=manager.telegram_id,
                text=(
                    f"🗄 {initiator_name} предлагает архивировать заведение "
                    f"«{restaurant.name}». Требуется согласие всех "
                    "администраторов. Согласны?"
                ),
                reply_markup=vote_kb.as_markup(),
            )
        except Exception:
            pass


def display_name_for_manager(managers, telegram_id: int) -> str:
    for m in managers:
        if m.telegram_id == telegram_id:
            return m.name or f"ID {telegram_id}"
    return f"ID {telegram_id}"


@router.callback_query(F.data.startswith("archive_vote_approve:"))
async def cb_archive_vote_approve(callback: CallbackQuery, bot: Bot) -> None:
    await _handle_archive_vote(callback, bot, "approved")


@router.callback_query(F.data.startswith("archive_vote_decline:"))
async def cb_archive_vote_decline(callback: CallbackQuery, bot: Bot) -> None:
    await _handle_archive_vote(callback, bot, "declined")


async def _handle_archive_vote(callback: CallbackQuery, bot: Bot, decision: str) -> None:
    request_id = int(callback.data.split(":")[1])
    async with async_session() as session:
        request = await crud.get_archive_request_by_id(session, request_id)
        if request is None:
            await callback.answer("Заявка не найдена.", show_alert=True)
            return
        if not await crud.is_restaurant_manager(
            session, request.restaurant_id, callback.from_user.id
        ):
            await callback.answer("⛔ Нет доступа.", show_alert=True)
            return

        restaurant = await crud.get_restaurant_by_id(session, request.restaurant_id)
        outcome = await crud.cast_archive_vote(session, request_id, callback.from_user.id, decision)
        managers = await crud.get_restaurant_managers(session, request.restaurant_id)

    if outcome["status"] == "not_pending":
        await callback.answer("Эта заявка уже обработана.", show_alert=True)
        return

    await callback.answer("Голос учтён")

    if decision == "declined":
        await callback.message.edit_text(
            f"❌ Вы отклонили архивирование «{restaurant.name}»."
        )
        notify_text = (
            f"❌ Архивирование «{restaurant.name}» отклонено — "
            f"{display_name_for_manager(managers, callback.from_user.id)} не согласен(на). "
            "Заявка остановлена."
        )
    elif outcome["status"] == "approved":
        await callback.message.edit_text(
            f"✅ Вы одобрили архивирование «{restaurant.name}». Все "
            "администраторы согласны — заведение архивировано."
        )
        notify_text = f"🗄 «{restaurant.name}» архивировано — все администраторы согласились."
    else:
        await callback.message.edit_text(
            f"✅ Вы одобрили архивирование «{restaurant.name}». Ждём "
            f"остальных ({outcome['approved_count']}/{outcome['total_count']} уже согласны)."
        )
        notify_text = None

    if notify_text:
        for manager in managers:
            if manager.telegram_id == callback.from_user.id:
                continue
            try:
                await bot.send_message(chat_id=manager.telegram_id, text=notify_text)
            except Exception:
                pass


@router.callback_query(F.data.startswith("archive_support:"))
async def cb_archive_support(callback: CallbackQuery, bot: Bot) -> None:
    request_id = int(callback.data.split(":")[1])
    async with async_session() as session:
        request = await crud.get_archive_request_by_id(session, request_id)
        if request is None:
            await callback.answer("Заявка не найдена.", show_alert=True)
            return
        restaurant = await crud.get_restaurant_by_id(session, request.restaurant_id)

    await callback.answer("Сообщение отправлено в поддержку")

    if config.ADMIN_ID:
        builder = InlineKeyboardBuilder()
        builder.button(
            text="🗄 Заархивировать вручную", callback_data=f"archive_force:{request.id}"
        )
        try:
            await bot.send_message(
                chat_id=config.ADMIN_ID,
                text=(
                    f"📩 Запрос в поддержку: не все администраторы «{restaurant.name}» "
                    "отвечают на заявку об архивировании. Инициатор просит помощи."
                ),
                reply_markup=builder.as_markup(),
            )
        except Exception:
            pass


@router.callback_query(F.data.startswith("archive_force:"))
async def cb_archive_force(callback: CallbackQuery) -> None:
    if callback.from_user.id != config.ADMIN_ID:
        await callback.answer("⛔ Нет доступа.", show_alert=True)
        return

    request_id = int(callback.data.split(":")[1])
    async with async_session() as session:
        request = await crud.get_archive_request_by_id(session, request_id)
        if request is None or request.status != "pending":
            await callback.answer("Заявка уже обработана.", show_alert=True)
            return
        restaurant = await crud.get_restaurant_by_id(session, request.restaurant_id)
        request.status = "approved"
        await crud.archive_restaurant(session, request.restaurant_id)
        await session.commit()

    await callback.answer("Архивировано")
    await callback.message.edit_text(f"🗄 «{restaurant.name}» заархивировано вручную (через поддержку).")


# ---------- Менеджер покидает конкретное заведение ----------

@router.callback_query(F.data.startswith("manager_leave_ask:"))
async def cb_manager_leave_ask(callback: CallbackQuery) -> None:
    restaurant_id = int(callback.data.split(":")[1])
    async with async_session() as session:
        restaurant = await crud.get_restaurant_by_id(session, restaurant_id)
        if restaurant is None or not await crud.is_restaurant_manager(
            session, restaurant_id, callback.from_user.id
        ):
            await callback.answer("⛔ Нет доступа.", show_alert=True)
            return
        managers = await crud.get_restaurant_managers(session, restaurant_id)

    if len(managers) <= 1:
        await callback.answer(
            "Вы единственный администратор — нельзя оставить заведение "
            "совсем без администратора. Сначала добавьте другого.",
            show_alert=True,
        )
        return

    builder = InlineKeyboardBuilder()
    builder.button(
        text="🚪 Да, покинуть как администратор", callback_data=f"manager_leave_confirm:{restaurant_id}"
    )
    builder.button(text="Отмена", callback_data=f"manager_menu:{restaurant_id}")
    builder.adjust(1)
    await callback.message.edit_text(
        f"Вы уверены, что хотите покинуть «{restaurant.name}» как "
        "администратор? Вы потеряете права управления этим заведением "
        "(но не как сотрудник, если вы им тоже являетесь).",
        reply_markup=builder.as_markup(),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("manager_leave_confirm:"))
async def cb_manager_leave_confirm(callback: CallbackQuery, state: FSMContext) -> None:
    restaurant_id = int(callback.data.split(":")[1])
    async with async_session() as session:
        restaurant = await crud.get_restaurant_by_id(session, restaurant_id)
        removed = await crud.remove_restaurant_manager(session, restaurant_id, callback.from_user.id)
        if not removed:
            await callback.answer(
                "Не получилось — вы единственный администратор заведения.", show_alert=True
            )
            return

        # После выхода сразу показываем, что доступно дальше — другое
        # заведение (если администрирует ещё какое-то) или общее меню.
        options = await crud.get_user_restaurant_options(session, callback.from_user.id)

    await callback.answer("Вы больше не администратор этого заведения")
    await state.update_data(in_general_menu=False)

    if len(options) > 1:
        await callback.message.edit_text(
            f"🚪 Вы покинули «{restaurant.name}» как администратор. "
            "Вы связаны с несколькими заведениями — с каким работать?",
            reply_markup=restaurant_switch_kb([r for r, _ in options]),
        )
        return

    if len(options) == 1:
        other_restaurant, is_manager = options[0]
        username = await get_bot_username(callback.bot)
        await callback.message.edit_text(
            f"🚪 Вы покинули «{restaurant.name}» как администратор.\n\n"
            f"Меню «{other_restaurant.name}»:",
            reply_markup=join_menu_kb(username, other_restaurant.id, is_manager),
        )
        return

    await state.update_data(in_general_menu=True)
    await callback.message.edit_text(
        f"🚪 Вы покинули «{restaurant.name}» как администратор.\n\nГлавное меню:",
        reply_markup=main_menu_kb(),
    )
