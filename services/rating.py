def percentage_to_stars(percentage: float, max_stars: int = 5) -> str:
    """Переводит процент правильных ответов в звёздный рейтинг, например ⭐⭐⭐⭐☆."""
    filled = round((percentage / 100) * max_stars)
    filled = max(0, min(max_stars, filled))
    return "⭐" * filled + "☆" * (max_stars - filled)


def rank_progress_text(current_rank, next_rank, xp: int) -> str:
    """Строка вида 'Барбэк (120 / 150 XP до Бармен)' или без 'до', если ранг максимальный."""
    if current_rank is None:
        return f"{xp} XP"
    label = f"{current_rank.emoji} {current_rank.title}"
    if next_rank is None:
        return f"{label} (максимальный ранг, {xp} XP)"
    return f"{label} ({xp} / {next_rank.min_xp} XP до «{next_rank.title}»)"


def display_name(user) -> str:
    """Красивое отображаемое имя пользователя для рейтингов/профиля."""
    if user.full_name:
        return user.full_name
    if user.username:
        return f"@{user.username}"
    return f"ID {user.telegram_id}"
