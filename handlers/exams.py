import asyncio
import time
from pathlib import Path

from aiogram import Bot, F, Router
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, FSInputFile, Message

from database import crud
from database.database import async_session
from keyboards.keyboards import (
    exam_entry_kb,
    exam_request_confirm_kb,
    exam_request_decision_kb,
    exam_request_managers_kb,
    exam_request_positions_kb,
    main_menu_kb,
    question_kb,
)
from services import exam_logic
from services.rating import display_name, rank_progress_text

router = Router(name="exams")

IMAGES_DIR = Path(__file__).resolve().parent.parent / "data" / "images"
PASS_THRESHOLD = 0.75  # доля правильных ответов, начиная с которой экзамен считается сданным


class ExamStates(StatesGroup):
    entering_code = State()
    answering = State()


# ---------- Ввод кода / запуск экзамена ----------

@router.callback_query(F.data == "menu:exam")
async def cb_exam_start(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(ExamStates.entering_code)
    await callback.message.edit_text(
        "🎓 Введите одноразовый код на экзамен, который вам выдал менеджер, "
        "или запросите код прямо сейчас.",
        reply_markup=exam_entry_kb(),
    )
    await callback.answer()


@router.message(ExamStates.entering_code)
async def process_exam_code(message: Message, state: FSMContext, bot: Bot) -> None:
    raw_code = (message.text or "").strip().upper()
    if not raw_code:
        await message.answer("Пожалуйста, отправьте код текстом.")
        return

    async with async_session() as session:
        exam_code = await crud.get_exam_code_by_code(session, raw_code)
        if exam_code is None:
            await message.answer("Код не найден. Проверьте и попробуйте ещё раз.")
            return
        if exam_code.used_by_user_id is not None:
            await message.answer("Этот код уже использован. Попросите менеджера выдать новый.")
            await state.clear()
            return

        user = await crud.get_or_create_user(
            session,
            telegram_id=message.from_user.id,
            username=message.from_user.username,
            full_name=message.from_user.full_name,
        )
        if user.restaurant_id != exam_code.restaurant_id:
            await message.answer(
                "Этот код предназначен для другого заведения. Проверьте код у менеджера."
            )
            return

        questions = await crud.get_hard_questions_for_position(session, exam_code.position_id)
        if not questions:
            await message.answer("Для этой должности пока нет вопросов для экзамена.")
            await state.clear()
            return

        # Код одноразовый — помечаем использованным сразу при старте попытки,
        # чтобы нельзя было проходить экзамен дважды по одному коду.
        await crud.mark_exam_code_used(session, exam_code.id, user.id)

    await state.set_state(ExamStates.answering)
    await state.update_data(
        exam_code_id=exam_code.id,
        position_id=exam_code.position_id,
        question_ids=[q.id for q in questions],
        current_index=0,
        correct_count=0,
        deadline=time.time() + exam_code.time_limit_seconds,
    )

    minutes = exam_code.time_limit_seconds // 60
    await message.answer(f"⏱ Экзамен начался! У вас {minutes} мин. на {len(questions)} вопросов.")
    await _send_exam_question(message, state)

    # Фоновая задача: если участник вообще не ответит вовремя, экзамен
    # автоматически завершится по истечении времени, а не "зависнет".
    asyncio.create_task(
        _watch_exam_timeout(bot, message.chat.id, exam_code.id, exam_code.time_limit_seconds, state)
    )


async def _watch_exam_timeout(
    bot: Bot, chat_id: int, exam_code_id: int, time_limit_seconds: int, state: FSMContext
) -> None:
    await asyncio.sleep(time_limit_seconds)

    current_state = await state.get_state()
    if current_state != ExamStates.answering.state:
        return  # экзамен уже завершён (сдан/провален) или отменён

    data = await state.get_data()
    if data.get("exam_code_id") != exam_code_id:
        return  # на всякий случай — это уже не тот экзамен

    correct_count = data.get("correct_count", 0)
    total_count = len(data.get("question_ids", []))
    position_id = data.get("position_id")
    await state.clear()

    text = await _complete_exam(
        telegram_id=chat_id,  # в личном чате chat_id совпадает с telegram_id пользователя
        user_id=None,
        exam_code_id=exam_code_id,
        position_id=position_id,
        correct_count=correct_count,
        total_count=total_count,
        timed_out=True,
    )
    try:
        await bot.send_message(chat_id, text)
    except Exception:
        pass


def _format_remaining(deadline: float) -> str:
    remaining = max(0, int(deadline - time.time()))
    minutes, seconds = divmod(remaining, 60)
    return f"{minutes}:{seconds:02d}"


async def _send_exam_question(message: Message, state: FSMContext) -> None:
    data = await state.get_data()
    question_ids: list[int] = data["question_ids"]
    index: int = data["current_index"]
    question_id = question_ids[index]

    async with async_session() as session:
        question = await crud.get_question_with_options(session, question_id)

    total = len(question_ids)
    remaining = _format_remaining(data["deadline"])
    text = f"Экзамен — вопрос {index + 1}/{total} | ⏱ осталось {remaining}\n\n{question.text}"
    kb = question_kb(question.options)

    if question.image_path:
        photo = FSInputFile(IMAGES_DIR / question.image_path)
        await message.answer_photo(photo=photo, caption=text, reply_markup=kb)
    else:
        await message.answer(text, reply_markup=kb)


@router.callback_query(ExamStates.answering, F.data.startswith("answer:"))
async def cb_exam_answer(callback: CallbackQuery, state: FSMContext) -> None:
    data = await state.get_data()

    # Если время истекло — завершаем попытку без учёта этого ответа.
    if time.time() > data["deadline"]:
        await _finish_exam_from_callback(callback, state, timed_out=True)
        return

    option_id = int(callback.data.split(":")[1])
    question_ids: list[int] = data["question_ids"]
    index: int = data["current_index"]
    question_id = question_ids[index]

    async with async_session() as session:
        option = await crud.get_answer_option(session, option_id)
        if option is None or option.question_id != question_id:
            await callback.answer("Этот вариант больше не активен.", show_alert=True)
            return
        is_correct = option.is_correct

    correct_count = data["correct_count"] + (1 if is_correct else 0)
    next_index = index + 1

    await callback.answer("✅ Верно!" if is_correct else "❌ Неверно.")
    try:
        await callback.message.edit_reply_markup(reply_markup=None)
    except Exception:
        pass

    if next_index >= len(question_ids):
        await state.update_data(correct_count=correct_count)
        await _finish_exam_from_callback(callback, state, timed_out=False)
        return

    await state.update_data(current_index=next_index, correct_count=correct_count)
    await _send_exam_question(callback.message, state)


async def _finish_exam_from_callback(
    callback: CallbackQuery, state: FSMContext, timed_out: bool
) -> None:
    data = await state.get_data()
    question_ids: list[int] = data["question_ids"]
    correct_count: int = data["correct_count"]
    total_count = len(question_ids)
    position_id = data["position_id"]
    exam_code_id = data["exam_code_id"]
    await state.clear()

    text = await _complete_exam(
        telegram_id=callback.from_user.id,
        user_id=None,
        exam_code_id=exam_code_id,
        position_id=position_id,
        correct_count=correct_count,
        total_count=total_count,
        timed_out=timed_out,
        username=callback.from_user.username,
        full_name=callback.from_user.full_name,
    )

    await callback.message.answer(text, reply_markup=main_menu_kb())


async def _complete_exam(
    *,
    telegram_id: int | None,
    user_id: int | None,
    exam_code_id: int,
    position_id: int,
    correct_count: int,
    total_count: int,
    timed_out: bool,
    username: str | None = None,
    full_name: str | None = None,
) -> str:
    """Общая логика завершения экзамена — используется и при обычном
    ответе на последний вопрос, и фоновым таймером при полном молчании
    участника. Возвращает готовый текст сообщения с результатом. Сам
    подсчёт (ранг, бонусный опыт, открытие уровня) — в
    services/exam_logic.py, общем с сайтом."""
    async with async_session() as session:
        if user_id is not None:
            user = await crud.get_user_by_id(session, user_id)
        else:
            user = await crud.get_or_create_user(
                session, telegram_id=telegram_id, username=username, full_name=full_name
            )

        result = await exam_logic.complete_exam(
            session,
            user_id=user.id,
            exam_code_id=exam_code_id,
            position_id=position_id,
            correct_count=correct_count,
            total_count=total_count,
            timed_out=timed_out,
        )

    if timed_out:
        text = "⏰ Время вышло! Экзамен не сдан.\n\n"
    else:
        text = "🎓 Экзамен завершён!\n\n"

    text += f"Правильных ответов: {correct_count}/{total_count}\n"

    if result["passed"]:
        level_names = {1: "лёгкий", 2: "средний", 3: "сложный"}
        new_rank = result["new_rank"]
        new_next_rank = result["new_next_rank"]
        text += (
            f"✅ Экзамен сдан!\n\n"
            f"🎊 Новый ранг: {new_rank.emoji} {new_rank.title}!\n"
            f"{rank_progress_text(new_rank, new_next_rank, result['new_total_xp'])}"
        )
        new_level = result["new_level"]
        if new_level and new_level > 1:
            text += (
                f"\n\n🔓 Открыт новый уровень вопросов в обычных тестах этой "
                f"должности: {level_names.get(new_level, new_level)}."
            )
    else:
        text += "❌ Экзамен не сдан. Обратитесь к менеджеру за новым кодом, когда будете готовы."

    return text


# ---------- Запрос кода у администратора ----------

@router.callback_query(F.data == "exam_request_code")
async def cb_exam_request_code(callback: CallbackQuery, state: FSMContext) -> None:
    async with async_session() as session:
        user = await crud.get_or_create_user(
            session,
            telegram_id=callback.from_user.id,
            username=callback.from_user.username,
            full_name=callback.from_user.full_name,
        )
        if user.restaurant_id is None:
            await callback.answer(
                "Вы не прикреплены ни к одному заведению — запросить код не у кого.",
                show_alert=True,
            )
            return

        positions = await crud.get_eligible_positions_for_exam(session, user.id, user.restaurant_id)

    if not positions:
        await callback.answer(
            "Пока нет доступных должностей для экзамена — наберите 80% и "
            "больше в обычном тесте заведения по нужной должности, тогда "
            "здесь появится возможность запросить экзамен.",
            show_alert=True,
        )
        return

    await state.clear()
    await callback.message.edit_text(
        "На какую должность вы хотите сдать экзамен? "
        "(показаны только те, где вы уже набрали 80%+ в обычном тесте)",
        reply_markup=exam_request_positions_kb(positions),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("exam_request_position:"))
async def cb_exam_request_position(callback: CallbackQuery) -> None:
    position_id = int(callback.data.split(":")[1])

    async with async_session() as session:
        user = await crud.get_or_create_user(
            session,
            telegram_id=callback.from_user.id,
            username=callback.from_user.username,
            full_name=callback.from_user.full_name,
        )
        if user.restaurant_id is None:
            await callback.answer("Вы не прикреплены к заведению.", show_alert=True)
            return

        position = await crud.get_position_by_id(session, position_id)
        managers = await crud.get_restaurant_managers(session, user.restaurant_id)

    if not managers:
        await callback.answer("В заведении пока нет администраторов.", show_alert=True)
        return

    await callback.answer()
    await callback.message.edit_text(
        f"Кому из администраторов отправить запрос на экзамен по должности "
        f"{position.emoji} {position.name}?",
        reply_markup=exam_request_managers_kb(position_id, managers),
    )


@router.callback_query(F.data.startswith("exam_request_manager:"))
async def cb_exam_request_manager(callback: CallbackQuery) -> None:
    """Выбор администратора — пока не отправляет запрос, а просит
    подтверждения, чтобы не отправить случайно не тому человеку."""
    _, position_id_str, manager_telegram_id_str = callback.data.split(":")
    position_id = int(position_id_str)
    manager_telegram_id = int(manager_telegram_id_str)

    async with async_session() as session:
        position = await crud.get_position_by_id(session, position_id)
        managers = await crud.get_restaurant_managers(session, position.restaurant_id)

    manager = next((m for m in managers if m.telegram_id == manager_telegram_id), None)
    manager_name = manager.name if manager and manager.name else f"ID {manager_telegram_id}"

    await callback.answer()
    await callback.message.edit_text(
        f"Вы точно хотите отправить запрос на экзамен по должности "
        f"{position.emoji} {position.name} администратору «{manager_name}»?",
        reply_markup=exam_request_confirm_kb(position_id, manager_telegram_id),
    )


@router.callback_query(F.data.startswith("exam_request_confirm:"))
async def cb_exam_request_confirm(callback: CallbackQuery, bot: Bot) -> None:
    _, position_id_str, manager_telegram_id_str = callback.data.split(":")
    position_id = int(position_id_str)
    manager_telegram_id = int(manager_telegram_id_str)

    async with async_session() as session:
        user = await crud.get_or_create_user(
            session,
            telegram_id=callback.from_user.id,
            username=callback.from_user.username,
            full_name=callback.from_user.full_name,
        )
        if user.restaurant_id is None:
            await callback.answer("Вы не прикреплены к заведению.", show_alert=True)
            return

        restaurant = await crud.get_restaurant_by_id(session, user.restaurant_id)
        position = await crud.get_position_by_id(session, position_id)
        request = await crud.create_exam_request(
            session, user.id, restaurant.id, position_id, manager_telegram_id
        )

    await callback.answer()
    await callback.message.edit_text(
        f"📩 Запрос на экзамен по должности {position.emoji} {position.name} "
        f"отправлен выбранному администратору. Как только он выдаст код, вы "
        f"получите его здесь же, в этом чате."
    )

    try:
        await bot.send_message(
            chat_id=manager_telegram_id,
            text=(
                f"🎓 {display_name(user)} хочет пройти экзамен для повышения "
                f"квалификации\n"
                f"Заведение: {restaurant.name}\n"
                f"Должность: {position.emoji} {position.name}"
            ),
            reply_markup=exam_request_decision_kb(request.id),
        )
    except Exception:
        pass  # администратор ещё не писал боту — запрос всё равно сохранён в базе


@router.callback_query(F.data.startswith("exam_request_approve:"))
async def cb_exam_request_approve(callback: CallbackQuery, bot: Bot) -> None:
    request_id = int(callback.data.split(":")[1])

    async with async_session() as session:
        request = await crud.get_exam_request_by_id(session, request_id)
        if request is None:
            await callback.answer("Запрос не найден.", show_alert=True)
            return

        if request.target_manager_telegram_id != callback.from_user.id:
            await callback.answer(
                "⛔ Этот запрос адресован другому администратору.", show_alert=True
            )
            return

        if request.status != "pending":
            await callback.answer("Этот запрос уже обработан.", show_alert=True)
            return

        restaurant = await crud.get_restaurant_by_id(session, request.restaurant_id)
        position = await crud.get_position_by_id(session, request.position_id)
        target_user = await crud.get_user_by_id(session, request.user_id)

        exam_code = await crud.create_exam_code(
            session,
            restaurant_id=restaurant.id,
            position_id=request.position_id,
            created_by_telegram_id=callback.from_user.id,
        )
        await crud.fulfill_exam_request(session, request.id, exam_code.id)

    minutes = exam_code.time_limit_seconds // 60
    await callback.answer("Код выдан")
    await callback.message.edit_text(
        f"✅ Код на экзамен по должности {position.emoji} {position.name} "
        f"выдан {display_name(target_user)}."
    )

    try:
        await bot.send_message(
            chat_id=target_user.telegram_id,
            text=(
                f"🎓 Администратор выдал вам код на экзамен по должности "
                f"{position.emoji} {position.name}:\n\n"
                f"`{exam_code.code}`\n\n"
                f"У вас будет {minutes} мин. Откройте меню заведения → "
                f"«📩 Запросить экзамен» → введите этот код на сайте."
            ),
            parse_mode="Markdown",
        )
    except Exception:
        pass


@router.callback_query(F.data.startswith("exam_request_decline:"))
async def cb_exam_request_decline(callback: CallbackQuery, bot: Bot) -> None:
    request_id = int(callback.data.split(":")[1])

    async with async_session() as session:
        request = await crud.get_exam_request_by_id(session, request_id)
        if request is None:
            await callback.answer("Запрос не найден.", show_alert=True)
            return

        if request.target_manager_telegram_id != callback.from_user.id:
            await callback.answer(
                "⛔ Этот запрос адресован другому администратору.", show_alert=True
            )
            return

        if request.status != "pending":
            await callback.answer("Этот запрос уже обработан.", show_alert=True)
            return

        target_user = await crud.get_user_by_id(session, request.user_id)
        await crud.decline_exam_request(session, request.id)

    await callback.answer("Отклонено")
    await callback.message.edit_text("❌ Запрос на экзамен отклонён.")

    try:
        await bot.send_message(
            chat_id=target_user.telegram_id,
            text="❌ Ваш запрос на экзамен отклонён администратором.",
        )
    except Exception:
        pass
