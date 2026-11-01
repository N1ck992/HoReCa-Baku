from conftest import build_id, entity_id, game_id

from models import NEEDS_REVIEW, VERIFIED
from services.build_service import BuildService
from views.build_view import render_build


def codes(conn, results):
    ids = [r["id"] for r in results]
    return {conn.execute("SELECT code FROM builds WHERE id = ?", (i,)).fetchone()[0] for i in ids}


def test_search_returns_only_matching(loaded_conn):
    s = BuildService(loaded_conn)
    g = game_id(loaded_conn)
    res = s.search(g, entity_id(loaded_conn, "unit_class", "class-1"), entity_id(loaded_conn, "purpose", "purpose-1"))
    # Только class-1 + purpose-1; устаревшие, предложения и тестовые — не выдаются
    assert codes(loaded_conn, res) == {"verified-1", "review-1"}


def test_verified_first(loaded_conn):
    s = BuildService(loaded_conn)
    res = s.search(game_id(loaded_conn), entity_id(loaded_conn, "unit_class", "class-1"),
                   entity_id(loaded_conn, "purpose", "purpose-1"))
    assert res[0]["verification_status"] == VERIFIED


def test_commander_filter(loaded_conn):
    s = BuildService(loaded_conn)
    g = game_id(loaded_conn)
    uc, p = entity_id(loaded_conn, "unit_class", "class-1"), entity_id(loaded_conn, "purpose", "purpose-1")
    assert {c.code for c in s.commanders(g, uc, p)} == {"cmd-1", "cmd-2"}
    res = s.search(g, uc, p, entity_id(loaded_conn, "commander", "cmd-2"))
    assert codes(loaded_conn, res) == {"review-1"}


def test_options_come_from_existing_builds(loaded_conn):
    s = BuildService(loaded_conn)
    g = game_id(loaded_conn)
    assert {e.code for e in s.unit_classes(g)} == {"class-1", "class-2"}
    assert {e.code for e in s.purposes(g, entity_id(loaded_conn, "unit_class", "class-2"))} == {"purpose-1"}


def test_empty_search(loaded_conn):
    s = BuildService(loaded_conn)
    g = game_id(loaded_conn)
    res = s.search(g, entity_id(loaded_conn, "unit_class", "class-2"), entity_id(loaded_conn, "purpose", "purpose-2"))
    assert res == []


def test_empty_database_has_no_options(conn):
    s = BuildService(conn)
    assert s.unit_classes(game_id(conn)) == []


def test_unverified_not_presented_as_verified(loaded_conn):
    s = BuildService(loaded_conn)
    build = s.get_build(build_id(loaded_conn, "review-1"))
    assert build.verification_status == NEEDS_REVIEW
    assert not build.is_verified
    text = render_build(build, "main")
    assert "✅ Проверено" not in text
    assert "Не проверено" in text

    verified = s.get_build(build_id(loaded_conn, "verified-1"))
    assert verified.is_verified
    assert "✅ Проверено" in render_build(verified, "main")


def test_test_builds_hidden_and_labelled(loaded_conn):
    hidden = BuildService(loaded_conn, show_test_data=False)
    tid = build_id(loaded_conn, "test-build")
    assert hidden.get_build(tid) is None
    assert "test-class" not in {e.code for e in hidden.unit_classes(game_id(loaded_conn))}

    shown = BuildService(loaded_conn, show_test_data=True)
    build = shown.get_build(tid)
    assert not build.is_verified
    assert "ТЕСТОВЫЕ ДАННЫЕ" in render_build(build, "main")


def test_card_parts_and_escaping(loaded_conn):
    s = BuildService(loaded_conn)
    bid = build_id(loaded_conn, "verified-1")
    loaded_conn.execute("UPDATE builds SET title = ? WHERE id = ?", ("<b>x</b> & y", bid))
    build = s.get_build(bid)
    assert "&lt;b&gt;x&lt;/b&gt; &amp; y" in render_build(build, "main")
    src = render_build(build, "src")
    assert "Источник 1" in src and "2026-10-02" in src
    assert "Тактика не описана" in render_build(build, "tac")
    assert all(len(render_build(build, p)) < 4096 for p in ("main", "tac", "pro", "src"))
