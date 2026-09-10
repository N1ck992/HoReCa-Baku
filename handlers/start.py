from aiogram import F, Router
from aiogram.filters import CommandObject, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message
from aiogram.utils.keyboard import InlineKeyboardBuilder

import config
from database import crud
from database.database import async_session
from handlers.exams import ExamStates
from handlers.manager import _show_manager_menu
from handlers.profile import build_profile_view
from keyboards.keyboards import (
    MAIN_MENU_BUTTON_TEXT,
    exam_entry_kb,
    group_menu_kb,
    join_menu_kb,
    main_menu_kb,
    persistent_menu_kb,
    positions_kb,
    webapp_open_kb,
)
from utils import get_bot_username

router = Router(name="start")

WELCOME_TEXT = (
    "👋 Добро пожаловать в бота для тестирования сотрудников!\n\n"
    "Здесь вы можете выбрать должность, пройти тесты по своей профессии "
    "и увидеть свой рейтинг среди коллег."
)


async def run_start_logic(message: Message, state: FSMContext) -> None:
    """Общая логика /start и постоянной кнопки '🏠 Главное меню' — работает
    одинаково что по команде, что по нажатию кнопки, что в личке, что
    в группе заведения."""
    await state.clear()

    # Сообщение отправлено внутри группы заведения — привязываем сотрудника
    # к этому заведению по ID группы (группу привязывает менеджер командой
    # /link_restaurant, см. handlers/restaurants.py).
    if message.chat.type in ("group", "supergroup"):
        async with async_session() as session:
            restaurant = await crud.get_restaurant_by_group_chat_id(session, message.chat.id)
            if restaurant is None:
                await message.answer(
                    "Эта группа пока не привязана как заведение. "
                    "Обратитесь к администратору.",
                    reply_markup=persistent_menu_kb(),
                )
                return

            user = await crud.get_or_create_user(
                session,
                telegram_id=message.from_user.id,
                username=message.from_user.username,
                full_name=message.from_user.full_name,
            )
            await crud.set_user_restaurant(session, user, restaurant.id)

        await message.answer(
            f"✅ Вы прикреплены к заведению «{restaurant.name}»!\n"
            "Пользуйтесь кнопками ниже — каждая откроет нужный раздел лично "
            "вам в личных сообщениях с ботом 👇",
            reply_markup=persistent_menu_kb(),
        )
        username = await get_bot_username(message.bot)
        await message.answer(
            f"📌 Меню заведения «{restaurant.name}»:",
            reply_markup=group_menu_kb(username, restaurant.id),
        )
        return

    # Обычная логика в личных сообщениях
    async with async_session() as session:
        user = await crud.get_or_create_user(
            session,
            telegram_id=message.from_user.id,
            username=message.from_user.username,
            full_name=message.from_user.full_name,
        )

        # Если человек уже привязан к заведению (как сотрудник или как
        # менеджер) — сразу показываем меню этого заведения вместо общего
        # гостевого меню с "Добавить заведение"/"Вакансии", которые ему
        # уже не нужны. Гостевое меню остаётся только у тех, кто вообще
        # ни к какому заведению не привязан.
        restaurant_id = user.restaurant_id
        is_manager = False
        if restaurant_id is not None:
            is_manager = await crud.is_restaurant_manager(session, restaurant_id, message.from_user.id)
        else:
            managed = await crud.get_restaurants_managed_by(session, message.from_user.id)
            if len(managed) == 1:
                restaurant_id = managed[0].id
                is_manager = True

        restaurant = (
            await crud.get_restaurant_by_id(session, restaurant_id) if restaurant_id else None
        )

    await message.answer(WELCOME_TEXT, reply_markup=persistent_menu_kb())

    if restaurant is not None:
        username = await get_bot_username(message.bot)
        await message.answer(
            f"Меню «{restaurant.name}»:",
            reply_markup=join_menu_kb(username, restaurant.id, is_manager),
        )
        return

    await message.answer("Главное меню:", reply_markup=main_menu_kb())


