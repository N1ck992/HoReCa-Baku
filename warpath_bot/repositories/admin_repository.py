"""Журнал административных действий и история импорта."""
from __future__ import annotations

import json
import sqlite3


class AdminRepository:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def log(self, admin_id: int, action: str, object_type: str | None = None,
            object_id: str | int | None = None, details: dict | None = None) -> None:
        self.conn.execute(
            "INSERT INTO admin_audit_log (admin_id, action, object_type, object_id, details) VALUES (?, ?, ?, ?, ?)",
            (admin_id, action, object_type, None if object_id is None else str(object_id),
             json.dumps(details or {}, ensure_ascii=False)),
        )

    def recent_log(self, limit: int = 10) -> list[dict]:
        rows = self.conn.execute(
            "SELECT * FROM admin_audit_log ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]

    def create_import_run(self, admin_id: int | None, filename: str | None, file_format: str,
                          status: str, accepted: int, rejected: int, report: dict,
                          payload: str | None) -> int:
        cur = self.conn.execute(
            """INSERT INTO import_runs (admin_id, filename, file_format, status, accepted, rejected, report, payload)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (admin_id, filename, file_format, status, accepted, rejected,
             json.dumps(report, ensure_ascii=False), payload),
        )
        return cur.lastrowid

    def get_import_run(self, run_id: int) -> dict | None:
        r = self.conn.execute("SELECT * FROM import_runs WHERE id = ?", (run_id,)).fetchone()
        if not r:
            return None
        data = dict(r)
        data["report"] = json.loads(data["report"] or "{}")
        return data

    def set_import_status(self, run_id: int, status: str, now: str | None = None,
                          report: dict | None = None) -> None:
        if report is not None:
            self.conn.execute(
                "UPDATE import_runs SET status = ?, applied_at = ?, report = ? WHERE id = ?",
                (status, now, json.dumps(report, ensure_ascii=False), run_id),
            )
        else:
            self.conn.execute(
                "UPDATE import_runs SET status = ?, applied_at = ? WHERE id = ?", (status, now, run_id)
            )

    def recent_import_runs(self, limit: int = 5, only_problems: bool = False) -> list[dict]:
        sql = "SELECT id, filename, file_format, status, accepted, rejected, report, created_at FROM import_runs"
        if only_problems:
            sql += " WHERE rejected > 0 OR status IN ('rejected', 'failed')"
        rows = self.conn.execute(sql + " ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["report"] = json.loads(d["report"] or "{}")
            result.append(d)
        return result
