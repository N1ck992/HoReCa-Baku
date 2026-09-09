from aiogram import F, Router
from aiogram.filters import CommandObject, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

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
        show_exam_button = user.restaurant_id is not None

    # Reply-клавиатуру (постоянную кнопку под полем ввода) и инлайн-меню
    # Telegram не может показать в одном сообщении — отправляем отдельно.
    await message.answer(WELCOME_TEXT, reply_markup=persistent_menu_kb())
    await message.answer("Главное меню:", reply_markup=main_menu_kb(show_exam_button))


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
    await run_start_logic(message, state)


@router.callback_query(F.data == "menu:main")
async def cb_main_menu(callback: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    async with async_session() as session:
        user = await crud.get_or_create_user(
            session,
            telegram_id=callback.from_user.id,
            username=callback.from_user.username,
            full_name=callback.from_user.full_name,
        )
        show_exam_button = user.restaurant_id is not None
    await callback.message.edit_text(
        "Главное меню:", reply_markup=main_menu_kb(show_exam_button)
    )
    await callback.answer()
