"""Общая логика завершения попытки сдачи экзамена — используется и
текстовым ботом (handlers/exams.py), и сайтом (webapp_api.py), чтобы не
дублировать одну и ту же логику в двух местах.

Ранги/опыт НЕ связаны с экзаменами: экзамен — это отдельный, изолированный
инструмент администратора конкретного заведения для проверки и приёма
своих сотрудников (сдал/не сдал), без влияния на общий ранг пользователя.
Ранг и XP начисляются только за обычные тесты по ОБЩИМ (не привязанным к
конкретному заведению) должностям — см. crud.get_total_xp_for_position и
webapp_api.py (обычный, не экзаменационный поток)."""

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
    """Сохраняет результат экзамена (сдал/не сдал). Экзамен НЕ начисляет
    бонусный опыт и не двигает ранг — это сознательно отделено от системы
    рангов (см. docstring модуля). Возвращает словарь со всеми данными,
    нужными для показа результата — и в боте, и на сайте."""
    passed = (not timed_out) and total_count > 0 and (correct_count / total_count) >= PASS_THRESHOLD

    await crud.create_exam_result(
        session,
        exam_code_id=exam_code_id,
        user_id=user_id,
        position_id=position_id,
        correct_count=correct_count,
        total_count=total_count,
        passed=passed,
        bonus_xp_awarded=0,
    )

    return {
        "passed": passed,
        "timed_out": timed_out,
        "correct_count": correct_count,
        "total_count": total_count,
    }
