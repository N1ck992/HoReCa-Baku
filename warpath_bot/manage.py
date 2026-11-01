"""Служебные команды (запуск на сервере/локально):

  python manage.py init-db                  создать/обновить базу
  python manage.py health                   проверка базы (код возврата 0 = ок)
  python manage.py check-config             проверка переменных окружения (без вывода секретов)
  python manage.py import FILE              предпроверка импорта (база не меняется)
  python manage.py import FILE --apply      применить импорт (одна транзакция)
  python manage.py import FILE --apply --update   разрешить обновление существующих записей
  python manage.py load-demo                загрузить ТЕСТОВЫЕ данные (помечены 🧪)
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from config import BASE_DIR, ConfigError, load_settings
from database.connection import open_database
from services.admin_service import AdminService
from services.import_service import ImportFormatError, ImportService, parse

DEMO_FILE = BASE_DIR / "data" / "test_fixtures" / "demo_test_data.json"


def _print_report(report) -> None:
    print(f"Принято: {len(report.accepted)}, отклонено: {len(report.rejected)}")
    for item in report.rejected:
        print(f"  ✗ {item['kind']} {item['key']}: {'; '.join(item['errors'])}")
    for w in report.warnings:
        print(f"  ! {w}")


def cmd_import(conn, path: Path, apply: bool, update: bool) -> int:
    try:
        _, data = parse(path.read_bytes(), path.name)
    except (OSError, ImportFormatError) as exc:
        print(f"Ошибка файла: {exc}")
        return 1
    service = ImportService(conn)
    if not apply:
        report = service.validate(data, update_existing=update)
        print("ПРЕДПРОВЕРКА (база не изменена)")
        _print_report(report)
        return 0 if report.ok else 1
    report = service.apply(data, admin_id=None, update_existing=update)
    print("ПРИМЕНЕНО" if report.ok else "НЕ ПРИМЕНЕНО (есть ошибки, база не изменена)")
    _print_report(report)
    return 0 if report.ok else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Warpath Assistant: служебные команды")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("init-db")
    sub.add_parser("health")
    sub.add_parser("check-config")
    sub.add_parser("load-demo")
    imp = sub.add_parser("import")
    imp.add_argument("file", type=Path)
    imp.add_argument("--apply", action="store_true")
    imp.add_argument("--update", action="store_true")
    args = parser.parse_args(argv)

    if args.command == "check-config":
        try:
            s = load_settings(require_token=True)
        except ConfigError as exc:
            print(f"Ошибка: {exc}")
            return 2
        print(f"OK. BOT_TOKEN задан. Админов: {len(s.admin_ids)}. База: {s.database_path}. "
              f"Тестовые данные: {'показываются' if s.show_test_data else 'скрыты'}.")
        return 0

    settings = load_settings(require_token=False)
    conn = open_database(settings.database_path)
    try:
        if args.command == "init-db":
            print(f"База готова: {settings.database_path}")
            return 0
        if args.command == "health":
            h = AdminService(conn).health()
            print(json.dumps(h, ensure_ascii=False, indent=2))
            return 0 if h["integrity"] == "ok" else 1
        if args.command == "load-demo":
            return cmd_import(conn, DEMO_FILE, apply=True, update=True)
        if args.command == "import":
            return cmd_import(conn, args.file, args.apply, args.update)
    finally:
        conn.close()
    return 1


if __name__ == "__main__":
    sys.exit(main())
