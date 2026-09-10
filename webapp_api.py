"""API-эндпоинты для сайта (Mini App): тесты, прохождение теста, список
персонала для панели администратора.

Каждый запрос обязан содержать initData от Telegram (см. webapp_auth.py) —
без неё или с поддельной подписью запрос отклоняется, независимо от того,
что в нём написано. Так сайт понимает, кто именно его открыл, не полагаясь
ни на что, что мог бы подделать посторонний человек, открывший ссылку
напрямую в браузере.
"""

from __future__ import annotations

import logging
import random
from datetime import datetime

from aiogram import Bot
from aiohttp import web

from config import BOT_TOKEN
from database import crud
from database.database import async_session
from keyboards.keyboards import exam_request_decision_kb
from services import exam_logic
from webapp_auth import validate_init_data

logger = logging.getLogger(__name__)

routes = web.RouteTableDef()


def _cors_headers() -> dict:
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    }


def _json(data, status: int = 200) -> web.Response:
    return web.json_response(data, status=status, headers=_cors_headers())


def _auth_error() -> web.Response:
    return _json({"error": "Откройте это через кнопку в Telegram-боте."}, status=401)


async def _get_telegram_user(init_data: str) -> dict | None:
    return validate_init_data(init_data, BOT_TOKEN)


@routes.options("/api/{tail:.*}")
async def options_handler(request: web.Request) -> web.Response:
    """Ответ на предварительный CORS-запрос браузера (OPTIONS) — без него
    браузер не разрешит сайту на Netlify обращаться к серверу на Render."""
    return web.Response(headers=_cors_headers())


@routes.get("/api/positions")
async def get_positions(request: web.Request) -> web.Response:
    init_data = request.query.get("initData", "")
    tg_user = await _get_telegram_user(init_data)
    if tg_user is None:
        return _auth_error()

    restaurant_id = request.query.get("restaurant_id")
    restaurant_id = int(restaurant_id) if restaurant_id and restaurant_id.isdigit() else None

    async with async_session() as session:
        restaurant_name = None
        if restaurant_id is not None:
            restaurant = await crud.get_restaurant_by_id(session, restaurant_id)
            restaurant_name = restaurant.name if restaurant else None

        positions = await crud.get_active_positions(session, restaurant_id)
        data = []
        for position in positions:
            categories = await crud.get_categories_for_position(session, position.id)
            data.append(
                {
                    "id": position.id,
                    "name": position.name,
                    "emoji": position.emoji,
                    "category_count": len(categories),
                }
            )
    return _json({"restaurant_name": restaurant_name, "positions": data})


@routes.get("/api/categories")
async def get_categories(request: web.Request) -> web.Response:
    init_data = request.query.get("initData", "")
    tg_user = await _get_telegram_user(init_data)
    if tg_user is None:
        return _auth_error()

    position_id = request.query.get("position_id")
    if not position_id or not position_id.isdigit():
        return _json({"error": "position_id обязателен"}, status=400)

    async with async_session() as session:
        categories = await crud.get_categories_for_position(session, int(position_id))
        questions_counts = []
        for category in categories:
            questions = await crud.get_questions_with_options(session, category.id)
            questions_counts.append(len(questions))

    data = [
        {"id": c.id, "name": c.name, "emoji": c.emoji, "pool_size": n}
        for c, n in zip(categories, questions_counts)
    ]
    return _json(data)


@routes.get("/api/questions")
async def get_questions(request: web.Request) -> web.Response:
    init_data = request.query.get("initData", "")
    tg_user = await _get_telegram_user(init_data)
    if tg_user is None:
        return _auth_error()

    category_id = request.query.get("category_id")
    if not category_id or not category_id.isdigit():
        return _json({"error": "category_id обязателен"}, status=400)

    async with async_session() as session:
        questions = await crud.get_questions_with_options(session, int(category_id))
        data = []
        for q in questions:
            # Специально НЕ отдаём is_correct — иначе можно было бы
            # посмотреть правильный ответ прямо в коде страницы до сдачи.
            options = sorted(q.options, key=lambda o: o.order)
            data.append(
                {
                    "id": q.id,
                    "text": q.text,
                    "options": [{"id": o.id, "text": o.text} for o in options],
                }
            )
    return _json(data)


