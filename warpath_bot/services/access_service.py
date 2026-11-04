"""Централизованная проверка прав доступа и тарифов.

Логика поиска билдов ничего не знает о подписках: обработчики спрашивают
AccessService «можно ли?» до вызова BuildService. Реальные платежи не
подключены — подписки выдаются администратором (source='test'/'manual').
"""
from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from database.connection import transaction, utcnow_iso
from repositories.user_repository import UserRepository

# Функции бота, доступ к которым проверяется централизованно
FEATURE_SEARCH = "search"
FEATURE_FAVORITE_ADD = "favorite_add"

FREE, PREMIUM, GROUP_PREMIUM = "free", "premium", "group_premium"
PLAN_PRIORITY = {FREE: 0, GROUP_PREMIUM: 1, PREMIUM: 2}

# Минимальный тариф для функции (на будущее: платные функции)
FEATURE_MIN_PLAN: dict[str, str] = {
    FEATURE_SEARCH: FREE,
    FEATURE_FAVORITE_ADD: FREE,
}


@dataclass(frozen=True)
class AccessDecision:
    allowed: bool
    plan: str
    reason: str | None = None  # ключ текста для пользователя
    remaining: int | None = None


class AccessService:
    def __init__(self, conn: sqlite3.Connection, admin_ids: frozenset[int],
                 free_daily_search_limit: int = 50, free_max_favorites: int = 30):
        self.conn = conn
        self.users = UserRepository(conn)
        self.admin_ids = admin_ids
        self.limits = {
            FREE: {"daily_searches": free_daily_search_limit or None, "max_favorites": free_max_favorites},
            GROUP_PREMIUM: {"daily_searches": None, "max_favorites": free_max_favorites},
            PREMIUM: {"daily_searches": None, "max_favorites": None},
        }

    def is_admin(self, user_id: int | None) -> bool:
        return user_id is not None and user_id in self.admin_ids

    def effective_plan(self, user_id: int, chat_id: int | None = None, now: str | None = None) -> str:
        now = now or utcnow_iso()
        plans = set(self.users.active_plans("user", user_id, now))
        if chat_id is not None and chat_id != user_id:
            if GROUP_PREMIUM in self.users.active_plans("chat", chat_id, now):
                plans.add(GROUP_PREMIUM)
        plans.add(FREE)
        return max(plans, key=lambda p: PLAN_PRIORITY.get(p, 0))

    def check(self, feature: str, user_id: int, chat_id: int | None = None,
              now: str | None = None) -> AccessDecision:
        plan = self.effective_plan(user_id, chat_id, now)
        if self.is_admin(user_id):
            return AccessDecision(True, plan)
        required = FEATURE_MIN_PLAN.get(feature)
        if required is None:
            return AccessDecision(False, plan, "access_unknown_feature")
        if PLAN_PRIORITY.get(plan, 0) < PLAN_PRIORITY[required]:
            return AccessDecision(False, plan, "access_plan_required")

        limits = self.limits.get(plan, self.limits[FREE])
        if feature == FEATURE_SEARCH and limits["daily_searches"]:
            used = self.users.get_usage("user", user_id, feature, self._day(now))
            remaining = limits["daily_searches"] - used
            if remaining <= 0:
                return AccessDecision(False, plan, "access_daily_limit", 0)
            return AccessDecision(True, plan, remaining=remaining)
        if feature == FEATURE_FAVORITE_ADD and limits["max_favorites"]:
            if self.users.count_favorites(user_id) >= limits["max_favorites"]:
                return AccessDecision(False, plan, "access_favorites_limit", 0)
        return AccessDecision(True, plan)

    def register_use(self, feature: str, user_id: int, now: str | None = None) -> None:
        with transaction(self.conn):
            self.users.increment_usage("user", user_id, feature, self._day(now))

    def grant(self, subject_type: str, subject_id: int, plan_code: str, days: int | None,
              granted_by: int, source: str = "test") -> int:
        """Выдать подписку без оплаты (для тестирования тарифов)."""
        if not self.users.plan_exists(plan_code):
            raise ValueError("Неизвестный тариф")
        if subject_type not in ("user", "chat"):
            raise ValueError("subject_type должен быть user или chat")
        start = datetime.now(timezone.utc)
        expires = (start + timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ") if days else None
        with transaction(self.conn):
            return self.users.add_subscription(subject_type, subject_id, plan_code,
                                               start.strftime("%Y-%m-%dT%H:%M:%SZ"), expires,
                                               source, granted_by)

    @staticmethod
    def _day(now: str | None) -> str:
        return (now or utcnow_iso())[:10]
