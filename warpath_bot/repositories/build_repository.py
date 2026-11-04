"""Доступ к игровым данным: игры, сущности, билды, источники."""
from __future__ import annotations

import json
import sqlite3

from models import (
    COMMANDER,
    USER_VISIBLE_STATUSES,
    Build,
    Component,
    Entity,
    Game,
    SearchFilter,
    SourceRef,
)


def _json_list(value: str | None) -> list[str]:
    if not value:
        return []
    try:
        data = json.loads(value)
    except (TypeError, ValueError):
        return [value]
    return [str(x) for x in data] if isinstance(data, list) else [str(data)]


class BuildRepository:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    # --- Игры -----------------------------------------------------------
    def list_games(self, only_active: bool = True) -> list[Game]:
        sql = "SELECT id, code, name, is_active FROM games"
        if only_active:
            sql += " WHERE is_active = 1"
        rows = self.conn.execute(sql + " ORDER BY name").fetchall()
        return [Game(r["id"], r["code"], r["name"], bool(r["is_active"])) for r in rows]

    def get_game(self, game_id: int) -> Game | None:
        r = self.conn.execute(
            "SELECT id, code, name, is_active FROM games WHERE id = ?", (game_id,)
        ).fetchone()
        return Game(r["id"], r["code"], r["name"], bool(r["is_active"])) if r else None

    def get_game_by_code(self, code: str) -> Game | None:
        r = self.conn.execute(
            "SELECT id, code, name, is_active FROM games WHERE code = ?", (code,)
        ).fetchone()
        return Game(r["id"], r["code"], r["name"], bool(r["is_active"])) if r else None

    # --- Сущности -------------------------------------------------------
    def get_entity(self, entity_id: int) -> Entity | None:
        r = self.conn.execute(
            "SELECT id, game_id, entity_type, code, name, is_test FROM entities WHERE id = ?",
            (entity_id,),
        ).fetchone()
        return self._entity(r) if r else None

    @staticmethod
    def _entity(r: sqlite3.Row) -> Entity:
        return Entity(r["id"], r["game_id"], r["entity_type"], r["code"], r["name"], bool(r["is_test"]))

    # --- Поиск ------------------------------------------------------------
    @staticmethod
    def _visibility_clause(include_test: bool) -> tuple[str, list]:
        placeholders = ",".join("?" for _ in USER_VISIBLE_STATUSES)
        clause = f"b.verification_status IN ({placeholders})"
        params: list = list(USER_VISIBLE_STATUSES)
        if not include_test:
            clause += " AND b.is_test = 0"
        return clause, params

    def available_unit_classes(self, game_id: int, include_test: bool) -> list[Entity]:
        vis, params = self._visibility_clause(include_test)
        rows = self.conn.execute(
            f"""SELECT DISTINCT e.id, e.game_id, e.entity_type, e.code, e.name, e.is_test
                FROM builds b JOIN entities e ON e.id = b.unit_class_id
                WHERE b.game_id = ? AND {vis} ORDER BY e.name""",
            [game_id, *params],
        ).fetchall()
        return [self._entity(r) for r in rows]

    def available_purposes(self, game_id: int, unit_class_id: int, include_test: bool) -> list[Entity]:
        vis, params = self._visibility_clause(include_test)
        rows = self.conn.execute(
            f"""SELECT DISTINCT e.id, e.game_id, e.entity_type, e.code, e.name, e.is_test
                FROM builds b JOIN entities e ON e.id = b.purpose_id
                WHERE b.game_id = ? AND b.unit_class_id = ? AND {vis} ORDER BY e.name""",
            [game_id, unit_class_id, *params],
        ).fetchall()
        return [self._entity(r) for r in rows]

    def available_commanders(self, f: SearchFilter) -> list[Entity]:
        vis, params = self._visibility_clause(f.include_test)
        rows = self.conn.execute(
            f"""SELECT DISTINCT e.id, e.game_id, e.entity_type, e.code, e.name, e.is_test
                FROM builds b
                JOIN build_components c ON c.build_id = b.id
                JOIN entities e ON e.id = c.entity_id
                WHERE b.game_id = ? AND b.unit_class_id = ? AND b.purpose_id = ?
                  AND e.entity_type = ? AND {vis}
                ORDER BY e.name""",
            [f.game_id, f.unit_class_id, f.purpose_id, COMMANDER, *params],
        ).fetchall()
        return [self._entity(r) for r in rows]

    def search(self, f: SearchFilter) -> list[dict]:
        """Краткие записи найденных билдов: проверенные — первыми."""
        vis, params = self._visibility_clause(f.include_test)
        sql = [
            "SELECT b.id, b.title, b.verification_status, b.is_test FROM builds b",
            f"WHERE b.game_id = ? AND {vis}",
        ]
        args: list = [f.game_id, *params]
        if f.unit_class_id is not None:
            sql.append("AND b.unit_class_id = ?")
            args.append(f.unit_class_id)
        if f.purpose_id is not None:
            sql.append("AND b.purpose_id = ?")
            args.append(f.purpose_id)
        if f.commander_id is not None:
            sql.append("AND EXISTS (SELECT 1 FROM build_components c"
                       " WHERE c.build_id = b.id AND c.entity_id = ?)")
            args.append(f.commander_id)
        sql.append(
            "ORDER BY b.is_test ASC, CASE b.verification_status WHEN 'verified' THEN 0"
            " WHEN 'needs_review' THEN 1 ELSE 2 END, b.title"
        )
        return [dict(r) for r in self.conn.execute(" ".join(sql), args).fetchall()]

    # --- Карточка ---------------------------------------------------------
    def get_build(self, build_id: int) -> Build | None:
        r = self.conn.execute(
            """SELECT b.*, g.name AS game_name, v.version AS game_version,
                      uc.name AS unit_class_name, p.name AS purpose_name
               FROM builds b
               JOIN games g ON g.id = b.game_id
               LEFT JOIN game_versions v ON v.id = b.game_version_id
               JOIN entities uc ON uc.id = b.unit_class_id
               JOIN entities p ON p.id = b.purpose_id
               WHERE b.id = ?""",
            (build_id,),
        ).fetchone()
        if not r:
            return None
        comps = self.conn.execute(
            """SELECT c.role, COALESCE(e.name, c.label) AS name, c.entity_id, c.notes
               FROM build_components c LEFT JOIN entities e ON e.id = c.entity_id
               WHERE c.build_id = ? ORDER BY c.position, c.id""",
            (build_id,),
        ).fetchall()
        srcs = self.conn.execute(
            """SELECT s.title, s.url, s.publisher, s.retrieved_at, bs.claim, bs.confirms
               FROM build_sources bs JOIN sources s ON s.id = bs.source_id
               WHERE bs.build_id = ? ORDER BY s.title""",
            (build_id,),
        ).fetchall()
        return Build(
            id=r["id"], game_id=r["game_id"], game_name=r["game_name"], code=r["code"],
            title=r["title"], game_version=r["game_version"],
            unit_class=r["unit_class_name"], purpose=r["purpose_name"],
            description=r["description"],
            upgrade_priority=_json_list(r["upgrade_priority"]),
            tactics=r["tactics"],
            strengths=_json_list(r["strengths"]), weaknesses=_json_list(r["weaknesses"]),
            verification_status=r["verification_status"], status_reason=r["status_reason"],
            last_verified_at=r["last_verified_at"], is_test=bool(r["is_test"]),
            updated_at=r["updated_at"],
            components=[Component(c["role"], c["name"], c["entity_id"], c["notes"]) for c in comps],
            sources=[SourceRef(s["title"], s["url"], s["publisher"], s["retrieved_at"],
                               s["claim"], bool(s["confirms"])) for s in srcs],
        )

    # --- Администрирование -------------------------------------------------
    def set_status(self, build_id: int, status: str, reason: str | None, now: str) -> bool:
        cur = self.conn.execute(
            "UPDATE builds SET verification_status = ?, status_reason = ?, updated_at = ?"
            " WHERE id = ?",
            (status, reason, now, build_id),
        )
        return cur.rowcount > 0

    EDITABLE_TEXT_FIELDS = ("title", "description", "tactics")
    EDITABLE_LIST_FIELDS = ("upgrade_priority", "strengths", "weaknesses")

    def update_field(self, build_id: int, field_name: str, value: str, now: str) -> bool:
        if field_name in self.EDITABLE_TEXT_FIELDS:
            stored = value
        elif field_name in self.EDITABLE_LIST_FIELDS:
            stored = json.dumps([p.strip() for p in value.split("|") if p.strip()], ensure_ascii=False)
        else:
            raise ValueError("Недопустимое поле")
        # Имя поля берётся только из белого списка выше — не из ввода напрямую
        cur = self.conn.execute(
            f"UPDATE builds SET {field_name} = ?, updated_at = ? WHERE id = ?",
            (stored, now, build_id),
        )
        return cur.rowcount > 0

    def mark_version_possibly_outdated(self, game_id: int, new_version_id: int, reason: str, now: str) -> int:
        """После обновления игры: проверенные билды старых версий -> 'возможно устарел'."""
        cur = self.conn.execute(
            """UPDATE builds SET verification_status = 'possibly_outdated',
                      status_reason = ?, updated_at = ?
               WHERE game_id = ? AND verification_status IN ('verified', 'needs_review')
                 AND (game_version_id IS NULL OR game_version_id != ?)""",
            (reason, now, game_id, new_version_id),
        )
        return cur.rowcount

    def stats(self) -> dict:
        def scalar(sql: str, args: tuple = ()) -> int:
            return self.conn.execute(sql, args).fetchone()[0]

        by_status = {
            r["verification_status"]: r["n"]
            for r in self.conn.execute(
                "SELECT verification_status, COUNT(*) AS n FROM builds WHERE is_test = 0"
                " GROUP BY verification_status"
            )
        }
        return {
            "games": scalar("SELECT COUNT(*) FROM games"),
            "game_versions": scalar("SELECT COUNT(*) FROM game_versions"),
            "entities": scalar("SELECT COUNT(*) FROM entities"),
            "builds_total": scalar("SELECT COUNT(*) FROM builds"),
            "builds_test": scalar("SELECT COUNT(*) FROM builds WHERE is_test = 1"),
            "builds_by_status": by_status,
            "sources": scalar("SELECT COUNT(*) FROM sources"),
            "users": scalar("SELECT COUNT(*) FROM users"),
            "favorites": scalar("SELECT COUNT(*) FROM favorites"),
        }