@routes.post("/api/start_test")
async def start_test(request: web.Request) -> web.Response:
    """Создаёт запись о начатом тесте и сразу возвращает список вопросов
    (без указания, какой вариант правильный — это остаётся только в базе
    данных на сервере)."""
    try:
        body = await request.json()
    except Exception:
        return _json({"error": "Некорректный запрос."}, status=400)

    init_data = body.get("initData", "")
    tg_user = await _get_telegram_user(init_data)
    if tg_user is None:
        return _auth_error()

    category_id = body.get("category_id")
    level = body.get("level", 1)
    if not isinstance(category_id, int):
        return _json({"error": "category_id обязателен"}, status=400)
    if level not in (1, 2, 3):
        level = 1

    async with async_session() as session:
        user = await crud.get_or_create_user(
            session,
            telegram_id=tg_user["id"],
            username=tg_user.get("username"),
            full_name=(tg_user.get("first_name", "") + " " + tg_user.get("last_name", "")).strip(),
        )
        test_result = await crud.create_test_result(session, user.id, category_id)
        all_questions = await crud.get_questions_with_options(session, category_id)

        # Уровни 1/2/3 доступны сразу всем, без сдачи экзамена — уровень
        # просто определяет и сложность (вопросы этого уровня и легче), и
        # длину теста: уровень 1 — 5 вопросов, уровень 2 — 10, уровень 3 — 15.
        pool = [q for q in all_questions if q.difficulty <= level]
        if not pool:
            pool = all_questions  # на случай, если вопросов этого уровня ещё не добавили

        wanted = level * 5
        selected = random.sample(pool, min(wanted, len(pool)))
        random.shuffle(selected)

        questions_data = []
        for q in selected:
            options = list(q.options)
            random.shuffle(options)
            questions_data.append(
                {
                    "id": q.id,
                    "text": q.text,
                    "options": [{"id": o.id, "text": o.text} for o in options],
                }
            )

    return _json({"test_result_id": test_result.id, "questions": questions_data})


@routes.post("/api/answer_question")
async def answer_question(request: web.Request) -> web.Response:
    """Принимает ответ на ОДИН вопрос, сразу говорит, верный ли он (и какой
    вариант был правильным — для подсветки), и сохраняет ответ в базу."""
    try:
        body = await request.json()
    except Exception:
        return _json({"error": "Некорректный запрос."}, status=400)

    init_data = body.get("initData", "")
    tg_user = await _get_telegram_user(init_data)
    if tg_user is None:
        return _auth_error()

    test_result_id = body.get("test_result_id")
    question_id = body.get("question_id")
    answer_option_id = body.get("answer_option_id")
    if not all(isinstance(v, int) for v in (test_result_id, question_id, answer_option_id)):
        return _json({"error": "Некорректные данные ответа."}, status=400)

    async with async_session() as session:
        question = await crud.get_question_with_options(session, question_id)
        if question is None:
            return _json({"error": "Вопрос не найден."}, status=404)

        correct_option = next((o for o in question.options if o.is_correct), None)
        chosen = await crud.get_answer_option(session, answer_option_id)
        is_correct = bool(chosen and chosen.is_correct and chosen.question_id == question_id)

        await crud.save_user_answer(session, test_result_id, question_id, answer_option_id, is_correct)

    return _json(
        {
            "is_correct": is_correct,
            "correct_option_id": correct_option.id if correct_option else None,
        }
    )


@routes.post("/api/finish_test")
async def finish_test(request: web.Request) -> web.Response:
    try:
        body = await request.json()
    except Exception:
        return _json({"error": "Некорректный запрос."}, status=400)

    init_data = body.get("initData", "")
    tg_user = await _get_telegram_user(init_data)
    if tg_user is None:
        return _auth_error()

    test_result_id = body.get("test_result_id")
    correct_count = body.get("correct_count")
    total_count = body.get("total_count")
    if not all(isinstance(v, int) for v in (test_result_id, correct_count, total_count)):
        return _json({"error": "Некорректные данные."}, status=400)

    async with async_session() as session:
        final = await crud.finalize_test_result(session, test_result_id, correct_count, total_count)

    return _json(
        {
            "correct_count": final.correct_count,
            "total_count": final.total_count,
            "percentage": final.percentage,
        }
    )


