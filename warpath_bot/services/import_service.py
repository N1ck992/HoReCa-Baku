"""Импорт игровых данных из JSON и CSV.

Порядок работы:
1. parse()    — разбор файла в единый формат (dict).
2. validate() — предварительная проверка без изменения базы: обязательные
                поля, форматы, ссылки между сущностями, дубликаты в файле
                и конфликты с существующими данными.
3. apply()    — запись в одной транзакции. Если в отчёте есть хотя бы одна
                отклонённая запись, применение запрещено. Любая ошибка
                во время записи откатывает всё — база не остаётся
                в частично изменённом состоянии.

Существующие записи по умолчанию НЕ перезаписываются: совпадение кода
считается конфликтом. Обновление возможно только в явном режиме
update_existing=True (отдельная кнопка у администратора).
"""
from __future__ import annotations

import csv
import io
import json
import re
import sqlite3
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from database.connection import transaction, utcnow_iso
from models import ALL_STATUSES, PURPOSE, UNIT_CLASS, VERIFIED
from repositories.admin_repository import AdminRepository

MAX_FILE_BYTES = 1_000_000
CODE_RE = re.compile(r"^[a-z0-9][a-z0-9_.\-]{0,63}$")
TYPE_RE = re.compile(r"^[a-z][a-z_]{1,29}$")
URL_RE = re.compile(r"^https?://[^\s]{3,500}$")
VERSION_RE = re.compile(r"^[0-9A-Za-z][0-9A-Za-z._\- ]{0,39}$")
PLACEHOLDER_RE = re.compile(r"<[^<>]{1,80}>")
SHORT_TEXT, LONG_TEXT, LIST_ITEMS = 120, 3000, 30


class ImportFormatError(Exception):
    """Файл не удалось разобрать (неверный формат)."""


@dataclass
class ImportReport:
    accepted: list[dict] = field(default_factory=list)   # {"kind","key","action"}
    rejected: list[dict] = field(default_factory=list)   # {"kind","key","errors":[...]}
    warnings: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.rejected and bool(self.accepted)

    def to_dict(self) -> dict:
        return {"accepted": self.accepted, "rejected": self.rejected, "warnings": self.warnings}


# ---------------------------------------------------------------------------
# Разбор файлов
# ---------------------------------------------------------------------------
def _split(value: str | None, sep: str) -> list[str]:
    return [p.strip() for p in (value or "").split(sep) if p.strip()]


def _csv_bool(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "да"}


def parse(content: bytes, filename: str) -> tuple[str, dict]:
    if len(content) > MAX_FILE_BYTES:
        raise ImportFormatError("Файл слишком большой (максимум 1 МБ).")
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ImportFormatError("Файл должен быть в кодировке UTF-8.") from exc

    name = (filename or "").lower()
    if name.endswith(".json"):
        try:
            data = json.loads(text)
        except json.JSONDecodeError as exc:
            raise ImportFormatError(f"Ошибка JSON в строке {exc.lineno}: {exc.msg}") from exc
        if not isinstance(data, dict):
            raise ImportFormatError("Корень JSON должен быть объектом {...}.")
        return "json", data
    if name.endswith(".csv"):
        return "csv", _parse_csv(text)
    raise ImportFormatError("Поддерживаются только файлы .json и .csv.")


