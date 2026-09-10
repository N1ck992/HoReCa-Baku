from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    """Сотрудник, зарегистрированный в боте. Уникальный ключ — telegram_id."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    telegram_id: Mapped[int] = mapped_column(BigInteger, unique=True, index=True, nullable=False)
    username: Mapped[str | None] = mapped_column(String(255), nullable=True)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    current_position_id: Mapped[int | None] = mapped_column(
        ForeignKey("positions.id"), nullable=True
    )
    restaurant_id: Mapped[int | None] = mapped_column(
        ForeignKey("restaurants.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    current_position: Mapped["Position"] = relationship(foreign_keys=[current_position_id])
    test_results: Mapped[list["TestResult"]] = relationship(back_populates="user")
    restaurant: Mapped["Restaurant"] = relationship(foreign_keys=[restaurant_id])


class Position(Base):
    """Рабочая должность (Повар, Бармен, Официант, ...).

    restaurant_id — необязательное поле: если None, должность общая и видна
    всем пользователям бота (как Повар/Бармен/Официант). Если указано —
    должность видна только сотрудникам этого конкретного заведения (для
    уникальных тестов под меню/процедуры одного ресторана).
    """

    __tablename__ = "positions"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(50))
    name: Mapped[str] = mapped_column(String(255))
    emoji: Mapped[str] = mapped_column(String(10), default="")
    order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    restaurant_id: Mapped[int | None] = mapped_column(
        ForeignKey("restaurants.id"), nullable=True
    )

    categories: Mapped[list["Category"]] = relationship(back_populates="position")


class Category(Base):
    """Категория теста внутри должности (например, 'Работа с гостями')."""

    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    position_id: Mapped[int] = mapped_column(ForeignKey("positions.id"))
    code: Mapped[str] = mapped_column(String(50))
    name: Mapped[str] = mapped_column(String(255))
    emoji: Mapped[str] = mapped_column(String(10), default="")
    order: Mapped[int] = mapped_column(Integer, default=0)

    position: Mapped["Position"] = relationship(back_populates="categories")
    questions: Mapped[list["Question"]] = relationship(
        back_populates="category", order_by="Question.order"
    )


class Question(Base):
    """Вопрос теста. difficulty: 1 = лёгкий, 2 = средний, 3 = сложный.

    image_path — необязательный путь к картинке внутри data/images/
    (например, "bartender/panel_01.png"). Если не задан — вопрос
    показывается обычным текстом, без картинки.
    """

    __tablename__ = "questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"))
    text: Mapped[str] = mapped_column(Text)
    order: Mapped[int] = mapped_column(Integer, default=0)
    difficulty: Mapped[int] = mapped_column(Integer, default=1)
    image_path: Mapped[str | None] = mapped_column(String(255), nullable=True)

    category: Mapped["Category"] = relationship(back_populates="questions")
    options: Mapped[list["AnswerOption"]] = relationship(
        back_populates="question", order_by="AnswerOption.order"
    )


class AnswerOption(Base):
    """Вариант ответа на вопрос."""

    __tablename__ = "answer_options"

    id: Mapped[int] = mapped_column(primary_key=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id"))
    text: Mapped[str] = mapped_column(Text)
    is_correct: Mapped[bool] = mapped_column(Boolean, default=False)
    order: Mapped[int] = mapped_column(Integer, default=0)

    question: Mapped["Question"] = relationship(back_populates="options")


class Rank(Base):
    """Ранг сотрудника внутри должности (например, Бармен → Миксолог → Сомелье).

    Ранг определяется накопленным опытом (XP) пользователя по этой должности.
    """

    __tablename__ = "ranks"

    id: Mapped[int] = mapped_column(primary_key=True)
    position_id: Mapped[int] = mapped_column(ForeignKey("positions.id"))
    level: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(255))
    emoji: Mapped[str] = mapped_column(String(10), default="")
    min_xp: Mapped[int] = mapped_column(Integer, default=0)

    position: Mapped["Position"] = relationship()


class TestResult(Base):
    """Результат прохождения одного теста (одной категории) пользователем."""

    __tablename__ = "test_results"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"))
    correct_count: Mapped[int] = mapped_column(Integer, default=0)
    total_count: Mapped[int] = mapped_column(Integer, default=0)
    percentage: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="test_results")
    category: Mapped["Category"] = relationship()
    answers: Mapped[list["UserAnswer"]] = relationship(back_populates="test_result")


class UserAnswer(Base):
    """Конкретный ответ пользователя на вопрос в рамках теста."""

    __tablename__ = "user_answers"

    id: Mapped[int] = mapped_column(primary_key=True)
    test_result_id: Mapped[int] = mapped_column(ForeignKey("test_results.id"))
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id"))
    answer_option_id: Mapped[int] = mapped_column(ForeignKey("answer_options.id"))
    is_correct: Mapped[bool] = mapped_column(Boolean, default=False)

    test_result: Mapped["TestResult"] = relationship(back_populates="answers")
    question: Mapped["Question"] = relationship()


class Vacancy(Base):
    """Запись о вакансии, опубликованной пользователем бота в канал вакансий.

    Сама вакансия отображается в Telegram-канале (VACANCIES_CHANNEL), а тут
    хранится копия — на случай если понадобится история/учёт в админке.
    """

    __tablename__ = "vacancies"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text)
    salary: Mapped[str | None] = mapped_column(String(255), nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by_telegram_id: Mapped[int] = mapped_column(BigInteger)
    created_by_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Restaurant(Base):
    """Заведение (ресторан). Сотрудники привязываются к нему, отправив
    /start в Telegram-группу этого заведения. Администраторы (менеджеры)
    заведения — в отдельной таблице RestaurantManager, их может быть
    несколько."""

    __tablename__ = "restaurants"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    # ID Telegram-группы заведения. Заполняется, когда менеджер отправляет
    # /link_restaurant <id> внутри своей группы. Пока не заполнено — None.
    group_chat_id: Mapped[int | None] = mapped_column(BigInteger, unique=True, nullable=True)
    # Архивированное заведение неактивно (не показывается в меню, тестах,
    # рейтинге), но данные не стираются — история персонала остаётся
    # доступна в их личном профиле, привязка не разрывается.
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    managers: Mapped[list["RestaurantManager"]] = relationship(back_populates="restaurant")


class RestaurantManager(Base):
    """Администратор (менеджер) заведения. У одного заведения их может быть
    несколько; любой из них может добавлять и удалять других — см.
    /managers в handlers/restaurants.py."""

    __tablename__ = "restaurant_managers"
    __table_args__ = (UniqueConstraint("restaurant_id", "telegram_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    restaurant_id: Mapped[int] = mapped_column(ForeignKey("restaurants.id"))
    telegram_id: Mapped[int] = mapped_column(BigInteger)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    added_by_telegram_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    restaurant: Mapped["Restaurant"] = relationship(back_populates="managers")


class RestaurantRequest(Base):
    """Заявка пользователя на добавление нового заведения ('➕ Добавить
    заведение' в главном меню). Требует подтверждения глобальным
    администратором, прежде чем превратится в настоящий Restaurant."""

    __tablename__ = "restaurant_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    requested_by_telegram_id: Mapped[int] = mapped_column(BigInteger)
    requested_by_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # status: "pending" | "approved" | "rejected"
    status: Mapped[str] = mapped_column(String(20), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class RestaurantJoinRequest(Base):
    """Заявка человека на вступление в заведение как сотрудник — создаётся
    при переходе по личной ссылке join_{id} (см. handlers/start.py).
    Требует подтверждения от менеджера заведения, прежде чем человек
    получит доступ к тестам — иначе по утёкшей ссылке мог бы подключиться
    кто угодно."""

    __tablename__ = "restaurant_join_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    restaurant_id: Mapped[int] = mapped_column(ForeignKey("restaurants.id"))
    telegram_id: Mapped[int] = mapped_column(BigInteger)
    telegram_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Если ссылка была персональной (joinm_...) — здесь ID менеджера,
    # который её выдал. Уведомление о заявке уходит ТОЛЬКО ему, а не всем
    # администраторам заведения разом — иначе у остальных "зависают"
    # неактуальные кнопки после того, как кто-то уже принял решение.
    target_manager_telegram_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    # status: "pending" | "approved" | "rejected"
    status: Mapped[str] = mapped_column(String(20), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class UserPositionLevel(Base):
    """Открытый уровень сложности вопросов сотрудника по конкретной
    должности (только для уникальных тестов заведения, не для общих
    пробных). 1 = лёгкие, 2 = средние, 3 = сложные. По умолчанию у всех
    уровень 1 — открывается дальше только после сдачи экзамена по этой
    должности."""

    __tablename__ = "user_position_levels"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    position_id: Mapped[int] = mapped_column(ForeignKey("positions.id"))
    unlocked_difficulty: Mapped[int] = mapped_column(Integer, default=1)


class RestaurantArchiveRequest(Base):
    """Заявка на архивирование заведения — требует единогласного
    одобрения ВСЕХ администраторов этого заведения (не только того, кто
    инициировал). Пока не архивирует ничего сама — только отслеживает
    процесс, конкретные голоса — в RestaurantArchiveVote."""

    __tablename__ = "restaurant_archive_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    restaurant_id: Mapped[int] = mapped_column(ForeignKey("restaurants.id"))
    initiated_by_telegram_id: Mapped[int] = mapped_column(BigInteger)
    # status: "pending" | "approved" | "declined"
    status: Mapped[str] = mapped_column(String(20), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class RestaurantArchiveVote(Base):
    """Один голос одного администратора по конкретной заявке на
    архивирование. Инициатор сразу получает голос "approved" автоматически
    (сам факт нажатия кнопки — это его согласие)."""

    __tablename__ = "restaurant_archive_votes"

    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[int] = mapped_column(ForeignKey("restaurant_archive_requests.id"))
    manager_telegram_id: Mapped[int] = mapped_column(BigInteger)
    # decision: "approved" | "declined"
    decision: Mapped[str] = mapped_column(String(20))
    decided_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ExamCode(Base):
    """Одноразовый код на экзамен, который менеджер выдаёт сотруднику.

    Сотрудник вводит код боту и проходит тест на время по самым сложным
    вопросам выбранной должности. При успехе код становится использованным
    и сотрудник сразу переходит на следующий ранг по этой должности.
    """

    __tablename__ = "exam_codes"

    id: Mapped[int] = mapped_column(primary_key=True)
    restaurant_id: Mapped[int] = mapped_column(ForeignKey("restaurants.id"))
    position_id: Mapped[int] = mapped_column(ForeignKey("positions.id"))
    code: Mapped[str] = mapped_column(String(20), unique=True)
    time_limit_seconds: Mapped[int] = mapped_column(Integer, default=180)
    created_by_telegram_id: Mapped[int] = mapped_column(BigInteger)
    used_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Когда попытка реально началась — на сайте нет постоянно работающего
    # процесса-таймера (в отличие от бота), поэтому окончание времени
    # проверяется сравнением текущего момента с started_at + лимит,
    # при каждом обращении, а не отдельным фоновым отсчётом.
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    restaurant: Mapped["Restaurant"] = relationship()
    position: Mapped["Position"] = relationship()


class ExamRequest(Base):
    """Запрос сотрудника конкретному администратору: 'выдай мне код на
    экзамен'. Раз администраторов может быть несколько, сотрудник сам
    выбирает, кому адресовать запрос — только выбранный админ получает
    уведомление и может его одобрить."""

    __tablename__ = "exam_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    restaurant_id: Mapped[int] = mapped_column(ForeignKey("restaurants.id"))
    position_id: Mapped[int] = mapped_column(ForeignKey("positions.id"))
    target_manager_telegram_id: Mapped[int] = mapped_column(BigInteger)
    # status: "pending" | "fulfilled" | "declined"
    status: Mapped[str] = mapped_column(String(20), default="pending")
    exam_code_id: Mapped[int | None] = mapped_column(ForeignKey("exam_codes.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class ExamResult(Base):
    """Результат прохождения экзамена по одноразовому коду."""

    __tablename__ = "exam_results"

    id: Mapped[int] = mapped_column(primary_key=True)
    exam_code_id: Mapped[int] = mapped_column(ForeignKey("exam_codes.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    position_id: Mapped[int] = mapped_column(ForeignKey("positions.id"))
    correct_count: Mapped[int] = mapped_column(Integer, default=0)
    total_count: Mapped[int] = mapped_column(Integer, default=0)
    passed: Mapped[bool] = mapped_column(Boolean, default=False)
    # Бонусный XP, начисленный за сдачу — ровно столько, чтобы гарантированно
    # перейти на следующий ранг по этой должности (см. handlers/exams.py).
    bonus_xp_awarded: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    exam_code: Mapped["ExamCode"] = relationship()
