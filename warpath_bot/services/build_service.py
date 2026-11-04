"""Бизнес-логика поиска билдов (без Telegram и без проверки подписок)."""
from __future__ import annotations

import sqlite3

from database.connection import transaction
from models import Build, Entity, Game, SearchFilter
from repositories.build_repository import BuildRepository
from repositories.user_repository import UserRepository


class BuildService:
    def __init__(self, conn: sqlite3.Connection, show_test_data: bool = False):
        self.conn = conn
        self.repo = BuildRepository(conn)
        self.users = UserRepository(conn)
        self.show_test_data = show_test_data

    def games(self) -> list[Game]:
        return self.repo.list_games(only_active=True)

    def game(self, game_id: int) -> Game | None:
        g = self.repo.get_game(game_id)
        return g if g and g.is_active else None

    def unit_classes(self, game_id: int) -> list[Entity]:
        return self.repo.available_unit_classes(game_id, self.show_test_data)

    def purposes(self, game_id: int, unit_class_id: int) -> list[Entity]:
        return self.repo.available_purposes(game_id, unit_class_id, self.show_test_data)

    def commanders(self, game_id: int, unit_class_id: int, purpose_id: int) -> list[Entity]:
        return self.repo.available_commanders(
            SearchFilter(game_id, unit_class_id, purpose_id, include_test=self.show_test_data))

    def search(self, game_id: int, unit_class_id: int | None = None, purpose_id: int | None = None,
               commander_id: int | None = None) -> list[dict]:
        return self.repo.search(SearchFilter(game_id, unit_class_id, purpose_id, commander_id,
                                             include_test=self.show_test_data))

    def entity(self, entity_id: int) -> Entity | None:
        return self.repo.get_entity(entity_id)

    def get_build(self, build_id: int, for_admin: bool = False) -> Build | None:
        """Карточка билда. Тестовые билды скрыты, если показ тестовых данных выключен."""
        build = self.repo.get_build(build_id)
        if build is None:
            return None
        if build.is_test and not (self.show_test_data or for_admin):
            return None
        return build

    # --- Избранное ----------------------------------------------------------
    def toggle_favorite(self, user_id: int, build_id: int) -> bool:
        """Возвращает True, если билд теперь в избранном."""
        with transaction(self.conn):
            if self.users.is_favorite(user_id, build_id):
                self.users.remove_favorite(user_id, build_id)
                return False
            self.users.add_favorite(user_id, build_id)
            return True

    def is_favorite(self, user_id: int, build_id: int) -> bool:
        return self.users.is_favorite(user_id, build_id)

    def favorites(self, user_id: int) -> list[dict]:
        items = self.users.list_favorites(user_id)
        if not self.show_test_data:
            items = [i for i in items if not i["is_test"]]
        return items

    def knowledge_summary(self, game_id: int) -> dict:
        """Количество билдов, видимых в поиске, по статусам проверки."""
        counts = {"visible": 0, "verified": 0, "needs_review": 0, "possibly_outdated": 0}
        for item in self.search(game_id):
            counts["visible"] += 1
            if item["verification_status"] in counts:
                counts[item["verification_status"]] += 1
        return counts
