"""Общая логика завершения попытки сдачи экзамена — используется и
текстовым ботом (handlers/exams.py), и сайтом (webapp_api.py), чтобы не
дублировать одну и ту же логику (ранг, бонусный опыт, открытие нового
уровня сложности) в двух местах."""

from __future__ import annotations

from database import crud

PASS_THRESHOLD = 0.75  # доля правильных ответов, начиная с которой экзамен считается сданным


async def complete_exam(
    session,
    *,
    user_id: int,
    exam_code_id: int,
    position_id: int,
    correct_count: int,
    total_count: int,
    timed_out: bool,
) -> dict:
    """Сохраняет результат экзамена, начисляет бонусный опыт при сдаче,
    открывает следующий уровень сложности вопросов. Возвращает словарь со
    всеми данными, нужными для показа результата — и в боте, и на сайте."""
    passed = (not timed_out) and total_count > 0 and (correct_count / total_count) >= PASS_THRESHOLD

    ranks = await crud.get_ranks_for_position(session, position_id)
    current_xp = await crud.get_total_xp_for_position(session, user_id, position_id)
    current_rank = crud.get_rank_for_xp(ranks, current_xp)
    next_rank = crud.get_next_rank(ranks, current_rank)

    bonus_xp = 0
    if passed and next_rank is not None:
        bonus_xp = max(0, next_rank.min_xp - current_xp)

    await crud.create_exam_result(
        session,
        exam_code_id=exam_code_id,
        user_id=user_id,
        position_id=position_id,
        correct_count=correct_count,
        total_count=total_count,
        passed=passed,
        bonus_xp_awarded=bonus_xp,
    )

    new_level = None
    if passed:
        new_level = await crud.unlock_next_difficulty(session, user_id, position_id)

    new_total_xp = current_xp + bonus_xp
    new_rank = crud.get_rank_for_xp(ranks, new_total_xp)
    new_next_rank = crud.get_next_rank(ranks, new_rank)

    return {
        "passed": passed,
        "timed_out": timed_out,
        "correct_count": correct_count,
        "total_count": total_count,
        "bonus_xp": bonus_xp,
        "new_level": new_level,
        "new_rank": new_rank,
        "new_next_rank": new_next_rank,
        "new_total_xp": new_total_xp,
    }
