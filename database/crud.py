from __future__ import annotations

import secrets
import string
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database.models import (
    AnswerOption,
    Category,
    ExamCode,
    ExamRequest,
    ExamResult,
    Position,
    Question,
    Rank,
    Restaurant,
    RestaurantArchiveRequest,
    RestaurantArchiveVote,
    RestaurantJoinRequest,
    RestaurantManager,
    RestaurantRequest,
    TestResult,
    User,
    UserAnswer,
    UserPositionLevel,
    Vacancy,
)


# ---------- Пользователи ----------

async def get_or_create_user(
    session: AsyncSession,
    telegram_id: int,
    username: str | None,
    full_name: str | None,
) -> User:
    result = await session.execute(select(User).where(User.telegram_id == telegram_id))
    user = result.scalar_one_or_none()
    if user is None:
        user = User(telegram_id=telegram_id, username=username, full_name=full_name)
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user

    changed = False
    if username is not None and user.username != username:
        user.username = username
        changed = True
    if full_name is not None and user.full_name != full_name:
        user.full_name = full_name
        changed = True
    if changed:
        await session.commit()
    return user


async def get_user_by_telegram_id(session: AsyncSession, telegram_id: int) -> User | None:
    result = await session.execute(select(User).where(User.telegram_id == telegram_id))
    return result.scalar_one_or_none()


async def get_user_by_id(session: AsyncSession, user_id: int) -> User | None:
    return await session.get(User, user_id)


async def set_user_position(session: AsyncSession, user: User, position_id: int) -> None:
    user.current_position_id = position_id
    await session.commit()


# ---------- Заявки на вступление персонала (личная ссылка join_{id}) ----------

async def create_join_request(
    session: AsyncSession,
    restaurant_id: int,
    telegram_id: int,
    telegram_name: str | None,
    target_manager_telegram_id: int | None = None,
) -> RestaurantJoinRequest:
    request = RestaurantJoinRequest(
        restaurant_id=restaurant_id,
        telegram_id=telegram_id,
        telegram_name=telegram_name,
        target_manager_telegram_id=target_manager_telegram_id,
        status="pending",
    )
    session.add(request)
    await session.commit()
    await session.refresh(request)
    return request


async def get_pending_join_request(
    session: AsyncSession, restaurant_id: int, telegram_id: int
) -> RestaurantJoinRequest | None:
    result = await session.execute(
        select(RestaurantJoinRequest).where(
            RestaurantJoinRequest.restaurant_id == restaurant_id,
            RestaurantJoinRequest.telegram_id == telegram_id,
            RestaurantJoinRequest.status == "pending",
        )
    )
    return result.scalars().first()


async def get_join_request_by_id(
    session: AsyncSession, request_id: int
) -> RestaurantJoinRequest | None:
    return await session.get(RestaurantJoinRequest, request_id)


async def set_join_request_status(session: AsyncSession, request_id: int, status: str) -> None:
    request = await session.get(RestaurantJoinRequest, request_id)
    if request is not None:
        request.status = status
        request.decided_at = datetime.utcnow()
        await session.commit()


async def remove_user_from_restaurant(session: AsyncSession, restaurant_id: int, user_id: int) -> bool:
    """Убирает сотрудника из заведения (используется кнопкой «Удалить
    персонал» в панели менеджера). Возвращает True, если сотрудник был
    найден именно в этом заведении и убран."""
    user = await session.get(User, user_id)
    if user is None or user.restaurant_id != restaurant_id:
        return False
    user.restaurant_id = None
    user.current_position_id = None
    await session.commit()
    return True


async def set_user_restaurant(session: AsyncSession, user: User, restaurant_id: int) -> None:
    user.restaurant_id = restaurant_id
    await session.commit()


async def set_user_curator(session: AsyncSession, user_id: int, curator_telegram_id: int) -> None:
    """Устанавливает куратора — но только один раз (первый куратор так и
    остаётся куратором, даже если человек потом перейдёт в другое
    заведение по новой ссылке)."""
    user = await session.get(User, user_id)
    if user is not None and user.curator_telegram_id is None:
        user.curator_telegram_id = curator_telegram_id
        await session.commit()


async def get_trainee_count(session: AsyncSession, curator_telegram_id: int) -> int:
    """Сколько людей числятся стажёрами этого человека (он был их
    куратором при вступлении)."""
    result = await session.execute(
        select(func.count()).select_from(User).where(User.curator_telegram_id == curator_telegram_id)
    )
    return result.scalar() or 0


async def get_curator_name(session: AsyncSession, telegram_id: int) -> str | None:
    """Имя куратора конкретного человека (по его telegram_id), если есть."""
    user = await get_user_by_telegram_id(session, telegram_id)
    if user is None or user.curator_telegram_id is None:
        return None
    curator = await get_user_by_telegram_id(session, user.curator_telegram_id)
    if curator is None:
        return f"ID {user.curator_telegram_id}"
    return curator.full_name or curator.username or f"ID {curator.telegram_id}"


