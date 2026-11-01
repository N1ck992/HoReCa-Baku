"""Доменные модели (без зависимости от Telegram и конкретной СУБД)."""
from __future__ import annotations

from dataclasses import dataclass, field

# Статусы проверки билда
VERIFIED = "verified"
NEEDS_REVIEW = "needs_review"
POSSIBLY_OUTDATED = "possibly_outdated"
OUTDATED = "outdated"
USER_SUGGESTION = "user_suggestion"

ALL_STATUSES = (VERIFIED, NEEDS_REVIEW, POSSIBLY_OUTDATED, OUTDATED, USER_SUGGESTION)
# Что видят обычные пользователи в поиске (каждый с явной пометкой статуса)
USER_VISIBLE_STATUSES = (VERIFIED, NEEDS_REVIEW, POSSIBLY_OUTDATED)

# Базовые типы сущностей, на которых построен пошаговый поиск
UNIT_CLASS = "unit_class"
PURPOSE = "purpose"
COMMANDER = "commander"


@dataclass(frozen=True)
class Game:
    id: int
    code: str
    name: str
    is_active: bool


@dataclass(frozen=True)
class Entity:
    id: int
    game_id: int
    entity_type: str
    code: str
    name: str
    is_test: bool = False


@dataclass(frozen=True)
class Component:
    role: str
    name: str
    entity_id: int | None = None
    notes: str | None = None


@dataclass(frozen=True)
class SourceRef:
    title: str
    url: str | None
    publisher: str | None
    retrieved_at: str | None
    claim: str | None
    confirms: bool


@dataclass
class Build:
    id: int
    game_id: int
    game_name: str
    code: str
    title: str
    game_version: str | None
    unit_class: str
    purpose: str
    description: str | None
    upgrade_priority: list[str]
    tactics: str | None
    strengths: list[str]
    weaknesses: list[str]
    verification_status: str
    status_reason: str | None
    last_verified_at: str | None
    is_test: bool
    updated_at: str
    components: list[Component] = field(default_factory=list)
    sources: list[SourceRef] = field(default_factory=list)

    @property
    def is_verified(self) -> bool:
        return self.verification_status == VERIFIED and not self.is_test


@dataclass(frozen=True)
class SearchFilter:
    game_id: int
    unit_class_id: int | None = None
    purpose_id: int | None = None
    commander_id: int | None = None
    include_test: bool = False
