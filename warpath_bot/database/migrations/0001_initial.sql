-- 0001: начальная схема Warpath Assistant.
-- SQL написан в переносимом стиле, чтобы облегчить переход на PostgreSQL
-- (INTEGER PRIMARY KEY -> BIGSERIAL/IDENTITY, TEXT-даты -> TIMESTAMPTZ).

-- Игры
CREATE TABLE games (
    id          INTEGER PRIMARY KEY,
    code        TEXT    NOT NULL UNIQUE,
    name        TEXT    NOT NULL,
    is_active   INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Версии игры (патчи/сезоны)
CREATE TABLE game_versions (
    id          INTEGER PRIMARY KEY,
    game_id     INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    version     TEXT    NOT NULL,
    released_at TEXT,
    notes       TEXT,
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    UNIQUE (game_id, version)
);

-- Игровые сущности. Тип — свободная строка в пределах игры:
-- unit_class (тип войск/техники), purpose (игровая задача), commander,
-- unit, skill, game_mode и т.д. Специфичные характеристики — в attributes (JSON).
CREATE TABLE entities (
    id          INTEGER PRIMARY KEY,
    game_id     INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    entity_type TEXT    NOT NULL,
    code        TEXT    NOT NULL,
    name        TEXT    NOT NULL,
    attributes  TEXT    NOT NULL DEFAULT '{}',
    is_test     INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0, 1)),
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    UNIQUE (game_id, entity_type, code)
);
CREATE INDEX idx_entities_game_type ON entities (game_id, entity_type);

-- Билды
CREATE TABLE builds (
    id                  INTEGER PRIMARY KEY,
    game_id             INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    code                TEXT    NOT NULL,
    title               TEXT    NOT NULL,
    game_version_id     INTEGER REFERENCES game_versions(id) ON DELETE SET NULL,
    unit_class_id       INTEGER NOT NULL REFERENCES entities(id),
    purpose_id          INTEGER NOT NULL REFERENCES entities(id),
    description         TEXT,
    upgrade_priority    TEXT    NOT NULL DEFAULT '[]',  -- JSON-список шагов
    tactics             TEXT,
    strengths           TEXT    NOT NULL DEFAULT '[]',  -- JSON-список
    weaknesses          TEXT    NOT NULL DEFAULT '[]',  -- JSON-список
    verification_status TEXT    NOT NULL DEFAULT 'needs_review'
        CHECK (verification_status IN
               ('verified', 'needs_review', 'possibly_outdated', 'outdated', 'user_suggestion')),
    status_reason       TEXT,
    last_verified_at    TEXT,
    is_test             INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0, 1)),
    created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    UNIQUE (game_id, code)
);
CREATE INDEX idx_builds_search ON builds (game_id, unit_class_id, purpose_id, verification_status);

-- Состав билда: ссылки на сущности (командиры, юниты, навыки) или свободный текст
CREATE TABLE build_components (
    id          INTEGER PRIMARY KEY,
    build_id    INTEGER NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
    entity_id   INTEGER REFERENCES entities(id),
    role        TEXT    NOT NULL,          -- commander, unit, skill, gear, other...
    label       TEXT,                      -- текст, если сущности нет в базе
    notes       TEXT,
    position    INTEGER NOT NULL DEFAULT 0,
    CHECK (entity_id IS NOT NULL OR label IS NOT NULL)
);
CREATE INDEX idx_components_build ON build_components (build_id);
CREATE INDEX idx_components_entity ON build_components (entity_id);

-- Источники информации
CREATE TABLE sources (
    id           INTEGER PRIMARY KEY,
    code         TEXT NOT NULL UNIQUE,
    title        TEXT NOT NULL,
    url          TEXT,
    publisher    TEXT,
    description  TEXT,
    retrieved_at TEXT,
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Подтверждения: какой источник что подтверждает в билде
CREATE TABLE build_sources (
    build_id     INTEGER NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
    source_id    INTEGER NOT NULL REFERENCES sources(id),
    claim        TEXT,
    confirms     INTEGER NOT NULL DEFAULT 1 CHECK (confirms IN (0, 1)),
    checked_at   TEXT,
    PRIMARY KEY (build_id, source_id)
);

-- Пользователи (идентификация только по Telegram ID)
CREATE TABLE users (
    telegram_id   INTEGER PRIMARY KEY,
    username      TEXT,
    first_name    TEXT,
    language_code TEXT NOT NULL DEFAULT 'ru',
    settings      TEXT NOT NULL DEFAULT '{}',
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    last_seen_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Избранное
CREATE TABLE favorites (
    user_id    INTEGER NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
    build_id   INTEGER NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    PRIMARY KEY (user_id, build_id)
);

-- Тарифы
CREATE TABLE plans (
    code        TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT
);

-- Подписки пользователей и чатов (групп)
CREATE TABLE subscriptions (
    id           INTEGER PRIMARY KEY,
    subject_type TEXT    NOT NULL CHECK (subject_type IN ('user', 'chat')),
    subject_id   INTEGER NOT NULL,
    plan_code    TEXT    NOT NULL REFERENCES plans(code),
    starts_at    TEXT    NOT NULL,
    expires_at   TEXT,
    source       TEXT    NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'test', 'payment')),
    created_by   INTEGER,
    created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_subscriptions_subject ON subscriptions (subject_type, subject_id);

-- Счётчики использования (для лимитов)
CREATE TABLE usage_counters (
    subject_type TEXT    NOT NULL,
    subject_id   INTEGER NOT NULL,
    feature      TEXT    NOT NULL,
    day          TEXT    NOT NULL,
    count        INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (subject_type, subject_id, feature, day)
);

-- Журнал административных изменений
CREATE TABLE admin_audit_log (
    id          INTEGER PRIMARY KEY,
    admin_id    INTEGER NOT NULL,
    action      TEXT    NOT NULL,
    object_type TEXT,
    object_id   TEXT,
    details     TEXT    NOT NULL DEFAULT '{}',
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Запуски импорта (предпроверка и применение) с отчётом
CREATE TABLE import_runs (
    id          INTEGER PRIMARY KEY,
    admin_id    INTEGER,
    filename    TEXT,
    file_format TEXT    NOT NULL,
    status      TEXT    NOT NULL CHECK (status IN ('validated', 'rejected', 'applied', 'failed', 'cancelled')),
    accepted    INTEGER NOT NULL DEFAULT 0,
    rejected    INTEGER NOT NULL DEFAULT 0,
    report      TEXT    NOT NULL DEFAULT '{}',
    payload     TEXT,
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    applied_at  TEXT
);
