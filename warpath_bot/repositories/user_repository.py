"""Пользователи, избранное, подписки и счётчики использования."""
from __future__ import annotations

import sqlite3


class UserRepository:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def upsert_user(self, telegram_id: int, username: str | None, first_name: str | None,
                    language_code: str | None, now: str) -> None:
        self.conn.execute(
            """INSERT INTO users (telegram_id, username, first_name, language_code, created_at, last_seen_at)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT (telegram_id) DO UPDATE SET
                   username = excluded.username,
                   first_name = excluded.first_name,
                   last_seen_at = excluded.last_seen_at""",
            (telegram_id, username, first_name, language_code or "ru", now, now),
        )

    def get_user(self, telegram_id: int) -> dict | None:
        r = self.conn.execute("SELECT * FROM users WHERE telegram_id = ?", (telegram_id,)).fetchone()
        return dict(r) if r else None

    # --- Избранное ----------------------------------------------------------
    def add_favorite(self, user_id: int, build_id: int) -> bool:
        cur = self.conn.execute(
            "INSERT INTO favorites (user_id, build_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
            (user_id, build_id),
        )
        return cur.rowcount > 0

    def remove_favorite(self, user_id: int, build_id: int) -> bool:
        cur = self.conn.execute(
            "DELETE FROM favorites WHERE user_id = ? AND build_id = ?", (user_id, build_id)
        )
        return cur.rowcount > 0

    def is_favorite(self, user_id: int, build_id: int) -> bool:
        return self.conn.execute(
            "SELECT 1 FROM favorites WHERE user_id = ? AND build_id = ?", (user_id, build_id)
        ).fetchone() is not None

    def count_favorites(self, user_id: int) -> int:
        return self.conn.execute(
            "SELECT COUNT(*) FROM favorites WHERE user_id = ?", (user_id,)
        ).fetchone()[0]

    def list_favorites(self, user_id: int) -> list[dict]:
        rows = self.conn.execute(
            """SELECT b.id, b.title, b.verification_status, b.is_test
               FROM favorites f JOIN builds b ON b.id = f.build_id
               WHERE f.user_id = ? ORDER BY f.created_at DESC, b.id DESC""",
            (user_id,),
        ).fetchall()
        return [dict(r) for r in rows]

    # --- Подписки -------------------------------------------------------------
    def active_plans(self, subject_type: str, subject_id: int, now: str) -> list[str]:
        rows = self.conn.execute(
            """SELECT DISTINCT plan_code FROM subscriptions
               WHERE subject_type = ? AND subject_id = ? AND starts_at <= ?
                 AND (expires_at IS NULL OR expires_at > ?)""",
            (subject_type, subject_id, now, now),
        ).fetchall()
        return [r["plan_code"] for r in rows]

    def add_subscription(self, subject_type: str, subject_id: int, plan_code: str, starts_at: str,
                         expires_at: str | None, source: str, created_by: int | None) -> int:
        cur = self.conn.execute(
            """INSERT INTO subscriptions (subject_type, subject_id, plan_code, starts_at, expires_at, source, created_by)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (subject_type, subject_id, plan_code, starts_at, expires_at, source, created_by),
        )
        return cur.lastrowid

    def revoke_subscriptions(self, subject_type: str, subject_id: int, now: str) -> int:
        cur = self.conn.execute(
            """UPDATE subscriptions SET expires_at = ?
               WHERE subject_type = ? AND subject_id = ? AND (expires_at IS NULL OR expires_at > ?)""",
            (now, subject_type, subject_id, now),
        )
        return cur.rowcount

    def plan_exists(self, plan_code: str) -> bool:
        return self.conn.execute("SELECT 1 FROM plans WHERE code = ?", (plan_code,)).fetchone() is not None

    # --- Счётчики -------------------------------------------------------------
    def get_usage(self, subject_type: str, subject_id: int, feature: str, day: str) -> int:
        r = self.conn.execute(
            "SELECT count FROM usage_counters WHERE subject_type = ? AND subject_id = ? AND feature = ? AND day = ?",
            (subject_type, subject_id, feature, day),
        ).fetchone()
        return r["count"] if r else 0

    def increment_usage(self, subject_type: str, subject_id: int, feature: str, day: str) -> None:
        self.conn.execute(
            """INSERT INTO usage_counters (subject_type, subject_id, feature, day, count)
               VALUES (?, ?, ?, ?, 1)
               ON CONFLICT (subject_type, subject_id, feature, day) DO UPDATE SET count = count + 1""",
            (subject_type, subject_id, feature, day),
        )
