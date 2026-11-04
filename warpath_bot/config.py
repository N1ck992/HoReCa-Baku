"""Конфигурация приложения из переменных окружения.

Токен и прочие секреты читаются только из окружения (или локального .env,
который исключён из Git). Значение токена никогда не выводится в логи.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

_TOKEN_RE = re.compile(r"^\d{5,15}:[A-Za-z0-9_-]{30,}$")


class ConfigError(Exception):
    """Ошибка конфигурации. Сообщение не содержит значений секретов."""


def _parse_bool(value: str | None, default: bool = False) -> bool:
    if value is None or value.strip() == "":
        return default
    return value.strip().lower() in {"1", "true", "yes", "on", "да"}


def _parse_int(name: str, value: str | None, default: int | None) -> int | None:
    if value is None or value.strip() == "":
        return default
    try:
        return int(value.strip())
    except ValueError as exc:
        raise ConfigError(f"Переменная {name} должна быть целым числом") from exc


def _parse_admin_ids(value: str | None) -> frozenset[int]:
    ids: set[int] = set()
    for part in (value or "").replace(";", ",").split(","):
        part = part.strip()
        if not part:
            continue
        if not part.lstrip("-").isdigit():
            raise ConfigError("ADMIN_IDS должен содержать числовые Telegram ID через запятую")
        ids.add(int(part))
    return frozenset(ids)


@dataclass(frozen=True)
class Settings:
    bot_token: str = field(repr=False)  # repr=False: токен не попадёт в логи
    admin_ids: frozenset[int]
    database_path: Path
    show_test_data: bool = False
    free_daily_search_limit: int = 50
    health_port: int | None = None
    log_level: str = "INFO"
    default_language: str = "ru"


def load_settings(require_token: bool = True, env_file: str | None = None) -> Settings:
    """Загружает настройки. .env подхватывается, если установлен python-dotenv."""
    try:
        from dotenv import load_dotenv

        load_dotenv(env_file or BASE_DIR / ".env", override=False)
    except ImportError:  # pragma: no cover - dotenv необязателен
        pass

    token = (os.getenv("BOT_TOKEN") or "").strip()
    if require_token:
        if not token:
            raise ConfigError("Не задан BOT_TOKEN. Укажите токен от @BotFather в переменных окружения.")
        if not _TOKEN_RE.match(token):
            raise ConfigError("BOT_TOKEN имеет неверный формат (ожидается <id>:<ключ> от @BotFather).")

    db_path = Path(os.getenv("DATABASE_PATH") or "data/runtime/warpath.db")
    if not db_path.is_absolute():
        db_path = BASE_DIR / db_path

    log_level = (os.getenv("LOG_LEVEL") or "INFO").upper()
    if log_level not in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
        log_level = "INFO"

    return Settings(
        bot_token=token,
        admin_ids=_parse_admin_ids(os.getenv("ADMIN_IDS")),
        database_path=db_path,
        show_test_data=_parse_bool(os.getenv("SHOW_TEST_DATA")),
        free_daily_search_limit=_parse_int(
            "FREE_DAILY_SEARCH_LIMIT", os.getenv("FREE_DAILY_SEARCH_LIMIT"), 50
        ),
        health_port=_parse_int("HEALTH_PORT", os.getenv("HEALTH_PORT"), None),
        log_level=log_level,
    )


def mask_secret(text: str, secret: str) -> str:
    """Заменяет секрет в тексте (например, в сообщении исключения)."""
    if secret and secret in text:
        return text.replace(secret, "***")
    return text
