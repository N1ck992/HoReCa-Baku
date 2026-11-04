import json

import pytest
from conftest import FIXTURE_DATA

from services.import_service import ImportFormatError, ImportService, parse
from config import BASE_DIR


def counts(conn):
    return {t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
            for t in ("game_versions", "entities", "sources", "builds", "build_components", "build_sources")}


def test_valid_import(conn, fixture_data):
    report = ImportService(conn).apply(fixture_data, admin_id=1)
    assert report.ok
    c = counts(conn)
    assert c["builds"] == len(FIXTURE_DATA["builds"])
    assert c["entities"] == len(FIXTURE_DATA["entities"])
    assert conn.execute("SELECT COUNT(*) FROM admin_audit_log WHERE action = 'import_apply'").fetchone()[0] == 1


def test_validate_does_not_write(conn, fixture_data):
    before = counts(conn)
    report = ImportService(conn).validate(fixture_data)
    assert report.ok
    assert counts(conn) == before


def test_invalid_import_leaves_db_unchanged(loaded_conn, fixture_data):
    before = counts(loaded_conn)
    data = {"game": "warpath",
            "entities": [{"type": "unit_class", "code": "new-class", "name": "Новый"}],
            "builds": [
                {"code": "good", "title": "Хороший", "unit_class": "new-class", "purpose": "purpose-1"},
                {"code": "bad", "title": "Плохой", "unit_class": "missing", "purpose": "purpose-1"},
            ]}
    report = ImportService(loaded_conn).apply(data, admin_id=1)
    assert not report.ok
    assert any(r["key"] == "bad" for r in report.rejected)
    assert counts(loaded_conn) == before


def test_error_during_write_rolls_back(conn, fixture_data, monkeypatch):
    service = ImportService(conn)
    original = service._write_build
    calls = {"n": 0}

    def failing(*args, **kwargs):
        calls["n"] += 1
        if calls["n"] == 3:
            raise RuntimeError("сбой записи")
        return original(*args, **kwargs)

    monkeypatch.setattr(service, "_write_build", failing)
    before = counts(conn)
    with pytest.raises(RuntimeError):
        service.apply(fixture_data, admin_id=1)
    assert counts(conn) == before


def test_duplicates_in_file(conn):
    data = {"game": "warpath",
            "entities": [{"type": "purpose", "code": "p", "name": "A"},
                         {"type": "purpose", "code": "p", "name": "B"}]}
    report = ImportService(conn).validate(data)
    assert not report.ok
    assert "дубликат" in report.rejected[0]["errors"][0]


def test_existing_records_protected(loaded_conn, fixture_data):
    service = ImportService(loaded_conn)
    fixture_data["builds"][1]["title"] = "Изменённое название"
    report = service.apply(fixture_data, admin_id=1)
    assert not report.ok
    assert any("защита от перезаписи" in e for r in report.rejected for e in r["errors"])
    title = loaded_conn.execute("SELECT title FROM builds WHERE code = 'review-1'").fetchone()[0]
    assert title == "Фикстура на проверке"

    report = service.apply(fixture_data, admin_id=1, update_existing=True)
    assert report.ok
    title = loaded_conn.execute("SELECT title FROM builds WHERE code = 'review-1'").fetchone()[0]
    assert title == "Изменённое название"
    # Повторное применение не дублирует состав
    n = loaded_conn.execute(
        "SELECT COUNT(*) FROM build_components c JOIN builds b ON b.id = c.build_id WHERE b.code = 'review-1'"
    ).fetchone()[0]
    assert n == 1


@pytest.mark.parametrize("change, expected", [
    ({"sources": []}, "подтверждающий источник"),
    ({"last_verified_at": None}, "last_verified_at"),
    ({"game_version": None}, "game_version"),
    ({"status_reason": None}, "status_reason"),
    ({"is_test": True}, "тестовый билд"),
])
def test_verified_requires_evidence(conn, fixture_data, change, expected):
    build = fixture_data["builds"][0]
    build.update(change)
    report = ImportService(conn).validate({"game": "warpath", "game_versions": fixture_data["game_versions"],
                                           "entities": fixture_data["entities"],
                                           "sources": fixture_data["sources"], "builds": [build]})
    assert not report.ok
    assert any(expected in e for r in report.rejected for e in r["errors"])