@routes.get("/api/my_results")
async def my_results(request: web.Request) -> web.Response:
    """Личные результаты тестов текущего пользователя — доступны кому
    угодно (не только менеджеру) для СВОИХ данных, определяемых по
    initData, а не по параметру в ссылке — иначе можно было бы посмотреть
    чужие результаты, просто подставив другой user_id."""
    init_data = request.query.get("initData", "")
    tg_user = await _get_telegram_user(init_data)
    if tg_user is None:
        return _auth_error()

    restaurant_id = request.query.get("restaurant_id")
    restaurant_id = int(restaurant_id) if restaurant_id and restaurant_id.isdigit() else None

    async with async_session() as session:
        user = await crud.get_or_create_user(
            session,
            telegram_id=tg_user["id"],
            username=tg_user.get("username"),
            full_name=(tg_user.get("first_name", "") + " " + tg_user.get("last_name", "")).strip(),
        )
        if restaurant_id is not None:
            stats = await crud.get_user_stats_for_restaurant(session, user.id, restaurant_id)
            raw_history = await crud.get_recent_results_for_user_in_restaurant(
                session, user.id, restaurant_id
            )
        else:
            stats = await crud.get_user_stats(session, user.id)
            raw_history = await crud.get_recent_results_for_user(session, user.id)

    history = [
        {
            "category": r.category.name if r.category else None,
            "position": r.category.position.name if r.category and r.category.position else None,
            "correct_count": r.correct_count,
            "total_count": r.total_count,
            "percentage": r.percentage,
            "date": r.created_at.strftime("%d.%m.%Y") if r.created_at else None,
        }
        for r in raw_history
    ]

    return _json(
        {
            "tests_completed": stats["tests_completed"],
            "avg_percentage": stats["avg_percentage"],
            "history": history,
        }
    )


@routes.get("/api/test_result_detail")
async def test_result_detail(request: web.Request) -> web.Response:
    """Детальный разбор одного пройденного теста — какие вопросы, какие
    ответы дал сотрудник, что было бы правильно. Доступ только
    администратору заведения, и только по тестам СВОЕГО сотрудника —
    иначе можно было бы подсмотреть чужой разбор, просто подставив ID."""
    init_data = request.query.get("initData", "")
    tg_user = await _get_telegram_user(init_data)
    if tg_user is None:
        return _auth_error()

    restaurant_id = request.query.get("restaurant_id")
    user_id = request.query.get("user_id")
    test_result_id = request.query.get("test_result_id")
    if not (
        restaurant_id
        and restaurant_id.isdigit()
        and user_id
        and user_id.isdigit()
        and test_result_id
        and test_result_id.isdigit()
    ):
        return _json({"error": "restaurant_id, user_id и test_result_id обязательны"}, status=400)
    restaurant_id = int(restaurant_id)
    user_id = int(user_id)
    test_result_id = int(test_result_id)

    async with async_session() as session:
        if not await crud.is_restaurant_manager(session, restaurant_id, tg_user["id"]):
            return _json({"error": "Доступ только для администраторов заведения."}, status=403)

        test_result = await crud.get_test_result_by_id(session, test_result_id)
        if test_result is None or test_result.user_id != user_id:
            return _json({"error": "Тест не найден."}, status=404)

        breakdown = await crud.get_test_result_breakdown(session, test_result_id)

    return _json({"breakdown": breakdown})


