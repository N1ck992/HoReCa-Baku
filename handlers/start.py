from aiogram import F, Router
from aiogram.filters import CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from database import crud
from database.database import async_session
from keyboards.keyboards import MAIN_MENU_BUTTON_TEXT, main_menu_kb, persistent_menu_kb

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
            "Напишите мне в личные сообщения /start, чтобы проходить тесты.",
            reply_markup=persistent_menu_kb(),
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
async def cmd_start(message: Message, state: FSMContext) -> None:
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
