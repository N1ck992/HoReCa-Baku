"""Общие фикстуры. Тесты работают только с временными базами (tmp_path),
рабочая база не затрагивается. Данные — синтетические, без игровых утверждений."""
from __future__ import annotations

import copy
import os

import pytest

from database.connection import open_database
from services.import_service import ImportService

# Изоляция от локального .env и рабочего окружения
os.environ["DATABASE_PATH"] = "/nonexistent/should-not-be-used.db"

FIXTURE_DATA = {
    "game": "warpath",
    "game_versions": [{"version": "fixture-1.0"}],
    "entities": [
        {"type": "unit_class", "code": "class-1", "name": "Класс 1"},
        {"type": "unit_class", "code": "class-2", "name": "Класс 2"},
        {"type": "purpose", "code": "purpose-1", "name": "Задача 1"},
        {"type": "purpose", "code": "purpose-2", "name": "Задача 2"},
        {"type": "commander", "code": "cmd-1", "name": "Командир 1"},
        {"type": "commander", "code": "cmd-2", "name": "Командир 2"},
        {"type": "unit_class", "code": "test-class", "name": "Тест-класс", "is_test": True},
    ],
    "sources": [
        {"code": "src-1", "title": "Источник 1", "url": "https://example.org/a", "retrieved_at": "2026-10-01"},
    ],
    "builds": [
        {"code": "verified-1", "title": "Фикстура проверенная", "game_version": "fixture-1.0",
         "unit_class": "class-1", "purpose": "purpose-1",
         "components": [{"role": "commander", "entity": "cmd-1"}],
         "verification_status": "verified", "status_reason": "Фикстура: источник подтверждает",
         "last_verified_at": "2026-10-02",
         "sources": [{"source": "src-1", "claim": "утверждение фикстуры", "confirms": True}]},
        {"code": "review-1", "title": "Фикстура на проверке", "unit_class": "class-1", "purpose": "purpose-1",
         "components": [{"role": "commander", "entity": "cmd-2"}],
         "verification_status": "needs_review"},
        {"code": "other-purpose", "title": "Фикстура другая задача", "unit_class": "class-1",
         "purpose": "purpose-2", "verification_status": "needs_review"},
        {"code": "other-class", "title": "Фикстура другой класс", "unit_class": "class-2",
         "purpose": "purpose-1", "verification_status": "needs_review"},
        {"code": "outdated-1", "title": "Фикстура устаревшая", "unit_class": "class-1",
         "purpose": "purpose-1", "verification_status": "outdated"},
        {"code": "suggestion-1", "title": "Фикстура предложение", "unit_class": "class-1",
         "purpose": "purpose-1", "verification_status": "user_suggestion"},
        {"code": "test-build", "title": "Фикстура тестовая", "unit_class": "test-class",
         "purpose": "purpose-1", "is_test": True},
    ],
}


@pytest.fixture
def fixture_data() -> dict:
    return copy.deepcopy(FIXTURE_DATA)


@pytest.fixture
def conn(tmp_path):
    connection = open_database(tmp_path / "test.db")
    yield connection
    connection.close()


@pytest.fixture
def loaded_conn(conn, fixture_data):
    report = ImportService(conn).apply(fixture_data, admin_id=1)
    assert report.ok, report.rejected
    return conn


def build_id(conn, code: str) -> int:
    return conn.execute("SELECT id FROM builds WHERE code = ?", (code,)).fetchone()["id"]


def entity_id(conn, etype: str, code: str) -> int:
    return conn.execute("SELECT id FROM entities WHERE entity_type = ? AND code = ?",
                        (etype, code)).fetchone()["id"]


def game_id(conn) -> int:
    return conn.execute("SELECT id FROM games WHERE code = 'warpath'").fetchone()["id"]


def add_user(conn, user_id: int) -> None:
    from database.connection import utcnow_iso
    from repositories.user_repository import UserRepository

    UserRepository(conn).upsert_user(user_id, None, f"user{user_id}", "ru", utcnow_iso())