@routes.get("/api/employees")
async def get_employees(request: web.Request) -> web.Response:
    """Список персонала для панели администратора — доступен только
    реальному менеджеру этого заведения, проверяется на сервере."""
    init_data = request.query.get("initData", "")
    tg_user = await _get_telegram_user(init_data)
    if tg_user is None:
        return _auth_error()

    restaurant_id = request.query.get("restaurant_id")
    if not restaurant_id or not restaurant_id.isdigit():
        return _json({"error": "restaurant_id обязателен"}, status=400)
    restaurant_id = int(restaurant_id)

    async with async_session() as session:
        if not await crud.is_restaurant_manager(session, restaurant_id, tg_user["id"]):
            return _json({"error": "Доступ только для администраторов заведения."}, status=403)

        employees = await crud.get_employees_for_restaurant(session, restaurant_id)
        data = [
            {
                "user_id": item["user"].id,
                "name": item["user"].full_name or item["user"].username or "Без имени",
                "position": item["position"].name if item["position"] else None,
                "tests_completed": item["tests_completed"],
                "avg_percentage": item["avg_percentage"],
            }
            for item in employees
        ]
    return _json(data)


@routes.get("/api/employee")
async def get_employee_detail(request: web.Request) -> web.Response:
    init_data = request.query.get("initData", "")
    tg_user = await _get_telegram_user(init_data)
    if tg_user is None:
        return _auth_error()

    restaurant_id = request.query.get("restaurant_id")
    user_id = request.query.get("user_id")
    if not (restaurant_id and restaurant_id.isdigit() and user_id and user_id.isdigit()):
        return _json({"error": "restaurant_id и user_id обязательны"}, status=400)
    restaurant_id = int(restaurant_id)
    user_id = int(user_id)

    async with async_session() as session:
        if not await crud.is_restaurant_manager(session, restaurant_id, tg_user["id"]):
            return _json({"error": "Доступ только для администраторов заведения."}, status=403)

        target = await crud.get_user_by_id(session, user_id)
        if target is None or target.restaurant_id != restaurant_id:
            return _json({"error": "Сотрудник не найден."}, status=404)

        stats = await crud.get_user_stats_for_restaurant(session, user_id, restaurant_id)
        raw_history = await crud.get_recent_results_for_user_in_restaurant(
            session, user_id, restaurant_id
        )

    history = [
        {
            "id": r.id,
            "position": r.category.position.name if r.category and r.category.position else None,
            "category": r.category.name if r.category else None,
            "correct_count": r.correct_count,
            "total_count": r.total_count,
            "percentage": r.percentage,
            "date": r.created_at.strftime("%d.%m.%Y") if r.created_at else None,
        }
        for r in raw_history
    ]

    return _json(
        {
            "name": target.full_name or target.username or "Без имени",
            "tests_completed": stats["tests_completed"],
            "avg_percentage": stats["avg_percentage"],
            "history": history,
        }
    )


# ---------- Запрос на экзамен ----------

@routes.get("/api/eligible_exam_positions")
async def eligible_exam_positions(request: web.Request) -> web.Response:
    """Должности, по которым сотрудник уже набрал 80%+ в обычном тесте
    этого заведения — только по ним разрешено запрашивать экзамен."""
    init_data = request.query.get("initData", "")
    tg_user = await _get_telegram_user(init_data)
    if tg_user is None:
        return _auth_error()

    restaurant_id = request.query.get("restaurant_id")
    if not restaurant_id or not restaurant_id.isdigit():
        return _json({"error": "restaurant_id обязателен"}, status=400)
    restaurant_id = int(restaurant_id)

    async with async_session() as session:
        user = await crud.get_or_create_user(
            session,
            telegram_id=tg_user["id"],
            username=tg_user.get("username"),
            full_name=(tg_user.get("first_name", "") + " " + tg_user.get("last_name", "")).strip(),
        )
        positions = await crud.get_eligible_positions_for_exam(session, user.id, restaurant_id)

    return _json([{"id": p.id, "name": p.name, "emoji": p.emoji} for p in positions])