@router.message(CommandStart())
async def cmd_start(message: Message, state: FSMContext, command: CommandObject) -> None:
    payload = (command.args or "").strip()

    # Если пришли по кнопке из группы заведения — сразу открываем нужный
    # раздел в личке, минуя главное меню. Работает только в личных
    # сообщениях: в группе /start всегда прикрепляет к заведению группы.
    # Формат payload: "<действие>_<id_заведения>", например "tests_5".
    action, _, rid_str = payload.rpartition("_")
    if action and rid_str.isdigit() and message.chat.type == "private":
        restaurant_id = int(rid_str)
        await state.clear()

        # ---------- Персональная ссылка-приглашение (без группы) ----------
        if action == "join":
            async with async_session() as session:
                restaurant = await crud.get_restaurant_by_id(session, restaurant_id)
                if restaurant is None:
                    await message.answer("Эта ссылка больше не действительна.")
                    return

                is_manager = await crud.is_restaurant_manager(
                    session, restaurant_id, message.from_user.id
                )
                user = await crud.get_or_create_user(
                    session,
                    telegram_id=message.from_user.id,
                    username=message.from_user.username,
                    full_name=message.from_user.full_name,
                )
                already_staff = is_manager or user.restaurant_id == restaurant_id

                if not already_staff:
                    pending = await crud.get_pending_join_request(
                        session, restaurant_id, message.from_user.id
                    )

            await message.answer(WELCOME_TEXT, reply_markup=persistent_menu_kb())

            # Менеджеров и уже одобренных сотрудников пускаем сразу —
            # подтверждение нужно только новым людям.
            if already_staff:
                username = await get_bot_username(message.bot)
                await message.answer(
                    f"👋 С возвращением в «{restaurant.name}»! Выберите, что нужно:",
                    reply_markup=join_menu_kb(username, restaurant_id, is_manager),
                )
                return

            if pending is not None:
                await message.answer(
                    f"⏳ Ваш запрос на вступление в «{restaurant.name}» уже отправлен "
                    "администратору. Дождитесь подтверждения — бот пришлёт "
                    "сообщение, как только вас одобрят."
                )
                return

            # Новый человек — создаём заявку и уведомляем всех менеджеров.
            async with async_session() as session:
                request = await crud.create_join_request(
                    session,
                    restaurant_id=restaurant_id,
                    telegram_id=message.from_user.id,
                    telegram_name=message.from_user.full_name,
                )
                managers = await crud.get_restaurant_managers(session, restaurant_id)

            await message.answer(
                f"⏳ Ваш запрос на вступление в «{restaurant.name}» отправлен "
                "администратору заведения. Как только вас подтвердят, бот "
                "пришлёт сообщение с меню."
            )

            builder = InlineKeyboardBuilder()
            builder.button(text="✅ Одобрить", callback_data=f"join_request_approve:{request.id}")
            builder.button(text="❌ Отклонить", callback_data=f"join_request_reject:{request.id}")
            builder.adjust(2)
            notify_text = (
                f"🔔 Новый запрос на вступление в «{restaurant.name}»:\n\n"
                f"{message.from_user.full_name or 'Без имени'} "
                f"(ID {message.from_user.id})"
            )
            for manager in managers:
                try:
                    await message.bot.send_message(
                        chat_id=manager.telegram_id, text=notify_text, reply_markup=builder.as_markup()
                    )
                except Exception:
                    pass
            return

        # ---------- Кнопки персонала: прикрепляем к заведению и открываем нужный раздел ----------
        if action in ("profile", "tests", "examcode"):
            async with async_session() as session:
                user = await crud.get_or_create_user(
                    session,
                    telegram_id=message.from_user.id,
                    username=message.from_user.username,
                    full_name=message.from_user.full_name,
                )
                await crud.set_user_restaurant(session, user, restaurant_id)

            if action == "tests":
                await message.answer(WELCOME_TEXT, reply_markup=persistent_menu_kb())

                if config.WEBAPP_URL:
                    webapp_link = f"{config.WEBAPP_URL}?restaurant_id={restaurant_id}&screen=tests"
                    await message.answer(
                        "Нажмите кнопку ниже, чтобы открыть тест:",
                        reply_markup=webapp_open_kb(webapp_link, "🎓 Открыть тест"),
                    )
                    return

                # Запасной вариант, если ссылка на сайт ещё не настроена —
                # старое текстовое меню выбора должности прямо в чате.
                async with async_session() as session:
                    positions = await crud.get_active_positions(session, restaurant_id)
                if not positions:
                    await message.answer(
                        "Для вашего заведения пока не настроены должности с тестами."
                    )
                    return
                await message.answer("Выберите должность:", reply_markup=positions_kb(positions))
                return

            if action == "examcode":
                await message.answer(WELCOME_TEXT, reply_markup=persistent_menu_kb())

                if config.WEBAPP_URL:
                    webapp_link = f"{config.WEBAPP_URL}?restaurant_id={restaurant_id}&screen=examcode"
                    await message.answer(
                        "Нажмите кнопку ниже, чтобы открыть экзамен:",
                        reply_markup=webapp_open_kb(webapp_link, "🎓 Открыть экзамен"),
                    )
                    return

                # Запасной вариант — старый текстовый ввод кода прямо в чате.
                await state.set_state(ExamStates.entering_code)
                await message.answer(
                    "🎓 Введите одноразовый код на экзамен, который вам выдал "
                    "менеджер, или запросите код прямо сейчас.",
                    reply_markup=exam_entry_kb(),
                )
                return

            if action == "profile":
                await message.answer(WELCOME_TEXT, reply_markup=persistent_menu_kb())

                if config.WEBAPP_URL:
                    webapp_link = f"{config.WEBAPP_URL}?restaurant_id={restaurant_id}&screen=profile"
                    await message.answer(
                        "Нажмите кнопку ниже, чтобы открыть профиль:",
                        reply_markup=webapp_open_kb(webapp_link, "👤 Открыть профиль"),
                    )
                    return

                # Запасной вариант — старый текстовый профиль.
                async with async_session() as session:
                    text, kb = await build_profile_view(
                        session, message.from_user.id, message.from_user.username, message.from_user.full_name
                    )
                await message.answer(text, reply_markup=kb)
                return

        # ---------- Панель администратора: только для реальных менеджеров заведения ----------
        if action == "manageropen":
            async with async_session() as session:
                restaurant = await crud.get_restaurant_by_id(session, restaurant_id)
                is_manager = restaurant is not None and await crud.is_restaurant_manager(
                    session, restaurant_id, message.from_user.id
                )
            if not is_manager:
                await message.answer(
                    "⛔ Эта кнопка доступна только администраторам заведения.",
                    reply_markup=persistent_menu_kb(),
                )
                return

            await message.answer(WELCOME_TEXT, reply_markup=persistent_menu_kb())

            if config.WEBAPP_URL:
                webapp_link = f"{config.WEBAPP_URL}?restaurant_id={restaurant_id}&screen=admin"
                await message.answer(
                    "Нажмите кнопку ниже, чтобы открыть панель администратора:",
                    reply_markup=webapp_open_kb(webapp_link, "🧑‍💼 Открыть панель"),
                )
                return

            # Запасной вариант — старая текстовая панель администратора.
            await _show_manager_menu(restaurant, message.answer)
            return

    await run_start_logic(message, state)