def _parse_csv(text: str) -> dict:
    reader = csv.DictReader(io.StringIO(text))
    headers = set(reader.fieldnames or [])
    rows = [{k: (v or "").strip() for k, v in row.items() if k} for row in reader]
    if not rows:
        raise ImportFormatError("CSV не содержит строк с данными.")
    game = rows[0].get("game") or "warpath"
    if any((r.get("game") or game) != game for r in rows):
        raise ImportFormatError("Все строки CSV должны относиться к одной игре (колонка game).")

    if {"code", "title", "unit_class", "purpose"} <= headers:
        builds = []
        for r in rows:
            components = [{"role": "commander", "entity": c} for c in _split(r.get("commanders"), ";")]
            components += [{"role": "unit", "entity": c} for c in _split(r.get("units"), ";")]
            components += [{"role": "other", "label": c} for c in _split(r.get("other_components"), ";")]
            sources = [{"source": s, "claim": r.get("source_claim") or None, "confirms": True}
                       for s in _split(r.get("source_codes"), ";")]
            builds.append({
                "code": r.get("code"), "title": r.get("title"),
                "game_version": r.get("game_version") or None,
                "unit_class": r.get("unit_class"), "purpose": r.get("purpose"),
                "description": r.get("description") or None,
                "components": components,
                "upgrade_priority": _split(r.get("upgrade_priority"), "|"),
                "tactics": r.get("tactics") or None,
                "strengths": _split(r.get("strengths"), "|"),
                "weaknesses": _split(r.get("weaknesses"), "|"),
                "verification_status": r.get("verification_status") or "needs_review",
                "status_reason": r.get("status_reason") or None,
                "last_verified_at": r.get("last_verified_at") or None,
                "is_test": _csv_bool(r.get("is_test")),
                "sources": sources,
            })
        return {"game": game, "builds": builds}
    if {"type", "code", "name"} <= headers:
        return {"game": game, "entities": [
            {"type": r.get("type"), "code": r.get("code"), "name": r.get("name"),
             "is_test": _csv_bool(r.get("is_test"))} for r in rows]}
    if {"code", "title"} <= headers and "url" in headers:
        return {"game": game, "sources": [
            {"code": r.get("code"), "title": r.get("title"), "url": r.get("url") or None,
             "publisher": r.get("publisher") or None, "retrieved_at": r.get("retrieved_at") or None,
             "description": r.get("description") or None} for r in rows]}
    if {"version"} <= headers:
        return {"game": game, "game_versions": [
            {"version": r.get("version"), "released_at": r.get("released_at") or None,
             "notes": r.get("notes") or None} for r in rows]}
    raise ImportFormatError(
        "Не удалось определить тип CSV по заголовкам. См. шаблоны в data/import_templates."
    )


