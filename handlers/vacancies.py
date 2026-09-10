from aiogram import Bot, F, Router
from aiogram.exceptions import TelegramAPIError
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message

from config import VACANCIES_CHANNEL, vacancies_channel_url
from database import crud
from database.database import async_session
from keyboards.keyboards import cancel_publish_kb, main_menu_kb, vacancies_menu_kb
from services.rating import display_name

router = Router(name="vacancies")


class PublishVacancyStates(StatesGroup):
    # Пошаговый диалог публикации вакансии (доступен любому пользователю бота)
    waiting_title = State()
    waiting_description = State()
    waiting_salary = State()
    waiting_location = State()


@router.callback_query(F.data == "menu:vacancies")
async def cb_vacancies_menu(callback: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    channel_configured = bool(VACANCIES_CHANNEL)

    text = "💼 Вакансии\n\n"
    if channel_configured:
        text += (
            "🔍 «Поиск вакансии» откроет канал, где публикуются все объявления.\n"
            "📤 «Опубликовать вакансию» — разместить своё объявление в этом канале."
        )
    else:
        text += (
            "⚠️ Канал для вакансий ещё не настроен администратором "
            "(переменная VACANCIES_CHANNEL в .env).\n"
            "Публикация вакансий пока недоступна."
        )

    await callback.message.edit_text(
        text,
        reply_markup=vacancies_menu_kb(vacancies_channel_url(), channel_configured),
    )
    await callback.answer()


@router.callback_query(F.data == "vacancy_publish_start")
async def cb_publish_start(callback: CallbackQuery, state: FSMContext) -> None:
    if not VACANCIES_CHANNEL:
        await callback.answer(
            "Канал для вакансий пока не настроен администратором.", show_alert=True
        )
        return

    await state.set_state(PublishVacancyStates.waiting_title)
    await callback.message.edit_text(
        "Введите название вакансии (например, «Бармен в кофейню на Арбате»):",
        reply_markup=cancel_publish_kb(),
    )
    await callback.answer()


@router.message(PublishVacancyStates.waiting_title)
async def publish_title(message: Message, state: FSMContext) -> None:
    if not message.text or not message.text.strip():
        await message.answer("Пожалуйста, отправьте название текстом.", reply_markup=cancel_publish_kb())
        return
    await state.update_data(title=message.text.strip())
    await state.set_state(PublishVacancyStates.waiting_description)
    await message.answer(
        "Теперь отправьте описание вакансии (обязанности, требования и т.д.):",
        reply_markup=cancel_publish_kb(),
    )


@router.message(PublishVacancyStates.waiting_description)
async def publish_description(message: Message, state: FSMContext) -> None:
    if not message.text or not message.text.strip():
        await message.answer("Пожалуйста, отправьте описание текстом.", reply_markup=cancel_publish_kb())
        return
    await state.update_data(description=message.text.strip())
    await state.set_state(PublishVacancyStates.waiting_salary)
    await message.answer(
        "Укажите зарплату (или отправьте «-», если не хотите указывать):",
        reply_markup=cancel_publish_kb(),
    )


@router.message(PublishVacancyStates.waiting_salary)
async def publish_salary(message: Message, state: FSMContext) -> None:
    salary = (message.text or "").strip()
    await state.update_data(salary=None if salary == "-" else salary)
    await state.set_state(PublishVacancyStates.waiting_location)
    await message.answer(
        "Укажите локацию/адрес (или отправьте «-», если не хотите указывать):",
        reply_markup=cancel_publish_kb(),
    )


@router.message(PublishVacancyStates.waiting_location)
async def publish_location(message: Message, state: FSMContext, bot: Bot) -> None:
    location_raw = (message.text or "").strip()
    location = None if location_raw == "-" else location_raw
    data = await state.get_data()
    await state.clear()

    title = data["title"]
    description = data["description"]
    salary = data.get("salary")

    async with async_session() as session:
        user = await crud.get_or_create_user(
            session,
            telegram_id=message.from_user.id,
            username=message.from_user.username,
            full_name=message.from_user.full_name,
        )
        vacancy = await crud.create_vacancy(
            session,
            title=title,
            description=description,
            salary=salary,
            location=location,
            created_by_telegram_id=message.from_user.id,
            created_by_name=display_name(user),
        )

    # Собираем текст объявления для публикации в канал
    lines = [f"💼 {title}\n", description]
    if salary:
        lines.append(f"\n💰 Зарплата: {salary}")
    if location:
        lines.append(f"📍 Локация: {location}")
    lines.append(f"\nОпубликовал: {display_name(user)}")
    channel_text = "\n".join(lines)

    try:
        await bot.send_message(chat_id=VACANCIES_CHANNEL, text=channel_text)
    except TelegramAPIError as error:
        await message.answer(
            "❌ Не удалось опубликовать вакансию в канале.\n"
            "Проверьте, что бот добавлен в канал администратором с правом "
            f"публикации сообщений.\n\nТехническая причина: {error}",
            reply_markup=main_menu_kb(),
        )
        return

    await message.answer(
        f"✅ Вакансия «{vacancy.title}» опубликована!\n{vacancies_channel_url()}\n\n"
        "Главное меню:",
        reply_markup=main_menu_kb(),
    )
