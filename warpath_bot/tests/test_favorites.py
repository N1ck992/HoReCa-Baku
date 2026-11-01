from conftest import add_user, build_id

from services.build_service import BuildService


def test_favorites_independent_per_user(loaded_conn):
    s = BuildService(loaded_conn)
    add_user(loaded_conn, 1)
    add_user(loaded_conn, 2)
    a, b = build_id(loaded_conn, "verified-1"), build_id(loaded_conn, "review-1")

    assert s.toggle_favorite(1, a) is True
    assert s.toggle_favorite(2, b) is True
    assert [f["id"] for f in s.favorites(1)] == [a]
    assert [f["id"] for f in s.favorites(2)] == [b]

    assert s.toggle_favorite(1, a) is False  # удаление
    assert s.favorites(1) == []
    assert [f["id"] for f in s.favorites(2)] == [b]


def test_favorite_removed_with_build(loaded_conn):
    s = BuildService(loaded_conn)
    add_user(loaded_conn, 1)
    bid = build_id(loaded_conn, "review-1")
    s.toggle_favorite(1, bid)
    loaded_conn.execute("DELETE FROM builds WHERE id = ?", (bid,))
    assert s.favorites(1) == []


def test_test_builds_hidden_in_favorites_when_disabled(loaded_conn):
    add_user(loaded_conn, 1)
    BuildService(loaded_conn, show_test_data=True).toggle_favorite(1, build_id(loaded_conn, "test-build"))
    assert BuildService(loaded_conn, show_test_data=False).favorites(1) == []
