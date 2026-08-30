from pathlib import Path

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, FSInputFile

from database import crud
from database.database import async_session
from keyboards.keyboards import question_kb, result_kb
from services.rating import percentage_to_stars, rank_progress_text

router = Router(name="tests")

# Папка с картинками вопросов: bot/data/images/<image_path из seed.py>
IMAGES_DIR = Path(__file__).resolve().parent.parent / "data" / "images"


class TestStates(StatesGroup):
    answering = State()


async def _clear_previous_keyboard(callback: CallbackQuery) -> None:
    """Убирает кнопки у предыдущего сообщения с вопросом, чтобы нельзя было
    ответить на него повторно. Каждый вопрос присылается новым сообщением
    (а не редактированием), потому что вопрос может быть то текстом, то
    картинкой с подписью — Telegram не даёт превратить одно в другое."""
    try:
        await callback.message.edit_reply_markup(reply_markup=None)
    except Exception:
        pass  # сообщение могло быть уже без кнопок — это не страшно


async def _send_question(callback: CallbackQuery, state: FSMContext) -> None:
    data = await state.get_data()
    question_ids: list[int] = data["question_ids"]
    index: int = data["current_index"]
    question_id = question_ids[index]

    async with async_session() as session:
        question = await crud.get_question_with_options(session, question_id)

    total = len(question_ids)
    text = f"Вопрос {index + 1}/{total}\n\n{question.text}"
    kb = question_kb(question.options)

    if question.image_path:
        photo_path = IMAGES_DIR / question.image_path
        photo = FSInputFile(photo_path)
        await callback.message.answer_photo(photo=photo, caption=text, reply_markup=kb)
    else:
        await callback.message.answer(text, reply_markup=kb)


@router.callback_query(F.data.startswith("category:"))
async def cb_category_selected(callback: CallbackQuery, state: FSMContext) -> None:
    category_id = int(callback.data.split(":")[1])

    async with async_session() as session:
        category = await crud.get_category_by_id(session, category_id)
        if category is None:
            await callback.answer("Категория не найдена.", show_alert=True)
            return

        questions = await crud.get_questions_with_options(session, category_id)
        if not questions:
            await callback.answer("В этой категории пока нет вопросов.", show_alert=True)
            return

        user = await crud.get_or_create_user(
            session,
            telegram_id=callback.from_user.id,
            username=callback.from_user.username,
            full_name=callback.from_user.full_name,
        )
        test_result = await crud.create_test_result(session, user.id, category_id)

    await state.set_state(TestStates.answering)
    await state.update_data(
        test_result_id=test_result.id,
        category_id=category_id,
        position_id=category.position_id,
        question_ids=[q.id for q in questions],
        current_index=0,
        correct_count=0,
    )

    await callback.answer()
    await _send_question(callback, state)


@router.callback_query(TestStates.answering, F.data.startswith("answer:"))
async def cb_answer_selected(callback: CallbackQuery, state: FSMContext) -> None:
    option_id = int(callback.data.split(":")[1])
    data = await state.get_data()
    question_ids: list[int] = data["question_ids"]
    index: int = data["current_index"]
    question_id = question_ids[index]

    async with async_session() as session:
        option = await crud.get_answer_option(session, option_id)
        if option is None or option.question_id != question_id:
            await callback.answer("Этот вариант больше не активен.", show_alert=True)
            return

        is_correct = option.is_correct
        await crud.save_user_answer(
            session,
            test_result_id=data["test_result_id"],
            question_id=question_id,
            answer_option_id=option_id,
            is_correct=is_correct,
        )

    correct_count = data["correct_count"] + (1 if is_correct else 0)
    next_index = index + 1

    feedback = "✅ Верно!" if is_correct else "❌ Неверно."
    await callback.answer(feedback)
    await _clear_previous_keyboard(callback)

    if next_index >= len(question_ids):
        # Тест завершён
        position_id = data["position_id"]
        async with async_session() as session:
            test_result = await crud.finalize_test_result(
                session,
                test_result_id=data["test_result_id"],
                correct_count=correct_count,
                total_count=len(question_ids),
            )
            earned_xp = await crud.get_xp_earned_for_test_result(session, test_result.id)

            user = await crud.get_or_create_user(
                session,
                telegram_id=callback.from_user.id,
                username=callback.from_user.username,
                full_name=callback.from_user.full_name,
            )
            ranks = await crud.get_ranks_for_position(session, position_id)
            total_xp = await crud.get_total_xp_for_position(session, user.id, position_id)
            xp_before = total_xp - earned_xp
            rank_before = crud.get_rank_for_xp(ranks, xp_before)
            rank_after = crud.get_rank_for_xp(ranks, total_xp)
            next_rank = crud.get_next_rank(ranks, rank_after)

        stars = percentage_to_stars(test_result.percentage)
        text = (
            "🎉 Тест завершён!\n\n"
            f"Правильных ответов: {correct_count}/{len(question_ids)}\n"
            f"Результат: {test_result.percentage}%\n"
            f"Оценка: {stars}\n"
            f"Получено опыта: +{earned_xp} XP\n\n"
            f"Ранг: {rank_progress_text(rank_after, next_rank, total_xp)}"
        )
        if rank_before is not None and rank_after is not None and rank_after.level > rank_before.level:
            text += f"\n\n🎊 Поздравляем с новым рангом: {rank_after.emoji} {rank_after.title}!"

        await callback.message.answer(text, reply_markup=result_kb(position_id))
        await state.clear()
        return

    await state.update_data(current_index=next_index, correct_count=correct_count)
    await _send_question(callback, state)