@router.message(F.text == MAIN_MENU_BUTTON_TEXT)
async def btn_main_menu(message: Message, state: FSMContext) -> None:
    """Нажатие постоянной кнопки. Если человек сейчас привязан к
    заведению — сначала спрашиваем подтверждение, потому что переход в
    общее меню бота "выводит" его из интерфейса своего заведения. Для
    гостей без привязки подтверждение не нужно — им и так некуда
    "выходить"."""
    async with async_session() as session:
        user = await crud.get_or_create_user(
            session,
            telegram_id=message.from_user.id,
            username=message.from_user.username,
            full_name=message.from_user.full_name,
        )
        has_restaurant_context = user.restaurant_id is not None
        if not has_restaurant_context:
            managed = await crud.get_restaurants_managed_by(session, message.from_user.id)
            has_restaurant_context = len(managed) > 0

    if not has_restaurant_context:
        await run_start_logic(message, state)
        return

    builder = InlineKeyboardBuilder()
    builder.button(text="Да, выйти в общее меню", callback_data="confirm_leave_to_general")
    builder.button(text="Остаться", callback_data="cancel_leave_to_general")
    builder.adjust(1)
    await message.answer(
        "⚠️ Вы сейчас в меню своего заведения. Общее меню бота содержит "
        "пробный тест, общий рейтинг и вакансии — не относится к вашему "
        "заведению. Выйти туда?",
        reply_markup=builder.as_markup(),
    )