def test_production_build_cannot_use_test_entity(conn, fixture_data):
    fixture_data["builds"] = [{"code": "x", "title": "X", "unit_class": "test-class", "purpose": "purpose-1"}]
    report = ImportService(conn).validate(fixture_data)
    assert any("тестовую сущность" in e for r in report.rejected for e in r["errors"])


def test_validation_messages(conn):
    data = {"game": "warpath", "sources": [{"code": "s", "title": "S", "url": "ftp://bad"}],
            "builds": [{"code": "Bad Code", "verification_status": "magic", "last_verified_at": "вчера"}]}
    report = ImportService(conn).validate(data)
    errors = " ".join(e for r in report.rejected for e in r["errors"])
    for fragment in ("url должен", "code:", "«title» обязательно", "verification_status", "last_verified_at",
                     "unit_class"):
        assert fragment in errors


def test_unknown_game_rejected(conn):
    report = ImportService(conn).validate({"game": "other-game", "builds": []})
    assert not report.ok


def test_csv_import(conn):
    service = ImportService(conn)
    entities = ("game,type,code,name,is_test\nwarpath,unit_class,c1,Класс,false\n"
                "warpath,purpose,p1,Задача,false\nwarpath,commander,k1,Командир,false\n").encode()
    _, data = parse(entities, "entities.csv")
    assert service.apply(data, 1).ok
    sources = "game,code,title,url,publisher,retrieved_at,description\nwarpath,s1,Ист,https://example.org,,2026-10-01,\n"
    _, data = parse(sources.encode(), "sources.csv")
    assert service.apply(data, 1).ok
    builds = ("game,code,title,game_version,unit_class,purpose,commanders,strengths,verification_status,"
              "is_test,source_codes\nwarpath,b1,Билд,,c1,p1,k1,плюс 1|плюс 2,needs_review,false,s1\n")
    _, data = parse(builds.encode(), "builds.csv")
    assert service.apply(data, 1).ok
    row = conn.execute("SELECT strengths FROM builds WHERE code = 'b1'").fetchone()
    assert json.loads(row[0]) == ["плюс 1", "плюс 2"]
    assert conn.execute("SELECT COUNT(*) FROM build_sources").fetchone()[0] == 1


@pytest.mark.parametrize("content, name", [
    (b"{not json", "x.json"), (b"[]", "x.json"), (b"a,b\n1,2\n", "x.csv"),
    (b"\xff\xfe", "x.json"), (b"{}", "x.txt"),
])
def test_bad_files(content, name):
    with pytest.raises(ImportFormatError):
        parse(content, name)


def test_dry_run_then_apply_flow(conn, fixture_data):
    service = ImportService(conn)
    content = json.dumps(fixture_data, ensure_ascii=False).encode()
    run_id, report = service.dry_run(content, "data.json", admin_id=1)
    assert report.ok
    assert conn.execute("SELECT COUNT(*) FROM builds").fetchone()[0] == 0
    assert service.apply_run(run_id, admin_id=1).ok
    assert conn.execute("SELECT COUNT(*) FROM builds").fetchone()[0] == len(fixture_data["builds"])
    with pytest.raises(ValueError):  # повторное нажатие «Применить»
        service.apply_run(run_id, admin_id=1)

    # Повторная загрузка того же файла: только режим обновления
    run2, report2 = service.dry_run(content, "data.json", admin_id=1)
    assert not report2.ok
    assert service.admin_repo.get_import_run(run2)["report"]["update_possible"] is True


def test_bad_file_logged_in_import_runs(conn):
    service = ImportService(conn)
    run_id, report = service.dry_run(b"{oops", "bad.json", admin_id=1)
    run = service.admin_repo.get_import_run(run_id)
    assert run["status"] == "rejected" and not report.ok
    assert service.admin_repo.recent_import_runs(only_problems=True)[0]["id"] == run_id


def test_templates_cannot_be_imported_accidentally(conn):
    for path in (BASE_DIR / "data" / "import_templates").iterdir():
        _, data = parse(path.read_bytes(), path.name)
        assert not ImportService(conn).validate(data).ok, path.name


def test_demo_fixture_is_test_only(conn):
    path = BASE_DIR / "data" / "test_fixtures" / "demo_test_data.json"
    _, data = parse(path.read_bytes(), path.name)
    assert all(b["is_test"] for b in data["builds"])
    assert all(e["is_test"] for e in data["entities"])
    assert ImportService(conn).apply(data, 1).ok
    assert conn.execute("SELECT COUNT(*) FROM builds WHERE is_test = 0").fetchone()[0] == 0
