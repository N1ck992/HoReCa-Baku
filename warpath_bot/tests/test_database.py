import sqlite3

import pytest

import database.connection as dbc
from tests_helpers import table_names


def test_database_created_on_first_run(tmp_path):
    path = tmp_path / "sub" / "new.db"
    assert not path.exists()
    conn = dbc.open_database(path)
    assert path.exists()
    tables = table_names(conn)
    for name in ("games", "game_versions", "entities", "builds", "build_components", "sources",
                 "build_sources", "users", "favorites", "plans", "subscriptions", "usage_counters",
                 "admin_audit_log", "import_runs", "schema_migrations"):
        assert name in tables
    assert conn.execute("SELECT code FROM games").fetchone()["code"] == "warpath"
    # Игровых данных при создании нет — никаких выдуманных билдов
    assert conn.execute("SELECT COUNT(*) FROM builds").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM entities").fetchone()[0] == 0
    conn.close()


def test_reinit_keeps_data(tmp_path):
    path = tmp_path / "keep.db"
    conn = dbc.open_database(path)
    conn.execute("INSERT INTO users (telegram_id, first_name) VALUES (?, ?)", (42, "Тест"))
    conn.close()

    conn = dbc.open_database(path)  # повторный запуск
    assert dbc.init_db(conn) == []   # миграции не применяются повторно
    assert conn.execute("SELECT first_name FROM users WHERE telegram_id = 42").fetchone()[0] == "Тест"
    assert conn.execute("SELECT COUNT(*) FROM games").fetchone()[0] == 1
    conn.close()


def test_foreign_keys_enforced(conn):
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("INSERT INTO favorites (user_id, build_id) VALUES (1, 999)")


def test_failed_migration_rolls_back(tmp_path, monkeypatch):
    mig_dir = tmp_path / "migs"
    mig_dir.mkdir()
    for f in sorted(dbc.MIGRATIONS_DIR.glob("*.sql")):
        (mig_dir / f.name).write_text(f.read_text(encoding="utf-8"), encoding="utf-8")
    (mig_dir / "0099_broken.sql").write_text(
        "CREATE TABLE half_done (id INTEGER);\nTHIS IS NOT SQL;", encoding="utf-8")
    monkeypatch.setattr(dbc, "MIGRATIONS_DIR", mig_dir)
    conn = dbc.connect(tmp_path / "m.db")
    with pytest.raises(sqlite3.Error):
        dbc.init_db(conn)
    assert "half_done" not in table_names(conn)
    assert 99 not in dbc.applied_versions(conn)
    assert {1, 2} <= dbc.applied_versions(conn)


def test_transaction_rollback(conn):
    with pytest.raises(RuntimeError):
        with dbc.transaction(conn):
            conn.execute("INSERT INTO users (telegram_id) VALUES (7)")
            raise RuntimeError("boom")
    assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0
