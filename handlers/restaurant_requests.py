from aiogram import Bot, F, Router
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message
from aiogram.utils.keyboard import InlineKeyboardBuilder

from config import ADMIN_ID
from database import crud
from database.database import async_session
from keyboards.keyboards import back_to_main_kb, main_menu_kb
from services.rating import display_name
from utils import get_bot_username

router = Router(name="restaurant_requests")


class AddRestaurantRequestStates(StatesGroup):
    waiting_name = State()


def _request_decision_kb(request_id: int):
    builder = InlineKeyboardBuilder()
    builder.button(text="✅ Одобрить", callback_data=f"restaurant_request_approve:{request_id}")
    builder.button(text="❌ Отклонить", callback_data=f"restaurant_request_reject:{request_id}")
    builder.adjust(2)
    return builder.as_markup()


@router.callback_query(F.data == "menu:add_restaurant")
async def cb_add_restaurant_start(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(AddRestaurantRequestStates.waiting_name)
    await callback.message.edit_text(
        "➕ Введите название вашего заведения. Заявку рассмотрит "
        "администратор бота, после одобрения вы станете менеджером "
        "этого заведения.",
        reply_markup=back_to_main_kb(),
    )
    await callback.answer()


@router.message(AddRestaurantRequestStates.waiting_name)
async def process_restaurant_name(message: Message, state: FSMContext, bot: Bot) -> None:
    name = (message.text or "").strip()
    if not name:
        await message.answer("Пожалуйста, отправьте название текстом.")
        return

    await state.clear()

    async with async_session() as session:
        user = await crud.get_or_create_user(
            session,
            telegram_id=message.from_user.id,
            username=message.from_user.username,
            full_name=message.from_user.full_name,
        )
        request = await crud.create_restaurant_request(
            session,
            name=name,
            requested_by_telegram_id=message.from_user.id,
            requested_by_name=display_name(user),
        )

    await message.answer(
        f"✅ Заявка на заведение «{name}» отправлена администратору. "
        "Мы сообщим вам, как только её рассмотрят.",
        reply_markup=main_menu_kb(),
    )

    if ADMIN_ID != 0:
        try:
            await bot.send_message(
                chat_id=ADMIN_ID,
                text=(
                    f"🏢 Новая заявка на заведение\n\n"
                    f"Название: {request.name}\n"
                    f"От: {display_name(user)} (Telegram ID {message.from_user.id})"
                ),
                reply_markup=_request_decision_kb(request.id),
            )
        except Exception:
            pass  # если у админа не открыт диалог с ботом — заявка всё равно сохранена в базе


@router.callback_query(F.data.startswith("restaurant_request_approve:"))
async def cb_request_approve(callback: CallbackQuery, bot: Bot) -> None:
    if ADMIN_ID == 0 or callback.from_user.id != ADMIN_ID:
        await callback.answer("⛔ Нет доступа.", show_alert=True)
        return

    request_id = int(callback.data.split(":")[1])
    async with async_session() as session:
        request = await crud.get_restaurant_request_by_id(session, request_id)
        if request is None:
            await callback.answer("Заявка не найдена.", show_alert=True)
            return
        if request.status != "pending":
            await callback.answer("Эта заявка уже обработана.", show_alert=True)
            return

        restaurant = await crud.create_restaurant(
            session, request.name, request.requested_by_telegram_id, request.requested_by_name
        )
        await crud.set_restaurant_request_status(session, request.id, "approved")

    await callback.message.edit_text(
        f"✅ Заявка одобрена. Заведение «{restaurant.name}» создано (ID {restaurant.id})."
    )
    await callback.answer()

    try:
        username = await get_bot_username(bot)
        join_link = f"https://t.me/{username}?start=join_{restaurant.id}"
        await bot.send_message(
            chat_id=request.requested_by_telegram_id,
            text=(
                f"✅ Ваше заведение «{restaurant.name}» одобрено!\n\n"
                f"Вы назначены его администратором. Вот ваша личная ссылка "
                f"для сотрудников:\n\n"
                f"`{join_link}`\n\n"
                f"Отправьте её персоналу любым удобным способом (WhatsApp, "
                f"лично и т.д.) — переход по ней сразу открывает личный чат "
                f"с ботом с меню: профиль, тест, экзамен. Вам этот же переход "
                f"дополнительно откроет панель администратора.\n\n"
                f"Управлять заведением (смотреть результаты, добавлять других "
                f"администраторов, выдавать коды на экзамен) можно через "
                f"команду /manager в этом чате."
            ),
            parse_mode="Markdown",
        )
    except Exception:
        pass


@router.callback_query(F.data.startswith("restaurant_request_reject:"))
async def cb_request_reject(callback: CallbackQuery, bot: Bot) -> None:
    if ADMIN_ID == 0 or callback.from_user.id != ADMIN_ID:
        await callback.answer("⛔ Нет доступа.", show_alert=True)
        return

    request_id = int(callback.data.split(":")[1])
    async with async_session() as session:
        request = await crud.get_restaurant_request_by_id(session, request_id)
        if request is None:
            await callback.answer("Заявка не найдена.", show_alert=True)
            return
        if request.status != "pending":
            await callback.answer("Эта заявка уже обработана.", show_alert=True)
            return

        await crud.set_restaurant_request_status(session, request.id, "rejected")

    await callback.message.edit_text(f"❌ Заявка на «{request.name}» отклонена.")
    await callback.answer()

    try:
        await bot.send_message(
            chat_id=request.requested_by_telegram_id,
            text=f"❌ Ваша заявка на заведение «{request.name}» отклонена администратором.",
        )
    except Exception:
        pass
