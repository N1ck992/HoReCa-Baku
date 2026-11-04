import asyncio
from types import SimpleNamespace

import pytest
from conftest import add_user, build_id

from config import ConfigError, _parse_admin_ids, load_settings
from handlers.admin import IsAdmin
from services.access_service import (
    FEATURE_FAVORITE_ADD,
    FEATURE_SEARCH,
    FREE,
    GROUP_PREMIUM,
    PREMIUM,
    AccessService,
)
from services.admin_service import AdminError, AdminService


def test_regular_user_is_not_admin(conn):
    access = AccessService(conn, frozenset({100}))
    assert access.is_admin(100)
    assert not access.is_admin(200)
    assert not access.is_admin(None)
    assert not AccessService(conn, frozenset()).is_admin(100)


def test_is_admin_filter(conn):
    access = AccessService(conn, frozenset({100}))
    f = IsAdmin()
    assert asyncio.run(f(SimpleNamespace(from_user=SimpleNamespace(id=100)), access_service=access))
    assert not asyncio.run(f(SimpleNamespace(from_user=SimpleNamespace(id=5)), access_service=access))


def test_admin_ids_parsing():
    assert _parse_admin_ids("1, 2;3") == frozenset({1, 2, 3})
    assert _parse_admin_ids("") == frozenset()
    with pytest.raises(ConfigError):
        _parse_admin_ids("abc")


def test_token_required_and_not_in_repr(monkeypatch):
    monkeypatch.setenv("BOT_TOKEN", "")
    with pytest.raises(ConfigError):
        load_settings(require_token=True, env_file="/nonexistent")
    token = "123456789:AAAbbbCCCdddEEEfffGGGhhhIIIjjjKKKlll"
    monkeypatch.setenv("BOT_TOKEN", token)
    s = load_settings(require_token=True, env_file="/nonexistent")
    assert token not in repr(s)
    monkeypatch.setenv("BOT_TOKEN", "not-a-token")
    with pytest.raises(ConfigError) as exc:
        load_settings(require_token=True, env_file="/nonexistent")
    assert "not-a-token" not in str(exc.value)


def test_daily_search_limit(conn):
    access = AccessService(conn, frozenset(), free_daily_search_limit=2)
    now = "2026-11-01T10:00:00Z"
    for _ in range(2):
        assert access.check(FEATURE_SEARCH, 5, now=now).allowed
        access.register_use(FEATURE_SEARCH, 5, now=now)
    d = access.check(FEATURE_SEARCH, 5, now=now)
    assert not d.allowed and d.reason == "access_daily_limit"
    assert access.check(FEATURE_SEARCH, 5, now="2026-11-02T00:00:01Z").allowed  # новый день
    assert access.check(FEATURE_SEARCH, 6, now=now).allowed  # другой пользователь


def test_admin_not_limited(conn):
    access = AccessService(conn, frozenset({1}), free_daily_search_limit=1)
    access.register_use(FEATURE_SEARCH, 1)
    access.register_use(FEATURE_SEARCH, 1)
    assert access.check(FEATURE_SEARCH, 1).allowed


def test_test_subscriptions(conn):
    access = AccessService(conn, frozenset(), free_daily_search_limit=1)
    assert access.effective_plan(5) == FREE
    access.grant("user", 5, PREMIUM, days=30, granted_by=1)
    assert access.effective_plan(5) == PREMIUM
    access.register_use(FEATURE_SEARCH, 5)
    assert access.check(FEATURE_SEARCH, 5).allowed
    # Подписка группы действует только внутри этой группы
    access.grant("chat", -100, GROUP_PREMIUM, days=None, granted_by=1)
    assert access.effective_plan(7, chat_id=-100) == GROUP_PREMIUM
    assert access.effective_plan(7, chat_id=-200) == FREE
    assert access.effective_plan(7) == FREE
    with pytest.raises(ValueError):
        access.grant("user", 5, "gold", days=1, granted_by=1)
    src = conn.execute("SELECT DISTINCT source FROM subscriptions").fetchall()
    assert [r[0] for r in src] == ["test"]  # без реальной оплаты


def test_expired_subscription(conn):
    access = AccessService(conn, frozenset())
    access.users.add_subscription("user", 9, PREMIUM, "2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z", "test", 1)
    assert access.effective_plan(9, now="2026-01-15T00:00:00Z") == PREMIUM
    assert access.effective_plan(9, now="2026-03-01T00:00:00Z") == FREE


def test_favorites_limit(loaded_conn):
    access = AccessService(loaded_conn, frozenset(), free_max_favorites=1)
    add_user(loaded_conn, 5)
    assert access.check(FEATURE_FAVORITE_ADD, 5).allowed
    access.users.add_favorite(5, build_id(loaded_conn, "review-1"))
    assert access.check(FEATURE_FAVORITE_ADD, 5).reason == "access_favorites_limit"


def test_admin_status_rules(loaded_conn):
    admin = AdminService(loaded_conn)
    bid = build_id(loaded_conn, "review-1")
    with pytest.raises(AdminError):  # нет источника и версии
        admin.set_status(1, bid, "verified", "есть основание")
    with pytest.raises(AdminError):
        admin.set_status(1, bid, "nonsense", None)
    with pytest.raises(AdminError):
        admin.set_status(1, 99999, "outdated", None)
    with pytest.raises(AdminError):
        admin.set_status(1, build_id(loaded_conn, "test-build"), "verified", "x")
    admin.set_status(1, bid, "outdated", None)
    row = loaded_conn.execute("SELECT verification_status, status_reason FROM builds WHERE id = ?", (bid,)).fetchone()
    assert row[0] == "outdated" and row[1]
    assert loaded_conn.execute("SELECT COUNT(*) FROM admin_audit_log WHERE action = 'set_status'").fetchone()[0] == 1


def test_game_update_marks_possibly_outdated(loaded_conn):
    admin = AdminService(loaded_conn)
    changed = admin.register_game_update(1, "warpath", "fixture-2.0")
    assert changed >= 1
    status = loaded_conn.execute("SELECT verification_status FROM builds WHERE code = 'verified-1'").fetchone()[0]
    assert status == "possibly_outdated"


def test_edit_field_whitelist(loaded_conn):
    admin = AdminService(loaded_conn)
    bid = build_id(loaded_conn, "review-1")
    with pytest.raises(AdminError):
        admin.edit_field(1, bid, "verification_status", "verified")  # статус — только через /status
    admin.edit_field(1, bid, "strengths", "a | b")
    assert loaded_conn.execute("SELECT strengths FROM builds WHERE id = ?", (bid,)).fetchone()[0] == '["a", "b"]'