# ---------- Должности / категории / вопросы ----------

async def get_active_positions(
    session: AsyncSession, restaurant_id: int | None = None
) -> list[Position]:
    """Если у заведения уже есть СВОИ уникальные должности — показываются
    только они (чтобы не дублировать одинаковые на вид общие и уникальные
    тесты в одном списке). Если своих ещё нет — заведению (или гостю без
    заведения вовсе) показываются общие должности, видные всем."""
    if restaurant_id is not None:
        own_result = await session.execute(
            select(Position).where(
                Position.is_active.is_(True), Position.restaurant_id == restaurant_id
            )
        )
        own_positions = list(own_result.scalars().all())
        if own_positions:
            own_positions.sort(key=lambda p: (p.order, p.id))
            return own_positions

    result = await session.execute(
        select(Position)
        .where(Position.is_active.is_(True), Position.restaurant_id.is_(None))
        .order_by(Position.order, Position.id)
    )
    return list(result.scalars().all())


async def get_position_by_id(session: AsyncSession, position_id: int) -> Position | None:
    return await session.get(Position, position_id)


async def get_categories_for_position(session: AsyncSession, position_id: int) -> list[Category]:
    result = await session.execute(
        select(Category).where(Category.position_id == position_id).order_by(Category.order)
    )
    return list(result.scalars().all())


async def get_category_by_id(session: AsyncSession, category_id: int) -> Category | None:
    return await session.get(Category, category_id)


async def get_questions_with_options(session: AsyncSession, category_id: int) -> list[Question]:
    result = await session.execute(
        select(Question)
        .where(Question.category_id == category_id)
        .options(selectinload(Question.options))
        .order_by(Question.order)
    )
    return list(result.scalars().all())


async def get_question_with_options(session: AsyncSession, question_id: int) -> Question | None:
    result = await session.execute(
        select(Question)
        .where(Question.id == question_id)
        .options(selectinload(Question.options))
    )
    return result.scalar_one_or_none()


async def get_answer_option(session: AsyncSession, option_id: int) -> AnswerOption | None:
    return await session.get(AnswerOption, option_id)


# ---------- Прохождение теста ----------

async def create_test_result(
    session: AsyncSession, user_id: int, category_id: int, level: int = 1
) -> TestResult:
    tr = TestResult(
        user_id=user_id, category_id=category_id, level=level,
        correct_count=0, total_count=0, percentage=0.0,
    )
    session.add(tr)
    await session.commit()
    await session.refresh(tr)
    return tr


async def save_user_answer(
    session: AsyncSession,
    test_result_id: int,
    question_id: int,
    answer_option_id: int,
    is_correct: bool,
) -> None:
    ua = UserAnswer(
        test_result_id=test_result_id,
        question_id=question_id,
        answer_option_id=answer_option_id,
        is_correct=is_correct,
    )
    session.add(ua)
    await session.commit()


async def finalize_test_result(
    session: AsyncSession, test_result_id: int, correct_count: int, total_count: int
) -> TestResult:
    test_result = await session.get(TestResult, test_result_id)
    test_result.correct_count = correct_count
    test_result.total_count = total_count
    test_result.percentage = round((correct_count / total_count) * 100, 1) if total_count else 0.0
    await session.commit()
    await session.refresh(test_result)
    return test_result


# ---------- Статистика / рейтинг ----------

async def get_test_result_by_id(session: AsyncSession, test_result_id: int) -> TestResult | None:
    return await session.get(TestResult, test_result_id)


async def get_test_result_breakdown(session: AsyncSession, test_result_id: int) -> list[dict]:
    """Детальный разбор одного пройденного теста — какой именно вопрос,
    какой ответ выбрал сотрудник и был ли он верным (и какой был бы
    правильный, если ошибся). Используется в панели администратора,
    чтобы увидеть, где именно сотрудник ошибся, а не только итоговый счёт."""
    result = await session.execute(
        select(UserAnswer)
        .where(UserAnswer.test_result_id == test_result_id)
        .options(
            selectinload(UserAnswer.question).selectinload(Question.options),
        )
    )
    answers = list(result.scalars().unique().all())

    breakdown = []
    for answer in answers:
        question = answer.question
        chosen = next((o for o in question.options if o.id == answer.answer_option_id), None)
        correct = next((o for o in question.options if o.is_correct), None)
        breakdown.append(
            {
                "question": question.text,
                "chosen": chosen.text if chosen else None,
                "correct": correct.text if correct else None,
                "is_correct": answer.is_correct,
            }
        )
    return breakdown


