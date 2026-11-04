"""Локализация. Добавление языка: создать locales/<код>.py с TEXTS и
зарегистрировать его в LANGUAGES. Отсутствующие ключи берутся из русского."""
from __future__ import annotations

from locales import ru

DEFAULT_LANGUAGE = "ru"
LANGUAGES = {"ru": ru.TEXTS}


def t(key: str, lang: str | None = None, **kwargs) -> str:
    texts = LANGUAGES.get(lang or DEFAULT_LANGUAGE, LANGUAGES[DEFAULT_LANGUAGE])
    template = texts.get(key) or LANGUAGES[DEFAULT_LANGUAGE].get(key) or key
    return template.format(**kwargs) if kwargs else template
