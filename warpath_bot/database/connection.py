"""Подключение к SQLite, транзакции и миграции схемы.

Миграции — пронумерованные SQL-файлы в database/migrations. Применённые
версии записываются в schema_migrations, поэтому повторный запуск
ничего не пересоздаёт и не удаляет данные. Каждая миграция выполняется
в отдельной транзакции: при ошибке она откатывается целиком.
"""
from __future__ import annotations

import logging
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from itertools import count
from pathlib import Path
from typing import Iterator

logger = logging.getLogger(__name__)

MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"
_savepoint_ids = count(1)


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def connect(path: str | Path) -> sqlite3.Connection:
    """Открывает соединение. path=':memory:' — база в памяти (для тестов)."""
    if str(path) != ":memory:":
        Path(path).parent.mkdir(parents=True, exist_ok=True)
    # isolation_level=None: транзакциями управляем явно через transaction()
    conn = sqlite3.connect(str(path), isolation_level=None, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    if str(path) != ":memory:":
        conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


@contextmanager
def transaction(conn: sqlite3.Connection) -> Iterator[sqlite3.Connection]:
    """Атомарный блок. Вложенные вызовы используют SAVEPOINT."""
    if conn.in_transaction:
        name = f"sp_{next(_savepoint_ids)}"
        conn.execute(f"SAVEPOINT {name}")
        try:
            yield conn
        except BaseException:
            conn.execute(f"ROLLBACK TO SAVEPOINT {name}")
            conn.execute(f"RELEASE SAVEPOINT {name}")
            raise
        else:
            conn.execute(f"RELEASE SAVEPOINT {name}")
        return

    conn.execute("BEGIN IMMEDIATE")
    try:
        yield conn
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    else:
        conn.execute("COMMIT")


def _available_migrations() -> list[tuple[int, str, Path]]:
    result = []
    for file in sorted(MIGRATIONS_DIR.glob("*.sql")):
        prefix = file.name.split("_", 1)[0]
        if prefix.isdigit():
            result.append((int(prefix), file.name, file))
    return result


def applied_versions(conn: sqlite3.Connection) -> set[int]:
    rows = conn.execute("SELECT version FROM schema_migrations").fetchall()
    return {row["version"] for row in rows}


def init_db(conn: sqlite3.Connection) -> list[str]:
    """Создаёт/обновляет схему. Возвращает список применённых сейчас миграций."""
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations ("
        " version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)"
    )
    done = applied_versions(conn)
    applied_now: list[str] = []
    for version, name, path in _available_migrations():
        if version in done:
            continue
        sql = path.read_text(encoding="utf-8")
        try:
            # executescript сам по себе не транзакционен — оборачиваем вручную
            conn.executescript(f"BEGIN IMMEDIATE;\n{sql}\n")
            conn.execute(
                "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
                (version, name, utcnow_iso()),
            )
            conn.execute("COMMIT")
        except Exception:
            if conn.in_transaction:
                conn.execute("ROLLBACK")
            logger.exception("Ошибка миграции %s — изменения откатены", name)
            raise
        logger.info("Применена миграция %s", name)
        applied_now.append(name)
    return applied_now


def open_database(path: str | Path) -> sqlite3.Connection:
    conn = connect(path)
    init_db(conn)
    return conn