async def get_recent_results_for_user_in_restaurant(
    session: AsyncSession, user_id: int, restaurant_id: int, limit: int = 10
) -> list[TestResult]:
    """История тестов пользователя, отфильтрованная так же, как и
    get_user_stats_for_restaurant — только тесты, созданные для этого
    конкретного заведения. Используется в личном разделе "Мои результаты"
    на сайте."""
    result = await session.execute(
        select(TestResult)
        .join(Category, TestResult.category_id == Category.id)
        .join(Position, Category.position_id == Position.id)
        .where(TestResult.user_id == user_id, Position.restaurant_id == restaurant_id)
        .options(selectinload(TestResult.category).selectinload(Category.position))
        .order_by(TestResult.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def get_unlocked_difficulty(session: AsyncSession, user_id: int, position_id: int) -> int:
    """Уровень сложности, открытый сотруднику по этой должности. По
    умолчанию 1 (только лёгкие вопросы), пока запись не создана."""
    result = await session.execute(
        select(UserPositionLevel).where(
            UserPositionLevel.user_id == user_id, UserPositionLevel.position_id == position_id
        )
    )
    level = result.scalars().first()
    return level.unlocked_difficulty if level else 1


async def unlock_next_difficulty(session: AsyncSession, user_id: int, position_id: int) -> int:
    """Открывает следующий уровень сложности после сдачи экзамена по
    должности (максимум 3). Возвращает новый уровень."""
    result = await session.execute(
        select(UserPositionLevel).where(
            UserPositionLevel.user_id == user_id, UserPositionLevel.position_id == position_id
        )
    )
    level = result.scalars().first()
    if level is None:
        level = UserPositionLevel(user_id=user_id, position_id=position_id, unlocked_difficulty=1)
        session.add(level)
        await session.flush()

    level.unlocked_difficulty = min(3, level.unlocked_difficulty + 1)
    await session.commit()
    return level.unlocked_difficulty


async def get_pending_archive_request(
    session: AsyncSession, restaurant_id: int
) -> RestaurantArchiveRequest | None:
    result = await session.execute(
        select(RestaurantArchiveRequest).where(
            RestaurantArchiveRequest.restaurant_id == restaurant_id,
            RestaurantArchiveRequest.status == "pending",
        )
    )
    return result.scalars().first()


async def get_archive_request_by_id(
    session: AsyncSession, request_id: int
) -> RestaurantArchiveRequest | None:
    return await session.get(RestaurantArchiveRequest, request_id)


async def create_archive_request(
    session: AsyncSession, restaurant_id: int, initiated_by_telegram_id: int
) -> RestaurantArchiveRequest:
    """Создаёт заявку на архивирование. Инициатор сразу засчитывается как
    проголосовавший "за" — сам факт нажатия кнопки уже его согласие."""
    request = RestaurantArchiveRequest(
        restaurant_id=restaurant_id,
        initiated_by_telegram_id=initiated_by_telegram_id,
        status="pending",
    )
    session.add(request)
    await session.flush()

    vote = RestaurantArchiveVote(
        request_id=request.id,
        manager_telegram_id=initiated_by_telegram_id,
        decision="approved",
    )
    session.add(vote)
    await session.commit()
    await session.refresh(request)
    return request


async def archive_restaurant(session: AsyncSession, restaurant_id: int) -> None:
    restaurant = await session.get(Restaurant, restaurant_id)
    if restaurant is not None:
        restaurant.is_archived = True
        restaurant.archived_at = datetime.utcnow()
        await session.commit()


async def cast_archive_vote(
    session: AsyncSession, request_id: int, manager_telegram_id: int, decision: str
) -> dict:
    """Записывает голос администратора. Если это "отклонить" — заявка
    сразу останавливается целиком. Если "одобрить" — проверяет, не
    проголосовали ли уже ВСЕ администраторы заведения; если да — заведение
    архивируется автоматически. Возвращает словарь с исходом для показа
    сообщений."""
    request = await session.get(RestaurantArchiveRequest, request_id)
    if request is None or request.status != "pending":
        return {"status": "not_pending"}

    session.add(
        RestaurantArchiveVote(
            request_id=request_id, manager_telegram_id=manager_telegram_id, decision=decision
        )
    )

    if decision == "declined":
        request.status = "declined"
        request.decided_at = datetime.utcnow()
        await session.commit()
        return {"status": "declined", "restaurant_id": request.restaurant_id}

    await session.commit()

    all_managers = await get_restaurant_managers(session, request.restaurant_id)
    result = await session.execute(
        select(RestaurantArchiveVote.manager_telegram_id).where(
            RestaurantArchiveVote.request_id == request_id,
            RestaurantArchiveVote.decision == "approved",
        )
    )
    approved_ids = {row[0] for row in result.all()}
    all_manager_ids = {m.telegram_id for m in all_managers}

    if all_manager_ids.issubset(approved_ids):
        request.status = "approved"
        request.decided_at = datetime.utcnow()
        await archive_restaurant(session, request.restaurant_id)
        await session.commit()
        return {"status": "approved", "restaurant_id": request.restaurant_id}

    return {
        "status": "waiting",
        "restaurant_id": request.restaurant_id,
        "approved_count": len(approved_ids),
        "total_count": len(all_manager_ids),
    }


async def get_position_progress_for_user(session: AsyncSession, user_id: int) -> list[dict]:
    """По каким должностям человек вообще проходил тесты, и какой уровень
    сложности вопросов ему сейчас открыт по каждой из них (1/2/3).
    Используется в профиле вместо старой единственной "текущей должности"
    — теперь виден прогресс сразу по всем должностям, которыми человек
    занимался."""
    result = await session.execute(
        select(Category.position_id, func.count(TestResult.id))
        .join(TestResult, TestResult.category_id == Category.id)
        .where(TestResult.user_id == user_id)
        .group_by(Category.position_id)
    )
    rows = result.all()

    progress = []
    for position_id, tests_completed in rows:
        position = await get_position_by_id(session, position_id)
        if position is None:
            continue
        level = await get_unlocked_difficulty(session, user_id, position_id)
        progress.append(
            {
                "position_name": position.name,
                "position_emoji": position.emoji,
                "level": level,
                "tests_completed": tests_completed,
            }
        )
    return progress


async def get_eligible_positions_for_exam(
    session: AsyncSession, user_id: int, restaurant_id: int, threshold: float = 80.0
) -> list[Position]:
    """Должности, по которым сотрудник уже сдал на threshold%+ все ТРИ
    уровня сложности (в любой из категорий этой должности) — только по
    ним разрешено запрашивать экзамен. Раньше проверялся общий средний
    балл, теперь — именно прогресс по уровням, раз уровни сами по себе
    больше не привязаны к сдаче экзамена."""
    positions = await get_active_positions(session, restaurant_id)
    eligible = []
    for position in positions:
        result = await session.execute(
            select(TestResult)
            .join(Category, TestResult.category_id == Category.id)
            .where(TestResult.user_id == user_id, Category.position_id == position.id)
        )
        results = list(result.scalars().all())
        passed_levels = {
            r.level for r in results if r.percentage >= threshold and r.level in (1, 2, 3)
        }
        if {1, 2, 3}.issubset(passed_levels):
            eligible.append(position)
    return eligible


async def get_user_stats_for_restaurant(
    session: AsyncSession, user_id: int, restaurant_id: int
) -> dict:
    """Статистика сотрудника ТОЛЬКО по тестам, созданным для его заведения
    (Position.restaurant_id == restaurant_id) — исключая общие/публичные
    тесты, доступные всем пользователям бота. Используется в панели
    менеджера и в общем рейтинге заведений, чтобы результаты по чужим,
    общим тестам не влияли на оценку сотрудника его работодателем."""
    result = await session.execute(
        select(TestResult)
        .join(Category, TestResult.category_id == Category.id)
        .join(Position, Category.position_id == Position.id)
        .where(TestResult.user_id == user_id, Position.restaurant_id == restaurant_id)
    )
    results = list(result.scalars().all())
    tests_completed = len(results)
    correct_total = sum(r.correct_count for r in results)
    wrong_total = sum((r.total_count - r.correct_count) for r in results)
    avg_percentage = (
        round(sum(r.percentage for r in results) / tests_completed, 1) if tests_completed else 0.0
    )
    return {
        "tests_completed": tests_completed,
        "correct_total": correct_total,
        "wrong_total": wrong_total,
        "avg_percentage": avg_percentage,
    }


async def get_user_stats(session: AsyncSession, user_id: int) -> dict:
    result = await session.execute(select(TestResult).where(TestResult.user_id == user_id))
    results = list(result.scalars().all())
    tests_completed = len(results)
    correct_total = sum(r.correct_count for r in results)
    wrong_total = sum((r.total_count - r.correct_count) for r in results)
    avg_percentage = (
        round(sum(r.percentage for r in results) / tests_completed, 1) if tests_completed else 0.0
    )
    return {
        "tests_completed": tests_completed,
        "correct_total": correct_total,
        "wrong_total": wrong_total,
        "avg_percentage": avg_percentage,
    }


async def _all_users_scored(session: AsyncSession) -> list[tuple[User, dict]]:
    result = await session.execute(select(User))
    users = list(result.scalars().all())
    scored: list[tuple[User, dict]] = []
    for user in users:
        stats = await get_user_stats(session, user.id)
        if stats["tests_completed"] > 0:
            scored.append((user, stats))
    scored.sort(key=lambda item: (-item[1]["avg_percentage"], -item[1]["tests_completed"]))
    return scored


async def get_leaderboard(session: AsyncSession, limit: int = 10) -> list[dict]:
    scored = await _all_users_scored(session)
    return [{"user": user, **stats} for user, stats in scored[:limit]]


async def get_user_rank(session: AsyncSession, user_id: int) -> int | None:
    scored = await _all_users_scored(session)
    for idx, (user, _stats) in enumerate(scored, start=1):
        if user.id == user_id:
            return idx
    return None


async def get_all_users_with_stats(session: AsyncSession) -> list[dict]:
    result = await session.execute(select(User).order_by(User.id))
    users = list(result.scalars().all())
    data = []
    for user in users:
        stats = await get_user_stats(session, user.id)
        position = (
            await session.get(Position, user.current_position_id)
            if user.current_position_id
            else None
        )
        data.append({"user": user, "position": position, **stats})
    return data


# ---------- Ранги и опыт (XP) ----------

XP_PER_DIFFICULTY = 10  # базовое количество XP за правильный ответ на вопрос сложности 1


async def get_ranks_for_position(session: AsyncSession, position_id: int) -> list[Rank]:
    result = await session.execute(
        select(Rank).where(Rank.position_id == position_id).order_by(Rank.level)
    )
    return list(result.scalars().all())


async def get_user_xp_for_position(session: AsyncSession, user_id: int, position_id: int) -> int:
    """Суммарный опыт пользователя по конкретной должности (по всем пройденным тестам)."""
    stmt = (
        select(UserAnswer.is_correct, Question.difficulty)
        .join(Question, UserAnswer.question_id == Question.id)
        .join(TestResult, UserAnswer.test_result_id == TestResult.id)
        .join(Category, TestResult.category_id == Category.id)
        .where(TestResult.user_id == user_id, Category.position_id == position_id)
    )
    result = await session.execute(stmt)
    rows = result.all()
    return sum(difficulty * XP_PER_DIFFICULTY for is_correct, difficulty in rows if is_correct)


async def get_exam_bonus_xp_for_position(
    session: AsyncSession, user_id: int, position_id: int
) -> int:
    """Бонусный XP от успешно сданных экзаменов по одноразовым кодам."""
    result = await session.execute(
        select(ExamResult.bonus_xp_awarded).where(
            ExamResult.user_id == user_id,
            ExamResult.position_id == position_id,
            ExamResult.passed.is_(True),
        )
    )
    return sum(result.scalars().all())


async def get_total_xp_for_position(session: AsyncSession, user_id: int, position_id: int) -> int:
    """Обычный XP за тесты + бонусный XP за сданные экзамены — используется
    везде, где показывается ранг пользователя."""
    regular = await get_user_xp_for_position(session, user_id, position_id)
    bonus = await get_exam_bonus_xp_for_position(session, user_id, position_id)
    return regular + bonus


def get_rank_for_xp(ranks: list[Rank], xp: int) -> Rank | None:
    """Возвращает наивысший ранг, порог которого достигнут указанным опытом."""
    current = None
    for rank in ranks:  # ranks уже отсортированы по level по возрастанию
        if xp >= rank.min_xp:
            current = rank
        else:
            break
    return current


async def get_xp_earned_for_test_result(session: AsyncSession, test_result_id: int) -> int:
    """XP, полученный за один конкретный тест (для показа в результатах)."""
    stmt = (
        select(UserAnswer.is_correct, Question.difficulty)
        .join(Question, UserAnswer.question_id == Question.id)
        .where(UserAnswer.test_result_id == test_result_id)
    )
    result = await session.execute(stmt)
    rows = result.all()
    return sum(difficulty * XP_PER_DIFFICULTY for is_correct, difficulty in rows if is_correct)


def get_next_rank(ranks: list[Rank], current_rank: Rank | None) -> Rank | None:
    if current_rank is None:
        return ranks[0] if ranks else None
    for rank in ranks:
        if rank.level == current_rank.level + 1:
            return rank
    return None


async def get_recent_results_for_user(
    session: AsyncSession, user_id: int, limit: int = 10
) -> list[TestResult]:
    result = await session.execute(
        select(TestResult)
        .where(TestResult.user_id == user_id)
        .options(selectinload(TestResult.category).selectinload(Category.position))
        .order_by(TestResult.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


# ---------- Вакансии ----------
# Сами вакансии публикуются ботом в Telegram-канал (VACANCIES_CHANNEL).
# Здесь только копия записи — для истории/учёта в админ-панели.

async def create_vacancy(
    session: AsyncSession,
    title: str,
    description: str,
    salary: str | None,
    location: str | None,
    created_by_telegram_id: int,
    created_by_name: str | None,
) -> Vacancy:
    vacancy = Vacancy(
        title=title,
        description=description,
        salary=salary,
        location=location,
        created_by_telegram_id=created_by_telegram_id,
        created_by_name=created_by_name,
    )
    session.add(vacancy)
    await session.commit()
    await session.refresh(vacancy)
    return vacancy


async def get_all_vacancies(session: AsyncSession) -> list[Vacancy]:
    """Список всех опубликованных вакансий (для админ-панели)."""
    result = await session.execute(select(Vacancy).order_by(Vacancy.created_at.desc()))
    return list(result.scalars().all())


async def get_vacancy_by_id(session: AsyncSession, vacancy_id: int) -> Vacancy | None:
    return await session.get(Vacancy, vacancy_id)


async def delete_vacancy(session: AsyncSession, vacancy_id: int) -> None:
    vacancy = await session.get(Vacancy, vacancy_id)
    if vacancy is not None:
        await session.delete(vacancy)
        await session.commit()


# ---------- Заведения (рестораны) ----------

async def create_restaurant(
    session: AsyncSession, name: str, first_manager_telegram_id: int, first_manager_name: str | None = None
) -> Restaurant:
    """Создаёт заведение и сразу назначает первого администратора
    (создателя/того, кому его назначили). Дальше администраторов может
    добавить любой существующий администратор — см. add_restaurant_manager."""
    restaurant = Restaurant(name=name)
    session.add(restaurant)
    await session.flush()  # получить restaurant.id

    session.add(
        RestaurantManager(
            restaurant_id=restaurant.id,
            telegram_id=first_manager_telegram_id,
            name=first_manager_name,
            added_by_telegram_id=None,  # первый администратор — назначен при создании
        )
    )
    await session.commit()
    await session.refresh(restaurant)
    return restaurant


async def get_restaurants_managed_by(session: AsyncSession, telegram_id: int) -> list[Restaurant]:
    """Все заведения, где этот пользователь — администратор (их может быть
    несколько, если он администрирует не одно заведение). Архивированные
    заведения сюда не попадают — они больше не активны."""
    result = await session.execute(
        select(Restaurant)
        .join(RestaurantManager, RestaurantManager.restaurant_id == Restaurant.id)
        .where(RestaurantManager.telegram_id == telegram_id, Restaurant.is_archived.is_(False))
        .order_by(Restaurant.name)
    )
    return list(result.scalars().unique().all())


async def get_user_restaurant_options(
    session: AsyncSession, telegram_id: int
) -> list[tuple[Restaurant, bool]]:
    """Все заведения, с которыми человек как-либо связан — и то, где он
    просто сотрудник, и все, которыми он управляет, объединённые в один
    список без повторов. Каждый элемент — (заведение, является ли
    менеджером именно этого заведения). Используется, чтобы решить, какое
    меню показать по /start или по кнопке «Моё заведение» — раньше эти
    две привязки проверялись по отдельности, из-за чего человек, который
    одновременно сотрудник одного заведения и менеджер другого, мог
    случайно попадать в общее меню. Архивированные заведения сюда не
    попадают — доступ к ним для активной работы закрыт, но история
    персонала (профиль, "Мои результаты") их по-прежнему видит."""
    options: dict[int, tuple[Restaurant, bool]] = {}

    user = await get_user_by_telegram_id(session, telegram_id)
    if user is not None and user.restaurant_id is not None:
        staff_restaurant = await get_restaurant_by_id(session, user.restaurant_id)
        if staff_restaurant is not None and not staff_restaurant.is_archived:
            is_mgr = await is_restaurant_manager(session, staff_restaurant.id, telegram_id)
            options[staff_restaurant.id] = (staff_restaurant, is_mgr)

    for managed_restaurant in await get_restaurants_managed_by(session, telegram_id):
        options[managed_restaurant.id] = (managed_restaurant, True)

    return list(options.values())


async def is_restaurant_manager(session: AsyncSession, restaurant_id: int, telegram_id: int) -> bool:
    result = await session.execute(
        select(RestaurantManager).where(
            RestaurantManager.restaurant_id == restaurant_id,
            RestaurantManager.telegram_id == telegram_id,
        )
    )
    return result.scalars().first() is not None


async def get_restaurant_managers(session: AsyncSession, restaurant_id: int) -> list[RestaurantManager]:
    result = await session.execute(
        select(RestaurantManager)
        .where(RestaurantManager.restaurant_id == restaurant_id)
        .order_by(RestaurantManager.created_at)
    )
    return list(result.scalars().all())


async def add_restaurant_manager(
    session: AsyncSession,
    restaurant_id: int,
    telegram_id: int,
    name: str | None,
    added_by_telegram_id: int,
) -> RestaurantManager | None:
    """Возвращает None, если этот человек уже администратор этого заведения."""
    already = await is_restaurant_manager(session, restaurant_id, telegram_id)
    if already:
        return None

    manager = RestaurantManager(
        restaurant_id=restaurant_id,
        telegram_id=telegram_id,
        name=name,
        added_by_telegram_id=added_by_telegram_id,
    )
    session.add(manager)
    await session.commit()
    await session.refresh(manager)
    return manager


async def remove_restaurant_manager(session: AsyncSession, restaurant_id: int, telegram_id: int) -> bool:
    """Возвращает False, если это последний администратор заведения (нельзя
    оставить заведение вообще без администратора) или если такого
    администратора не найдено."""
    managers = await get_restaurant_managers(session, restaurant_id)
    if len(managers) <= 1:
        return False

    target = next((m for m in managers if m.telegram_id == telegram_id), None)
    if target is None:
        return False

    await session.delete(target)
    await session.commit()
    return True


async def get_all_restaurants(session: AsyncSession) -> list[Restaurant]:
    result = await session.execute(select(Restaurant).order_by(Restaurant.created_at.desc()))
    return list(result.scalars().all())


async def get_restaurant_by_id(session: AsyncSession, restaurant_id: int) -> Restaurant | None:
    return await session.get(Restaurant, restaurant_id)


async def get_restaurant_by_manager(
    session: AsyncSession, manager_telegram_id: int
) -> Restaurant | None:
    """Оставлено для обратной совместимости — возвращает первое заведение,
    где этот пользователь администратор. Если он администрирует несколько,
    используйте get_restaurants_managed_by."""
    restaurants = await get_restaurants_managed_by(session, manager_telegram_id)
    return restaurants[0] if restaurants else None


async def get_restaurant_by_group_chat_id(
    session: AsyncSession, group_chat_id: int
) -> Restaurant | None:
    result = await session.execute(
        select(Restaurant).where(Restaurant.group_chat_id == group_chat_id)
    )
    return result.scalars().first()


async def set_restaurant_group_chat_id(
    session: AsyncSession, restaurant_id: int, group_chat_id: int
) -> None:
    restaurant = await session.get(Restaurant, restaurant_id)
    if restaurant is not None:
        restaurant.group_chat_id = group_chat_id
        await session.commit()


async def get_employees_for_restaurant(session: AsyncSession, restaurant_id: int) -> list[dict]:
    """Список сотрудников заведения со статистикой — для панели менеджера.
    Статистика (tests_completed, avg_percentage) считается ТОЛЬКО по
    тестам, созданным для этого заведения — общие/публичные тесты сюда
    не входят (см. get_user_stats_for_restaurant)."""
    result = await session.execute(
        select(User).where(User.restaurant_id == restaurant_id).order_by(User.id)
    )
    users = list(result.scalars().all())
    data = []
    for user in users:
        stats = await get_user_stats_for_restaurant(session, user.id, restaurant_id)
        position = (
            await session.get(Position, user.current_position_id)
            if user.current_position_id
            else None
        )
        data.append({"user": user, "position": position, **stats})
    return data


async def get_restaurant_leaderboard(session: AsyncSession) -> list[dict]:
    """Рейтинг заведений: средний результат тестов среди их сотрудников."""
    restaurants = await get_all_restaurants(session)
    leaderboard = []
    for restaurant in restaurants:
        employees = await get_employees_for_restaurant(session, restaurant.id)
        scored = [e for e in employees if e["tests_completed"] > 0]
        if not scored:
            continue
        avg_percentage = round(sum(e["avg_percentage"] for e in scored) / len(scored), 1)
        leaderboard.append(
            {
                "restaurant": restaurant,
                "avg_percentage": avg_percentage,
                "employees_count": len(scored),
            }
        )
    leaderboard.sort(key=lambda item: (-item["avg_percentage"], -item["employees_count"]))
    return leaderboard


async def get_user_rank_within_restaurant(
    session: AsyncSession, user_id: int, restaurant_id: int
) -> int | None:
    """Место пользователя в рейтинге внутри своего заведения (по среднему %)."""
    employees = await get_employees_for_restaurant(session, restaurant_id)
    scored = [e for e in employees if e["tests_completed"] > 0]
    scored.sort(key=lambda item: (-item["avg_percentage"], -item["tests_completed"]))
    for idx, entry in enumerate(scored, start=1):
        if entry["user"].id == user_id:
            return idx
    return None


# ---------- Заявки на добавление заведения ----------

async def get_last_restaurant_request_time(
    session: AsyncSession, telegram_id: int
) -> datetime | None:
    """Время последней заявки этого человека на регистрацию заведения —
    используется, чтобы не давать отправлять заявки чаще раза в сутки
    (защита от случайного или намеренного спама заявками)."""
    result = await session.execute(
        select(RestaurantRequest.created_at)
        .where(RestaurantRequest.requested_by_telegram_id == telegram_id)
        .order_by(RestaurantRequest.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def create_restaurant_request(
    session: AsyncSession,
    name: str,
    requested_by_telegram_id: int,
    requested_by_name: str | None,
) -> RestaurantRequest:
    request = RestaurantRequest(
        name=name,
        requested_by_telegram_id=requested_by_telegram_id,
        requested_by_name=requested_by_name,
        status="pending",
    )
    session.add(request)
    await session.commit()
    await session.refresh(request)
    return request


async def get_restaurant_request_by_id(
    session: AsyncSession, request_id: int
) -> RestaurantRequest | None:
    return await session.get(RestaurantRequest, request_id)


async def set_restaurant_request_status(
    session: AsyncSession, request_id: int, status: str
) -> None:
    request = await session.get(RestaurantRequest, request_id)
    if request is not None:
        request.status = status
        request.decided_at = datetime.utcnow()
        await session.commit()


# ---------- Экзамены по одноразовым кодам ----------

def _generate_exam_code() -> str:
    """Короткий, легко надиктовываемый код: 6 символов, только заглавные буквы и цифры."""
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(6))


async def create_exam_code(
    session: AsyncSession,
    restaurant_id: int,
    position_id: int,
    created_by_telegram_id: int,
    time_limit_seconds: int = 180,
) -> ExamCode:
    code = ExamCode(
        restaurant_id=restaurant_id,
        position_id=position_id,
        code=_generate_exam_code(),
        time_limit_seconds=time_limit_seconds,
        created_by_telegram_id=created_by_telegram_id,
    )
    session.add(code)
    await session.commit()
    await session.refresh(code)
    return code


async def get_exam_code_by_code(session: AsyncSession, code: str) -> ExamCode | None:
    result = await session.execute(select(ExamCode).where(ExamCode.code == code))
    return result.scalars().first()


async def get_exam_code_by_id(session: AsyncSession, exam_code_id: int) -> ExamCode | None:
    return await session.get(ExamCode, exam_code_id)


async def mark_exam_code_used(session: AsyncSession, exam_code_id: int, user_id: int) -> None:
    exam_code = await session.get(ExamCode, exam_code_id)
    if exam_code is not None:
        exam_code.used_by_user_id = user_id
        exam_code.used_at = datetime.utcnow()
        exam_code.started_at = datetime.utcnow()
        await session.commit()


async def get_hard_questions_for_position(
    session: AsyncSession, position_id: int, difficulty: int = 3
) -> list[Question]:
    """Самые сложные вопросы (по одному на категорию) — основа для экзамена."""
    result = await session.execute(
        select(Question)
        .join(Category, Question.category_id == Category.id)
        .where(Category.position_id == position_id, Question.difficulty == difficulty)
        .options(selectinload(Question.options))
        .order_by(Category.order)
    )
    return list(result.scalars().all())


async def create_exam_result(
    session: AsyncSession,
    exam_code_id: int,
    user_id: int,
    position_id: int,
    correct_count: int,
    total_count: int,
    passed: bool,
    bonus_xp_awarded: int,
) -> ExamResult:
    exam_result = ExamResult(
        exam_code_id=exam_code_id,
        user_id=user_id,
        position_id=position_id,
        correct_count=correct_count,
        total_count=total_count,
        passed=passed,
        bonus_xp_awarded=bonus_xp_awarded,
    )
    session.add(exam_result)
    await session.commit()
    await session.refresh(exam_result)
    return exam_result


# ---------- Запросы сотрудников на выдачу кода экзамена ----------

async def create_exam_request(
    session: AsyncSession,
    user_id: int,
    restaurant_id: int,
    position_id: int,
    target_manager_telegram_id: int,
) -> ExamRequest:
    request = ExamRequest(
        user_id=user_id,
        restaurant_id=restaurant_id,
        position_id=position_id,
        target_manager_telegram_id=target_manager_telegram_id,
        status="pending",
    )
    session.add(request)
    await session.commit()
    await session.refresh(request)
    return request


async def get_exam_request_by_id(session: AsyncSession, request_id: int) -> ExamRequest | None:
    return await session.get(ExamRequest, request_id)


async def fulfill_exam_request(session: AsyncSession, request_id: int, exam_code_id: int) -> None:
    request = await session.get(ExamRequest, request_id)
    if request is not None:
        request.status = "fulfilled"
        request.exam_code_id = exam_code_id
        request.decided_at = datetime.utcnow()
        await session.commit()


async def decline_exam_request(session: AsyncSession, request_id: int) -> None:
    request = await session.get(ExamRequest, request_id)
    if request is not None:
        request.status = "declined"
        request.decided_at = datetime.utcnow()
        await session.commit()


# ---------- История экзаменов сотрудника (для панели администратора) ----------

async def get_exam_history_for_user(session: AsyncSession, user_id: int) -> list[dict]:
    """Для каждого сданного/проваленного экзамена — должность, баллы, статус
    и кто из администраторов выдал код (т.е. допустил до попытки)."""
    result = await session.execute(
        select(ExamResult)
        .where(ExamResult.user_id == user_id)
        .options(selectinload(ExamResult.exam_code))
        .order_by(ExamResult.created_at.desc())
    )
    exam_results = list(result.scalars().all())

    history = []
    for exam_result in exam_results:
        position = await session.get(Position, exam_result.position_id)
        issuer_telegram_id = exam_result.exam_code.created_by_telegram_id if exam_result.exam_code else None
        history.append(
            {
                "position": position,
                "correct_count": exam_result.correct_count,
                "total_count": exam_result.total_count,
                "passed": exam_result.passed,
                "bonus_xp_awarded": exam_result.bonus_xp_awarded,
                "issued_by_telegram_id": issuer_telegram_id,
                "created_at": exam_result.created_at,
            }
        )
    return history
