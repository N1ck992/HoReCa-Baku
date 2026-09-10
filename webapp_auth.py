"""Проверка подлинности данных, которые Telegram передаёт в Mini App.

Когда сайт открыт через настоящую кнопку в Telegram, сам Telegram
прикладывает к открытию строку initData — она содержит, кто именно открыл
сайт (telegram_id, имя), и подписана секретным ключом бота. Подделать эту
подпись без токена бота невозможно, поэтому мы можем доверять данным,
успешно прошедшим эту проверку — и не доверять вообще ничему, если
проверка не пройдена (например, если initData вообще нет — значит, сайт
открыли не через Telegram, а просто по ссылке в браузере).

Алгоритм ровно такой, как описан в официальной документации Telegram:
https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl


def validate_init_data(init_data: str, bot_token: str, max_age_seconds: int = 86400) -> dict | None:
    """Возвращает словарь с данными пользователя (id, имя и т.д.), если
    initData подлинная и не устарела. Возвращает None при любой проблеме —
    вызывающий код должен в этом случае отказать в доступе."""
    if not init_data:
        return None

    try:
        pairs = dict(parse_qsl(init_data, strict_parsing=True))
    except ValueError:
        return None

    received_hash = pairs.pop("hash", None)
    if not received_hash:
        return None

    data_check_string = "\n".join(f"{key}={value}" for key, value in sorted(pairs.items()))
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    computed_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(computed_hash, received_hash):
        return None

    auth_date = pairs.get("auth_date")
    if auth_date is not None:
        try:
            if time.time() - int(auth_date) > max_age_seconds:
                return None
        except ValueError:
            return None

    user_json = pairs.get("user")
    if not user_json:
        return None

    try:
        user = json.loads(user_json)
    except json.JSONDecodeError:
        return None

    if "id" not in user:
        return None

    return user
