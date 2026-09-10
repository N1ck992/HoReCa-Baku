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

from aiohttp import web

from config import BOT_TOKEN
from database import crud
from database.database import async_session
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
    return _json(data)


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
        {"id": c.id, "name": c.name, "emoji": c.emoji, "question_count": min(n, 5), "pool_size": n}
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
    if not isinstance(category_id, int):
        return _json({"error": "category_id обязателен"}, status=400)

    async with async_session() as session:
        user = await crud.get_or_create_user(
            session,
            telegram_id=tg_user["id"],
            username=tg_user.get("username"),
            full_name=(tg_user.get("first_name", "") + " " + tg_user.get("last_name", "")).strip(),
        )
        test_result = await crud.create_test_result(session, user.id, category_id)
        all_questions = await crud.get_questions_with_options(session, category_id)

        # Если вопросов в категории больше 5 — берём 5 случайных, а не
        # всегда одни и те же первые. Порядок вариантов ответа тоже
        # перемешиваем при каждой попытке — иначе правильный ответ мог
        # случайно оказаться, например, всегда первым в списке.
        selected = random.sample(all_questions, 5) if len(all_questions) > 5 else list(all_questions)
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
        raw_history = await crud.get_exam_history_for_user(session, user_id)

    history = [
        {
            "position": item["position"].name if item["position"] else None,
            "correct_count": item["correct_count"],
            "total_count": item["total_count"],
            "passed": item["passed"],
            "date": item["created_at"].strftime("%d.%m.%Y") if item["created_at"] else None,
        }
        for item in raw_history
    ]

    return _json(
        {
            "name": target.full_name or target.username or "Без имени",
            "tests_completed": stats["tests_completed"],
            "avg_percentage": stats["avg_percentage"],
            "history": history,
        }
    )