# ---------------------------------------------------------------------------
# Проверка
# ---------------------------------------------------------------------------
def _is_date(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    try:
        date.fromisoformat(value[:10])
        return len(value) >= 10
    except ValueError:
        return False


def _text(rec: dict, key: str, errors: list[str], required: bool = False, limit: int = LONG_TEXT):
    value = rec.get(key)
    if value is None or (isinstance(value, str) and not value.strip()):
        if required:
            errors.append(f"поле «{key}» обязательно")
        return None
    if not isinstance(value, str):
        errors.append(f"поле «{key}» должно быть строкой")
        return None
    if len(value) > limit:
        errors.append(f"поле «{key}» длиннее {limit} символов")
    return value.strip()


def _str_list(rec: dict, key: str, errors: list[str]) -> list[str]:
    value = rec.get(key)
    if value is None:
        return []
    if isinstance(value, str):
        value = _split(value, "|")
    if not isinstance(value, list) or not all(isinstance(x, str) for x in value):
        errors.append(f"поле «{key}» должно быть списком строк")
        return []
    if len(value) > LIST_ITEMS:
        errors.append(f"в поле «{key}» больше {LIST_ITEMS} пунктов")
    if any(len(x) > 500 for x in value):
        errors.append(f"пункт в поле «{key}» длиннее 500 символов")
    return [x.strip() for x in value if x.strip()]


def _bool(rec: dict, key: str, errors: list[str], default: bool = False) -> bool:
    value = rec.get(key, default)
    if value is None:
        return default
    if not isinstance(value, bool):
        errors.append(f"поле «{key}» должно быть true или false")
        return default
    return value


def _placeholders(value: Any) -> bool:
    """Есть ли в записи незаполненные заглушки шаблона вида <...>."""
    if isinstance(value, str):
        return bool(PLACEHOLDER_RE.search(value))
    if isinstance(value, dict):
        return any(_placeholders(v) for v in value.values())
    if isinstance(value, list):
        return any(_placeholders(v) for v in value)
    return False


class ImportService:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
        self.admin_repo = AdminRepository(conn)

    # --- вспомогательные запросы -----------------------------------------
    def _game_id(self, code: str) -> int | None:
        r = self.conn.execute("SELECT id FROM games WHERE code = ?", (code,)).fetchone()
        return r["id"] if r else None

    def _db_entity(self, game_id: int, etype: str, code: str) -> sqlite3.Row | None:
        return self.conn.execute(
            "SELECT id, name, is_test, attributes FROM entities WHERE game_id = ? AND entity_type = ? AND code = ?",
            (game_id, etype, code),
        ).fetchone()

    def _db_version(self, game_id: int, version: str) -> sqlite3.Row | None:
        return self.conn.execute(
            "SELECT id FROM game_versions WHERE game_id = ? AND version = ?", (game_id, version)
        ).fetchone()

    def _db_source(self, code: str) -> sqlite3.Row | None:
        return self.conn.execute("SELECT * FROM sources WHERE code = ?", (code,)).fetchone()

    def _db_build(self, game_id: int, code: str) -> sqlite3.Row | None:
        return self.conn.execute(
            "SELECT id FROM builds WHERE game_id = ? AND code = ?", (game_id, code)
        ).fetchone()

    # --- основная проверка -------------------------------------------------
    def validate(self, data: dict, update_existing: bool = False) -> ImportReport:
        report = ImportReport()
        known_keys = {"game", "game_versions", "entities", "sources", "builds", "comment"}
        unknown = set(data) - known_keys
        if unknown:
            report.warnings.append("Неизвестные разделы проигнорированы: " + ", ".join(sorted(unknown)))

        game_code = data.get("game")
        game_id = self._game_id(game_code) if isinstance(game_code, str) else None
        if game_id is None:
            report.rejected.append({"kind": "file", "key": str(game_code),
                                    "errors": ["игра не найдена в базе (поле «game»)"]})
            return report

        for section in ("game_versions", "entities", "sources", "builds"):
            if section in data and not isinstance(data[section], list):
                report.rejected.append({"kind": "file", "key": section,
                                        "errors": [f"раздел «{section}» должен быть списком"]})
        if report.rejected:
            return report
        if not any(data.get(s) for s in ("game_versions", "entities", "sources", "builds")):
            report.rejected.append({"kind": "file", "key": "-", "errors": ["файл не содержит записей"]})
            return report

        file_versions: set[str] = set()
        file_entities: dict[tuple[str, str], bool] = {}   # (type, code) -> is_test
        file_sources: set[str] = set()

        def add_result(kind: str, key: str, errors: list[str], action: str, rec: Any = None) -> bool:
            if rec is not None and _placeholders(rec):
                errors.append("содержит незаполненную заглушку шаблона <...>")
            if errors:
                report.rejected.append({"kind": kind, "key": key, "errors": errors})
                return False
            report.accepted.append({"kind": kind, "key": key, "action": action})
            return True

        # Версии игры
        for i, rec in enumerate(data.get("game_versions") or [], 1):
            errors: list[str] = []
            if not isinstance(rec, dict):
                add_result("game_version", f"#{i}", ["запись должна быть объектом"], "")
                continue
            version = _text(rec, "version", errors, required=True, limit=40)
            if version and not VERSION_RE.match(version):
                errors.append("version: буквы, цифры, точка, дефис, пробел (до 40 символов)")
            released = rec.get("released_at")
            if released is not None and not _is_date(released):
                errors.append("released_at должен быть датой ГГГГ-ММ-ДД")
            _text(rec, "notes", errors, limit=1000)
            key = version or f"#{i}"
            if version in file_versions:
                errors.append("дубликат версии в файле")
            action = "create"
            if version and self._db_version(game_id, version):
                action = "exists"
            if add_result("game_version", key, errors, action, rec) and version:
                file_versions.add(version)

        # Сущности
        for i, rec in enumerate(data.get("entities") or [], 1):
            errors = []
            if not isinstance(rec, dict):
                add_result("entity", f"#{i}", ["запись должна быть объектом"], "")
                continue
            etype = rec.get("type")
            code = rec.get("code")
            if not isinstance(etype, str) or not TYPE_RE.match(etype):
                errors.append("type: латиница в нижнем регистре и _, 2–30 символов")
            if not isinstance(code, str) or not CODE_RE.match(code):
                errors.append("code: латиница/цифры/_-. в нижнем регистре, до 64 символов")
            name = _text(rec, "name", errors, required=True, limit=SHORT_TEXT)
            attrs = rec.get("attributes", {})
            if not isinstance(attrs, dict):
                errors.append("attributes должен быть объектом")
            is_test = _bool(rec, "is_test", errors)
            key = f"{etype}:{code}"
            if (etype, code) in file_entities:
                errors.append("дубликат сущности в файле")
            action = "create"
            if not errors:
                existing = self._db_entity(game_id, etype, code)
                if existing:
                    same = existing["name"] == name and bool(existing["is_test"]) == is_test
                    if same:
                        action = "exists"
                    elif update_existing:
                        action = "update"
                    else:
                        errors.append("уже существует с другими данными (защита от перезаписи)")
            if add_result("entity", key, errors, action, rec):
                file_entities[(etype, code)] = is_test

        # Источники
        for i, rec in enumerate(data.get("sources") or [], 1):
            errors = []
            if not isinstance(rec, dict):
                add_result("source", f"#{i}", ["запись должна быть объектом"], "")
                continue
            code = rec.get("code")
            if not isinstance(code, str) or not CODE_RE.match(code):
                errors.append("code: латиница/цифры/_-. в нижнем регистре")
            title = _text(rec, "title", errors, required=True, limit=200)
            url = rec.get("url")
            if url is not None and (not isinstance(url, str) or not URL_RE.match(url)):
                errors.append("url должен начинаться с http:// или https://")
            if not url and not rec.get("description"):
                errors.append("укажите url или description источника")
            _text(rec, "publisher", errors, limit=SHORT_TEXT)
            _text(rec, "description", errors, limit=1000)
            if rec.get("retrieved_at") is not None and not _is_date(rec.get("retrieved_at")):
                errors.append("retrieved_at должен быть датой ГГГГ-ММ-ДД")
            if code in file_sources:
                errors.append("дубликат источника в файле")
            action = "create"
            if not errors:
                existing = self._db_source(code)
                if existing:
                    same = existing["title"] == title and existing["url"] == url
                    if same:
                        action = "exists"
                    elif update_existing:
                        action = "update"
                    else:
                        errors.append("источник с таким code уже есть с другими данными")
            if add_result("source", str(code), errors, action, rec):
                file_sources.add(code)

        # Билды
        def entity_ref(etype: str, code: Any, errors: list[str], build_is_test: bool, label: str):
            if not isinstance(code, str) or not code:
                errors.append(f"{label}: не указан код")
                return
            if (etype, code) in file_entities:
                is_test = file_entities[(etype, code)]
            else:
                row = self._db_entity(game_id, etype, code)
                if row is None:
                    errors.append(f"{label}: сущность {etype}:{code} не найдена ни в файле, ни в базе")
                    return
                is_test = bool(row["is_test"])
            if is_test and not build_is_test:
                errors.append(f"{label}: рабочий билд не может ссылаться на тестовую сущность {code}")

        seen_builds: set[str] = set()
        for i, rec in enumerate(data.get("builds") or [], 1):
            errors = []
            if not isinstance(rec, dict):
                add_result("build", f"#{i}", ["запись должна быть объектом"], "")
                continue
            code = rec.get("code")
            if not isinstance(code, str) or not CODE_RE.match(code):
                errors.append("code: латиница/цифры/_-. в нижнем регистре, до 64 символов")
            _text(rec, "title", errors, required=True, limit=SHORT_TEXT)
            for key in ("description", "tactics", "status_reason"):
                _text(rec, key, errors)
            for key in ("upgrade_priority", "strengths", "weaknesses"):
                _str_list(rec, key, errors)
            is_test = _bool(rec, "is_test", errors)

            version = rec.get("game_version")
            if version is not None:
                if not isinstance(version, str) or (version not in file_versions
                                                    and not self._db_version(game_id, version)):
                    errors.append(f"версия игры «{version}» не найдена ни в файле, ни в базе")

            entity_ref(UNIT_CLASS, rec.get("unit_class"), errors, is_test, "unit_class")
            entity_ref(PURPOSE, rec.get("purpose"), errors, is_test, "purpose")

            components = rec.get("components") or []
            if not isinstance(components, list):
                errors.append("components должен быть списком")
                components = []
            for n, comp in enumerate(components, 1):
                if not isinstance(comp, dict):
                    errors.append(f"components[{n}] должен быть объектом")
                    continue
                role = comp.get("role")
                if not isinstance(role, str) or not TYPE_RE.match(role):
                    errors.append(f"components[{n}].role указан неверно")
                    continue
                if comp.get("entity"):
                    entity_ref(comp.get("entity_type") or role, comp.get("entity"), errors, is_test,
                               f"components[{n}]")
                elif not (isinstance(comp.get("label"), str) and comp["label"].strip()):
                    errors.append(f"components[{n}]: укажите entity или label")

            status = rec.get("verification_status") or "needs_review"
            if status not in ALL_STATUSES:
                errors.append("verification_status: одно из " + ", ".join(ALL_STATUSES))
            last_verified = rec.get("last_verified_at")
            if last_verified is not None and not _is_date(last_verified):
                errors.append("last_verified_at должен быть датой ГГГГ-ММ-ДД")

            src_refs = rec.get("sources") or []
            confirming = 0
            if not isinstance(src_refs, list):
                errors.append("sources должен быть списком")
                src_refs = []
            for n, ref in enumerate(src_refs, 1):
                if not isinstance(ref, dict) or not isinstance(ref.get("source"), str):
                    errors.append(f"sources[{n}]: укажите код источника в поле source")
                    continue
                if ref["source"] not in file_sources and not self._db_source(ref["source"]):
                    errors.append(f"sources[{n}]: источник «{ref['source']}» не найден")
                if ref.get("checked_at") is not None and not _is_date(ref.get("checked_at")):
                    errors.append(f"sources[{n}].checked_at должен быть датой")
                if ref.get("confirms", True) is True:
                    confirming += 1

            # Правила достоверности: «проверено» нельзя поставить без оснований
            if status == VERIFIED:
                if is_test:
                    errors.append("тестовый билд не может иметь статус verified")
                if confirming == 0:
                    errors.append("verified требует хотя бы один подтверждающий источник")
                if not last_verified:
                    errors.append("verified требует дату проверки last_verified_at")
                if not version:
                    errors.append("verified требует версию игры game_version")
                if not rec.get("status_reason"):
                    errors.append("verified требует обоснование статуса status_reason")

            if code in seen_builds:
                errors.append("дубликат билда в файле")
            action = "create"
            if isinstance(code, str) and self._db_build(game_id, code):
                if update_existing:
                    action = "update"
                else:
                    errors.append("билд с таким code уже существует (защита от перезаписи)")
            if isinstance(code, str):
                seen_builds.add(code)
            add_result("build", str(code), errors, action, rec)

        return report

    # --- применение -----------------------------------------------------------
    def apply(self, data: dict, admin_id: int | None, update_existing: bool = False) -> ImportReport:
        report = self.validate(data, update_existing)
        if not report.ok:
            return report
        now = utcnow_iso()
        game_id = self._game_id(data["game"])
        with transaction(self.conn):
            for rec in data.get("game_versions") or []:
                self.conn.execute(
                    "INSERT INTO game_versions (game_id, version, released_at, notes) VALUES (?, ?, ?, ?)"
                    " ON CONFLICT (game_id, version) DO NOTHING",
                    (game_id, rec["version"].strip(), rec.get("released_at"), rec.get("notes")),
                )
            for rec in data.get("entities") or []:
                self.conn.execute(
                    """INSERT INTO entities (game_id, entity_type, code, name, attributes, is_test)
                       VALUES (?, ?, ?, ?, ?, ?)
                       ON CONFLICT (game_id, entity_type, code) DO UPDATE SET
                           name = excluded.name, attributes = excluded.attributes, is_test = excluded.is_test""",
                    (game_id, rec["type"], rec["code"], rec["name"].strip(),
                     json.dumps(rec.get("attributes") or {}, ensure_ascii=False), int(bool(rec.get("is_test")))),
                )
            for rec in data.get("sources") or []:
                self.conn.execute(
                    """INSERT INTO sources (code, title, url, publisher, description, retrieved_at)
                       VALUES (?, ?, ?, ?, ?, ?)
                       ON CONFLICT (code) DO UPDATE SET title = excluded.title, url = excluded.url,
                           publisher = excluded.publisher, description = excluded.description,
                           retrieved_at = excluded.retrieved_at""",
                    (rec["code"], rec["title"].strip(), rec.get("url"), rec.get("publisher"),
                     rec.get("description"), rec.get("retrieved_at")),
                )
            for rec in data.get("builds") or []:
                self._write_build(game_id, rec, now)
            self.admin_repo.log(admin_id or 0, "import_apply", "import", None, {
                "accepted": len(report.accepted), "update_existing": update_existing,
            })
        return report

    def _entity_id(self, game_id: int, etype: str, code: str) -> int:
        return self._db_entity(game_id, etype, code)["id"]

    def _write_build(self, game_id: int, rec: dict, now: str) -> None:
        version_id = None
        if rec.get("game_version"):
            version_id = self._db_version(game_id, rec["game_version"])["id"]
        values = {
            "title": rec["title"].strip(),
            "game_version_id": version_id,
            "unit_class_id": self._entity_id(game_id, UNIT_CLASS, rec["unit_class"]),
            "purpose_id": self._entity_id(game_id, PURPOSE, rec["purpose"]),
            "description": rec.get("description"),
            "upgrade_priority": json.dumps(_str_list(rec, "upgrade_priority", []), ensure_ascii=False),
            "tactics": rec.get("tactics"),
            "strengths": json.dumps(_str_list(rec, "strengths", []), ensure_ascii=False),
            "weaknesses": json.dumps(_str_list(rec, "weaknesses", []), ensure_ascii=False),
            "verification_status": rec.get("verification_status") or "needs_review",
            "status_reason": rec.get("status_reason"),
            "last_verified_at": rec.get("last_verified_at"),
            "is_test": int(bool(rec.get("is_test"))),
        }
        existing = self._db_build(game_id, rec["code"])
        if existing:
            build_id = existing["id"]
            assignments = ", ".join(f"{k} = ?" for k in values)  # ключи — фиксированный набор выше
            self.conn.execute(f"UPDATE builds SET {assignments}, updated_at = ? WHERE id = ?",
                              [*values.values(), now, build_id])
            self.conn.execute("DELETE FROM build_components WHERE build_id = ?", (build_id,))
            self.conn.execute("DELETE FROM build_sources WHERE build_id = ?", (build_id,))
        else:
            cols = ", ".join(["game_id", "code", *values, "created_at", "updated_at"])
            marks = ", ".join("?" for _ in range(len(values) + 4))
            cur = self.conn.execute(f"INSERT INTO builds ({cols}) VALUES ({marks})",
                                    [game_id, rec["code"], *values.values(), now, now])
            build_id = cur.lastrowid

        for pos, comp in enumerate(rec.get("components") or []):
            entity_id = None
            if comp.get("entity"):
                entity_id = self._entity_id(game_id, comp.get("entity_type") or comp["role"], comp["entity"])
            self.conn.execute(
                "INSERT INTO build_components (build_id, entity_id, role, label, notes, position)"
                " VALUES (?, ?, ?, ?, ?, ?)",
                (build_id, entity_id, comp["role"], comp.get("label"), comp.get("notes"), pos),
            )
        for ref in rec.get("sources") or []:
            source_id = self._db_source(ref["source"])["id"]
            self.conn.execute(
                "INSERT INTO build_sources (build_id, source_id, claim, confirms, checked_at)"
                " VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING",
                (build_id, source_id, ref.get("claim"), int(ref.get("confirms", True) is True),
                 ref.get("checked_at")),
            )

    # --- сценарий для администратора ----------------------------------------
    def dry_run(self, content: bytes, filename: str, admin_id: int | None) -> tuple[int, ImportReport]:
        """Разбор + проверка + запись отчёта в import_runs. База игровых данных не меняется."""
        try:
            fmt, data = parse(content, filename)
        except ImportFormatError as exc:
            report = ImportReport(rejected=[{"kind": "file", "key": filename, "errors": [str(exc)]}])
            with transaction(self.conn):
                run_id = self.admin_repo.create_import_run(
                    admin_id, filename, "unknown", "rejected", 0, 1, report.to_dict(), None)
            return run_id, report
        report = self.validate(data)
        update_possible = False
        if not report.ok:
            # Если единственная причина — существующие записи, предложим режим обновления
            alt = self.validate(data, update_existing=True)
            update_possible = alt.ok
        status = "validated" if report.ok or update_possible else "rejected"
        stored = report.to_dict()
        stored["update_possible"] = update_possible
        with transaction(self.conn):
            run_id = self.admin_repo.create_import_run(
                admin_id, filename, fmt, status, len(report.accepted), len(report.rejected), stored,
                json.dumps(data, ensure_ascii=False))
        return run_id, report

    def apply_run(self, run_id: int, admin_id: int, update_existing: bool = False) -> ImportReport:
        run = self.admin_repo.get_import_run(run_id)
        if run is None or run["status"] != "validated" or not run["payload"]:
            raise ValueError("Импорт не найден или уже обработан.")
        data = json.loads(run["payload"])
        try:
            report = self.apply(data, admin_id, update_existing)
        except Exception as exc:  # транзакция уже откатена
            with transaction(self.conn):
                self.admin_repo.set_import_status(run_id, "failed", utcnow_iso(),
                                                  {"accepted": [], "rejected": [], "warnings": [],
                                                   "error": type(exc).__name__})
            raise
        with transaction(self.conn):
            status = "applied" if report.ok else "rejected"
            self.admin_repo.set_import_status(run_id, status, utcnow_iso(), report.to_dict())
        return report

    def cancel_run(self, run_id: int) -> None:
        with transaction(self.conn):
            self.admin_repo.set_import_status(run_id, "cancelled")
