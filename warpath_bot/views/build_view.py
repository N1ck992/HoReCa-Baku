"""Тексты карточки билда. Карточка разбита на части, чтобы не перегружать
экран телефона. Все данные из базы экранируются (parse_mode=HTML)."""
from __future__ import annotations

from html import escape

from locales import t
from models import Build

PARTS = ("main", "tac", "pro", "src")
MAX_MESSAGE = 3900  # запас до лимита Telegram 4096

STATUS_ICONS = {
    "verified": "✅", "needs_review": "⚠️", "possibly_outdated": "⏳",
    "outdated": "❌", "user_suggestion": "💬",
}


def status_label(status: str, is_test: bool, lang: str = "ru") -> str:
    if is_test:
        return t("status_test", lang)
    return t(f"status_{status}", lang)


def list_item_label(item: dict) -> str:
    """Короткая подпись кнопки в списке результатов/избранного."""
    icon = "🧪" if item["is_test"] else STATUS_ICONS.get(item["verification_status"], "•")
    title = item["title"]
    if len(title) > 50:
        title = title[:49] + "…"
    return f"{icon} {title}"


def _bullets(items: list[str], lang: str) -> str:
    if not items:
        return t("card_none", lang)
    return "\n".join(f"• {escape(x)}" for x in items)


def _numbered(items: list[str], lang: str) -> str:
    if not items:
        return t("card_none", lang)
    return "\n".join(f"{i}. {escape(x)}" for i, x in enumerate(items, 1))


def _truncate(text: str) -> str:
    return text if len(text) <= MAX_MESSAGE else text[: MAX_MESSAGE - 1] + "…"


def render_build(build: Build, part: str = "main", lang: str = "ru") -> str:
    header = t("card_header", lang, title=escape(build.title),
               status=status_label(build.verification_status, build.is_test, lang))
    lines = [header]

    if part == "main":
        version = (t("card_version", lang, version=escape(build.game_version))
                   if build.game_version else t("card_no_version", lang))
        lines.append(t("card_meta", lang, game=escape(build.game_name), version=version,
                       unit_class=escape(build.unit_class), purpose=escape(build.purpose)))
        if build.description:
            lines.append(t("card_description", lang, text=escape(build.description)))
        lines.append(t("card_components", lang))
        if build.components:
            for c in build.components:
                role = t(f"role_{c.role}", lang)
                if role == f"role_{c.role}":
                    role = escape(c.role)
                note = f" — {escape(c.notes)}" if c.notes else ""
                lines.append(f"• {role}: {escape(c.name)}{note}")
        else:
            lines.append(t("card_no_components", lang))
    elif part == "tac":
        lines.append(t("card_tactics", lang, text=escape(build.tactics))
                     if build.tactics else t("card_no_tactics", lang))
        lines.append(t("card_priority", lang))
        lines.append(_numbered(build.upgrade_priority, lang))
    elif part == "pro":
        lines.append(t("card_strengths", lang))
        lines.append(_bullets(build.strengths, lang))
        lines.append(t("card_weaknesses", lang))
        lines.append(_bullets(build.weaknesses, lang))
    elif part == "src":
        lines.append(t("card_sources", lang))
        if build.sources:
            for s in build.sources:
                title = escape(s.title)
                if s.url:
                    title = f'<a href="{escape(s.url, quote=True)}">{title}</a>'
                extra = []
                if s.publisher:
                    extra.append(escape(s.publisher))
                if s.retrieved_at:
                    extra.append(escape(s.retrieved_at[:10]))
                suffix = f" ({', '.join(extra)})" if extra else ""
                flag = "" if s.confirms else t("card_source_not_confirm", lang)
                claim = f"\n  └ {escape(s.claim)}" if s.claim else ""
                lines.append(f"• {title}{suffix}{flag}{claim}")
        else:
            lines.append(t("card_no_sources", lang))
        if build.status_reason:
            lines.append(t("card_status_reason", lang, text=escape(build.status_reason)))
        lines.append(t("card_last_verified", lang, date=escape(build.last_verified_at[:10]))
                     if build.last_verified_at else t("card_never_verified", lang))
    return _truncate("\n\n".join(lines[:2]) + ("\n" if len(lines) > 2 else "") + "\n".join(lines[2:]))