@routes.get("/api/restaurant_managers_list")
async def restaurant_managers_list(request: web.Request) -> web.Response:
    init_data = request.query.get("initData", "")
    tg_user = await _get_telegram_user(init_data)
    if tg_user is None:
        return _auth_error()

    restaurant_id = request.query.get("restaurant_id")
    if not restaurant_id or not restaurant_id.isdigit():
        return _json({"error": "restaurant_id обязателен"}, status=400)
    restaurant_id = int(restaurant_id)

    async with async_session() as session:
        managers = await crud.get_restaurant_managers(session, restaurant_id)

    return _json(
        [{"telegram_id": m.telegram_id, "name": m.name or f"ID {m.telegram_id}"} for m in managers]
    )


@routes.post("/api/request_exam")
async def request_exam(request: web.Request) -> web.Response:
    """Отправляет выбранному администратору запрос на экзамен —
    проверяет допуск (80%+) заново на сервере, а не доверяет тому, что
    прислал браузер."""
    try:
        body = await request.json()
    except Exception:
        return _json({"error": "Некорректный запрос."}, status=400)

    init_data = body.get("initData", "")
    tg_user = await _get_telegram_user(init_data)
    if tg_user is None:
        return _auth_error()

    restaurant_id = body.get("restaurant_id")
    position_id = body.get("position_id")
    manager_telegram_id = body.get("manager_telegram_id")
    if not all(isinstance(v, int) for v in (restaurant_id, position_id, manager_telegram_id)):
        return _json({"error": "Некорректные данные запроса."}, status=400)

    async with async_session() as session:
        user = await crud.get_or_create_user(
            session,
            telegram_id=tg_user["id"],
            username=tg_user.get("username"),
            full_name=(tg_user.get("first_name", "") + " " + tg_user.get("last_name", "")).strip(),
        )

        eligible = await crud.get_eligible_positions_for_exam(session, user.id, restaurant_id)
        if not any(p.id == position_id for p in eligible):
            return _json(
                {"error": "Пока недостаточно 80% в обычном тесте по этой должности."}, status=403
            )

        restaurant = await crud.get_restaurant_by_id(session, restaurant_id)
        position = await crud.get_position_by_id(session, position_id)
        exam_request = await crud.create_exam_request(
            session, user.id, restaurant_id, position_id, manager_telegram_id
        )
        user_display_name = user.full_name or user.username or "Сотрудник"

    bot = Bot(token=BOT_TOKEN)
    try:
        await bot.send_message(
            chat_id=manager_telegram_id,
            text=(
                f"🎓 {user_display_name} хочет пройти экзамен для повышения "
                f"квалификации\n"
                f"Заведение: {restaurant.name}\n"
                f"Должность: {position.emoji} {position.name}"
            ),
            reply_markup=exam_request_decision_kb(exam_request.id),
        )
    except Exception:
        logger.warning("Не удалось уведомить администратора о запросе экзамена")
    finally:
        await bot.session.close()

    return _json({"ok": True, "request_id": exam_request.id})


@routes.post("/api/redeem_exam_code")
async def redeem_exam_code(request: web.Request) -> web.Response:
    """Начинает попытку сдачи экзамена по одноразовому коду. Код сразу
    помечается использованным (как и в боте) — повторно начать нельзя."""
    try:
        body = await request.json()
    except Exception:
        return _json({"error": "Некорректный запрос."}, status=400)

    init_data = body.get("initData", "")
    tg_user = await _get_telegram_user(init_data)
    if tg_user is None:
        return _auth_error()

    code = (body.get("code") or "").strip().upper()
    if not code:
        return _json({"error": "Введите код."}, status=400)

    async with async_session() as session:
        exam_code = await crud.get_exam_code_by_code(session, code)
        if exam_code is None:
            return _json({"error": "Код не найден."}, status=404)
        if exam_code.used_by_user_id is not None:
            return _json({"error": "Этот код уже использован."}, status=409)

        user = await crud.get_or_create_user(
            session,
            telegram_id=tg_user["id"],
            username=tg_user.get("username"),
            full_name=(tg_user.get("first_name", "") + " " + tg_user.get("last_name", "")).strip(),
        )
        if user.restaurant_id != exam_code.restaurant_id:
            return _json({"error": "Этот код предназначен для другого заведения."}, status=403)

        questions = await crud.get_hard_questions_for_position(session, exam_code.position_id)
        if not questions:
            return _json({"error": "Для этой должности пока нет вопросов для экзамена."}, status=404)

        await crud.mark_exam_code_used(session, exam_code.id, user.id)

        questions_data = [
            {
                "id": q.id,
                "text": q.text,
                "options": [{"id": o.id, "text": o.text} for o in q.options],
            }
            for q in questions
        ]

    return _json(
        {
            "exam_code_id": exam_code.id,
            "position_id": exam_code.position_id,
            "time_limit_seconds": exam_code.time_limit_seconds,
            "questions": questions_data,
        }
    )


