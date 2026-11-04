"""Административные операции. Каждое изменение пишется в admin_audit_log."""
from __future__ import annotations

import sqlite3

from database.connection import applied_versions, transaction, utcnow_iso
from models import ALL_STATUSES, OUTDATED, VERIFIED
from repositories.admin_repository import AdminRepository
from repositories.build_repository import BuildRepository


class AdminError(Exception):
    """Понятная администратору ошибка (без внутренних деталей)."""


class AdminService:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
        self.builds = BuildRepository(conn)
        self.log = AdminRepository(conn)

    def health(self) -> dict:
        integrity = self.conn.execute("PRAGMA integrity_check").fetchone()[0]
        return {
            "integrity": integrity,
            "migrations": sorted(applied_versions(self.conn)),
            "stats": self.builds.stats(),
        }

    def set_status(self, admin_id: int, build_id: int, status: str, reason: str | None) -> None:
        if status not in ALL_STATUSES:
            raise AdminError("Неизвестный статус. Допустимо: " + ", ".join(ALL_STATUSES))
        build = self.builds.get_build(build_id)
        if build is None:
            raise AdminError(f"Билд #{build_id} не найден.")
        if status == VERIFIED:
            # Те же правила, что и при импорте: «проверено» только с основаниями
            if build.is_test:
                raise AdminError("Тестовый билд нельзя отметить как проверенный.")
            if not any(s.confirms for s in build.sources):
                raise AdminError("Нет подтверждающего источника — статус verified недоступен.")
            if not build.game_version:
                raise AdminError("Не указана версия игры — статус verified недоступен.")
            if not reason:
                raise AdminError("Для verified укажите обоснование после статуса.")
        if status == OUTDATED and not reason:
            reason = "Помечено устаревшим администратором"
        now = utcnow_iso()
        with transaction(self.conn):
            self.builds.set_status(build_id, status, reason, now)
            if status == VERIFIED:
                self.conn.execute("UPDATE builds SET last_verified_at = ? WHERE id = ?", (now[:10], build_id))
            self.log.log(admin_id, "set_status", "build", build_id,
                         {"from": build.verification_status, "to": status, "reason": reason})

    def edit_field(self, admin_id: int, build_id: int, field_name: str, value: str) -> None:
        allowed = BuildRepository.EDITABLE_TEXT_FIELDS + BuildRepository.EDITABLE_LIST_FIELDS
        if field_name not in allowed:
            raise AdminError("Можно редактировать: " + ", ".join(allowed))
        if not value.strip() or len(value) > 3000:
            raise AdminError("Значение пустое или длиннее 3000 символов.")
        with transaction(self.conn):
            if not self.builds.update_field(build_id, field_name, value.strip(), utcnow_iso()):
                raise AdminError(f"Билд #{build_id} не найден.")
            self.log.log(admin_id, "edit_field", "build", build_id, {"field": field_name})

    def register_game_update(self, admin_id: int, game_code: str, version: str) -> int:
        """Новая версия игры: проверенные билды старых версий -> «возможно устарел»."""
        version = version.strip()
        if not version or len(version) > 40:
            raise AdminError("Укажите версию игры (до 40 символов).")
        game = self.builds.get_game_by_code(game_code)
        if game is None:
            raise AdminError("Игра не найдена.")
        with transaction(self.conn):
            self.conn.execute(
                "INSERT INTO game_versions (game_id, version) VALUES (?, ?) ON CONFLICT DO NOTHING",
                (game.id, version),
            )
            version_id = self.conn.execute(
                "SELECT id FROM game_versions WHERE game_id = ? AND version = ?", (game.id, version)
            ).fetchone()["id"]
            changed = self.builds.mark_version_possibly_outdated(
                game.id, version_id, f"Вышла версия {version}: требуется повторная проверка", utcnow_iso())
            self.log.log(admin_id, "game_update", "game", game.code,
                         {"version": version, "builds_marked": changed})
        return changed
