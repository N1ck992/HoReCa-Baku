-- 0002: справочные данные, не содержащие игровых утверждений.
-- Версии игры, войска, командиры и билды здесь НЕ создаются:
-- они добавляются только через импорт с указанием источников.

INSERT INTO games (code, name, is_active) VALUES ('warpath', 'Warpath', 1)
ON CONFLICT (code) DO NOTHING;

INSERT INTO plans (code, name, description) VALUES
    ('free', 'Бесплатный', 'Базовый поиск с суточным лимитом'),
    ('premium', 'Premium', 'Персональная подписка (оплата пока не подключена)'),
    ('group_premium', 'Premium для группы', 'Подписка для Telegram-группы (оплата пока не подключена)')
ON CONFLICT (code) DO NOTHING;