@router.callback_query(F.data == "confirm_leave_to_general")
async def cb_confirm_leave_to_general(callback: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    await callback.message.edit_text("Главное меню:", reply_markup=main_menu_kb())
    await callback.answer()


@router.callback_query(F.data == "cancel_leave_to_general")
async def cb_cancel_leave_to_general(callback: CallbackQuery) -> None:
    await callback.message.delete()
    await callback.answer("Остаётесь в меню заведения")


@router.callback_query(F.data.startswith("join_request_approve:"))
async def cb_join_request_approve(callback: CallbackQuery) -> None:
    request_id = int(callback.data.split(":")[1])
    async with async_session() as session:
        request = await crud.get_join_request_by_id(session, request_id)
        if request is None or request.status != "pending":
            await callback.answer("Заявка уже обработана.", show_alert=True)
            return
        if not await crud.is_restaurant_manager(session, request.restaurant_id, callback.from_user.id):
            await callback.answer("⛔ Нет доступа.", show_alert=True)
            return

        restaurant = await crud.get_restaurant_by_id(session, request.restaurant_id)
        user = await crud.get_or_create_user(
            session, telegram_id=request.telegram_id, username=None, full_name=request.telegram_name
        )
        await crud.set_user_restaurant(session, user, request.restaurant_id)
        await crud.set_join_request_status(session, request_id, "approved")

    await callback.message.edit_text(
        f"✅ Заявка от {request.telegram_name or request.telegram_id} одобрена."
    )
    await callback.answer()

    try:
        username = await get_bot_username(callback.bot)
        await callback.bot.send_message(
            chat_id=request.telegram_id,
            text=f"✅ Вас подтвердили в «{restaurant.name}»! Выберите, что нужно:",
            reply_markup=join_menu_kb(username, request.restaurant_id, False),
        )
    except Exception:
        pass


@router.callback_query(F.data.startswith("join_request_reject:"))
async def cb_join_request_reject(callback: CallbackQuery) -> None:
    request_id = int(callback.data.split(":")[1])
    async with async_session() as session:
        request = await crud.get_join_request_by_id(session, request_id)
        if request is None or request.status != "pending":
            await callback.answer("Заявка уже обработана.", show_alert=True)
            return
        if not await crud.is_restaurant_manager(session, request.restaurant_id, callback.from_user.id):
            await callback.answer("⛔ Нет доступа.", show_alert=True)
            return
        await crud.set_join_request_status(session, request_id, "rejected")

    await callback.message.edit_text(
        f"❌ Заявка от {request.telegram_name or request.telegram_id} отклонена."
    )
    await callback.answer()

    try:
        await callback.bot.send_message(
            chat_id=request.telegram_id,
            text="❌ Ваш запрос на вступление отклонён администратором заведения.",
        )
    except Exception:
        pass


@router.callback_query(F.data == "menu:main")
async def cb_main_menu(callback: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    await callback.message.edit_text("Главное меню:", reply_markup=main_menu_kb())
    await callback.answer()