@routes.post("/api/exam_answer")
async def exam_answer(request: web.Request) -> web.Response:
    """Проверяет один ответ во время экзамена. Если время уже истекло —
    отдельно сообщает об этом, чтобы сайт сразу завершил попытку."""
    try:
        body = await request.json()
    except Exception:
        return _json({"error": "Некорректный запрос."}, status=400)

    init_data = body.get("initData", "")
    tg_user = await _get_telegram_user(init_data)
    if tg_user is None:
        return _auth_error()

    exam_code_id = body.get("exam_code_id")
    question_id = body.get("question_id")
    answer_option_id = body.get("answer_option_id")
    if not all(isinstance(v, int) for v in (exam_code_id, question_id, answer_option_id)):
        return _json({"error": "Некорректные данные ответа."}, status=400)

    async with async_session() as session:
        exam_code = await crud.get_exam_code_by_id(session, exam_code_id)
        if exam_code is None or exam_code.started_at is None:
            return _json({"error": "Попытка не найдена."}, status=404)

        elapsed = (datetime.utcnow() - exam_code.started_at).total_seconds()
        if elapsed > exam_code.time_limit_seconds:
            return _json({"timed_out": True})

        question = await crud.get_question_with_options(session, question_id)
        if question is None:
            return _json({"error": "Вопрос не найден."}, status=404)

        chosen = await crud.get_answer_option(session, answer_option_id)
        is_correct = bool(chosen and chosen.is_correct and chosen.question_id == question_id)

    return _json({"timed_out": False, "is_correct": is_correct})


@routes.post("/api/finish_exam")
async def finish_exam(request: web.Request) -> web.Response:
    """Завершает попытку экзамена. Итог по времени проверяется на сервере
    заново (elapsed > лимит), а не по тому, что прислал браузер — иначе
    можно было бы обойти таймер, просто не отправив timed_out."""
    try:
        body = await request.json()
    except Exception:
        return _json({"error": "Некорректный запрос."}, status=400)

    init_data = body.get("initData", "")
    tg_user = await _get_telegram_user(init_data)
    if tg_user is None:
        return _auth_error()

    exam_code_id = body.get("exam_code_id")
    correct_count = body.get("correct_count")
    total_count = body.get("total_count")
    if not all(isinstance(v, int) for v in (exam_code_id, correct_count, total_count)):
        return _json({"error": "Некорректные данные."}, status=400)

    async with async_session() as session:
        exam_code = await crud.get_exam_code_by_id(session, exam_code_id)
        if exam_code is None or exam_code.used_by_user_id is None:
            return _json({"error": "Попытка не найдена."}, status=404)

        elapsed = (datetime.utcnow() - exam_code.started_at).total_seconds()
        timed_out = elapsed > exam_code.time_limit_seconds

        result = await exam_logic.complete_exam(
            session,
            user_id=exam_code.used_by_user_id,
            exam_code_id=exam_code.id,
            position_id=exam_code.position_id,
            correct_count=correct_count,
            total_count=total_count,
            timed_out=timed_out,
        )

    return _json(
        {
            "passed": result["passed"],
            "timed_out": result["timed_out"],
            "correct_count": result["correct_count"],
            "total_count": result["total_count"],
            "new_rank": result["new_rank"].title if result["new_rank"] else None,
            "new_rank_emoji": result["new_rank"].emoji if result["new_rank"] else None,
        }
    )
