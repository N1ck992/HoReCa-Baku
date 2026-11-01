"""Административные функции. Доступ — только Telegram ID из ADMIN_IDS
и только в личном чате (отчёты импорта не должны попадать в группы)."""
from __future__ import annotations

import json
import logging
from html import escape

from aiogram import Bot, F, Router
from aiogram.enums import ChatType
from aiogram.filters import Command, CommandObject, Filter
from aiogram.types import BufferedInputFile, CallbackQuery, Message, TelegramObject

from bot_utils.telegram_safe import respond, safe_answer
from config import BASE_DIR
from keyboards.admin_menu import admin_back_kb, admin_menu_kb, import_confirm_kb
from keyboards.callbacks import AdminCB
from locales import t
from models import ALL_STATUSES, OUTDATED
from services.access_service import AccessService
from services.admin_service import AdminError, AdminService
from services.import_service import MAX_FILE_BYTES, ImportReport, ImportService

logger = logging.getLogger(__name__)
# guard_router — отказы для не-админов; router — сами админ-функции.
# Разделены, потому что фильтр роутера действует на все его обработчики.
guard_router = Router(name="admin_guard")
router = Router(name="admin")

ADMIN_COMMANDS = ("admin", "status", "outdated", "edit", "game_update", "grant", "revoke",
                  "templates", "health", "build_admin")
TEMPLATES_DIR = BASE_DIR / "data" / "import_templates"

COMMANDS_HELP = (
    "⌨️ <b>Команды администратора</b>\n\n"
    "/admin — меню\n"
    "/health — состояние базы\n"
    "/templates — шаблоны импорта\n"
    "Импорт: отправьте файл .json или .csv боту\n\n"
    "/build_admin &lt;id&gt; — карточка (вкл. тестовые)\n"
    "/status &lt;id&gt; &lt;статус&gt; [обоснование]\n"
    f"  статусы: {', '.join(ALL_STATUSES)}\n"
    "/outdated &lt;id&gt; [причина]\n"
    "/edit &lt;id&gt; &lt;поле&gt; &lt;значение&gt;\n"
    "  поля: title, description, tactics,\n"
    "  upgrade_priority, strengths, weaknesses (пункты через |)\n"
    "/game_update &lt;версия&gt; — новая версия игры;\n"
    "  проверенные билды → «возможно устарело»\n"
    "/grant &lt;user|chat&gt; &lt;id&gt; &lt;premium|group_premium&gt; [дней]\n"
    "  тестовая подписка без оплаты\n"
    "/revoke &lt;user|chat&gt; &lt;id&gt;"
)


class IsAdmin(Filter):
    async def __call__(self, event: TelegramObject, access_service: AccessService) -> bool:
        user = getattr(event, "from_user", None)
        return access_service.is_admin(user.id if user else None)


def _is_private(event: Message | CallbackQuery) -> bool:
    msg = event.message if isinstance(event, CallbackQuery) else event
    return bool(msg) and msg.chat.type == ChatType.PRIVATE


# --- Отказ обычным пользователям ---------------------------------------------
@guard_router.message(Command(*ADMIN_COMMANDS), ~IsAdmin())
async def deny_command(message: Message, lang: str) -> None:
    await respond(message, t("admin_only", lang))


@guard_router.callback_query(AdminCB.filter(), ~IsAdmin())
async def deny_callback(callback: CallbackQuery, lang: str) -> None:
    await safe_answer(callback, t("admin_only", lang), show_alert=True)


@guard_router.message(Command(*ADMIN_COMMANDS), IsAdmin(), F.chat.type != ChatType.PRIVATE)
async def admin_in_group(message: Message, lang: str) -> None:
    await respond(message, t("private_only", lang))


@guard_router.message(F.document, F.chat.type == ChatType.PRIVATE, ~IsAdmin())
async def deny_document(message: Message, lang: str) -> None:
    await respond(message, t("admin_only", lang))


# Все обработчики ниже — только для админов и только в личном чате
router.message.filter(IsAdmin(), F.chat.type == ChatType.PRIVATE)
router.callback_query.filter(IsAdmin())


def _format_report(report: ImportReport, title: str) -> str:
    lines = [title]
    summary: dict[str, int] = {}
    for item in report.accepted:
        key = f"{item['kind']} ({item['action']})"
        summary[key] = summary.get(key, 0) + 1
    lines.append(f"✅ Принято: {len(report.accepted)}")
    for key, n in sorted(summary.items()):
        lines.append(f"  • {escape(key)}: {n}")
    lines.append(f"❌ Отклонено: {len(report.rejected)}")
    for item in report.rejected[:15]:
        errors = "; ".join(item["errors"])
        lines.append(f"  • {escape(item['kind'])} <code>{escape(str(item['key']))}</code>: {escape(errors)}")
    if len(report.rejected) > 15:
        lines.append(f"  … и ещё {len(report.rejected) - 15}")
    for w in report.warnings:
        lines.append(f"⚠️ {escape(w)}")
    text = "\n".join(lines)
    return text if len(text) < 3900 else text[:3890] + "…"


@router.message(Command("admin"))
async def cmd_admin(message: Message) -> None:
    await respond(message, "🛠 <b>Администрирование</b>", admin_menu_kb())


@router.callback_query(AdminCB.filter(F.action == "menu"))
async def cb_admin_menu(callback: CallbackQuery) -> None:
    await respond(callback, "🛠 <b>Администрирование</b>", admin_menu_kb())


def _health_text(admin_service: AdminService) -> str:
    h = admin_service.health()
    s = h["stats"]
    by_status = "\n".join(f"  • {escape(k)}: {v}" for k, v in sorted(s["builds_by_status"].items())) or "  —"
    return (
        "📊 <b>Состояние базы</b>\n\n"
        f"Целостность: {escape(h['integrity'])}\n"
        f"Миграции: {', '.join(map(str, h['migrations']))}\n\n"
        f"Игр: {s['games']}, версий: {s['game_versions']}\n"
        f"Сущностей: {s['entities']}, источников: {s['sources']}\n"
        f"Билдов: {s['builds_total']} (тестовых: {s['builds_test']})\n"
        f"Рабочие билды по статусам:\n{by_status}\n"
        f"Пользователей: {s['users']}, в избранном: {s['favorites']}"
    )


@router.message(Command("health"))
async def cmd_health(message: Message, admin_service: AdminService) -> None:
    await respond(message, _health_text(admin_service), admin_back_kb())


@router.callback_query(AdminCB.filter(F.action == "health"))
async def cb_health(callback: CallbackQuery, admin_service: AdminService) -> None:
    await respond(callback, _health_text(admin_service), admin_back_kb())


@router.callback_query(AdminCB.filter(F.action == "commands"))
async def cb_commands(callback: CallbackQuery) -> None:
    await respond(callback, COMMANDS_HELP, admin_back_kb())


@router.callback_query(AdminCB.filter(F.action == "import_help"))
async def cb_import_help(callback: CallbackQuery) -> None:
    text = (
        "📥 <b>Импорт данных</b>\n\n"
        "1. /templates — получить шаблоны.\n"
        "2. Заполните файл (формат: docs/IMPORT_FORMAT.md).\n"
        "3. Отправьте файл .json или .csv сюда.\n"
        "4. Бот проверит его <b>без записи в базу</b> и покажет отчёт.\n"
        "5. Нажмите «Применить» — запись в одной транзакции.\n\n"
        "Существующие записи без явного подтверждения не перезаписываются."
    )
    await respond(callback, text, admin_back_kb())


@router.message(Command("templates"))
async def cmd_templates(message: Message) -> None:
    for path in sorted(TEMPLATES_DIR.glob("*.*")):
        await message.answer_document(BufferedInputFile(path.read_bytes(), filename=path.name))


@router.message(F.document)
async def on_document(message: Message, bot: Bot, import_service: ImportService) -> None:
    doc = message.document
    name = doc.file_name or "file"
    if not name.lower().endswith((".json", ".csv")):
        return await respond(message, "Поддерживаются только файлы .json и .csv.")
    if doc.file_size and doc.file_size > MAX_FILE_BYTES:
        return await respond(message, "Файл слишком большой (максимум 1 МБ).")
    buffer = await bot.download(doc)
    run_id, report = import_service.dry_run(buffer.read(), name, message.from_user.id)
    run = import_service.admin_repo.get_import_run(run_id)
    update_possible = bool(run["report"].get("update_possible"))
    title = f"🔎 <b>Предпроверка импорта #{run_id}</b> ({escape(name)})\nБаза пока не изменена."
    text = _format_report(report, title)
    if update_possible:
        text += "\n\nℹ️ Часть записей уже есть в базе. Их можно обновить только явной кнопкой ниже."
    can_apply = report.ok
    if can_apply or update_possible:
        await respond(message, text, import_confirm_kb(run_id, can_apply, update_possible))
    else:
        await respond(message, text + "\n\nИсправьте файл и отправьте снова.", admin_back_kb())


@router.callback_query(AdminCB.filter(F.action.in_({"apply", "apply_upd"})))
async def cb_apply(callback: CallbackQuery, callback_data: AdminCB, import_service: ImportService) -> None:
    update = callback_data.action == "apply_upd"
    try:
        report = import_service.apply_run(callback_data.run, callback.from_user.id, update_existing=update)
    except ValueError as exc:
        return await safe_answer(callback, str(exc), show_alert=True)
    except Exception:
        logger.exception("Ошибка применения импорта #%s", callback_data.run)
        return await respond(callback, "❌ Ошибка при записи. Все изменения откатены, база не изменена.",
                             admin_back_kb())
    if report.ok:
        title = f"✅ <b>Импорт #{callback_data.run} применён</b>"
    else:
        title = f"❌ <b>Импорт #{callback_data.run} не применён</b> — данные изменились после проверки"
    await respond(callback, _format_report(report, title), admin_back_kb())


@router.callback_query(AdminCB.filter(F.action == "cancel"))
async def cb_cancel(callback: CallbackQuery, callback_data: AdminCB, import_service: ImportService) -> None:
    import_service.cancel_run(callback_data.run)
    await respond(callback, f"Импорт #{callback_data.run} отменён. База не изменена.", admin_back_kb())


@router.callback_query(AdminCB.filter(F.action == "import_errors"))
async def cb_import_errors(callback: CallbackQuery, import_service: ImportService) -> None:
    runs = import_service.admin_repo.recent_import_runs(5, only_problems=True)
    if not runs:
        return await respond(callback, "🧾 Ошибок импорта нет.", admin_back_kb())
    parts = ["🧾 <b>Последние импорты с ошибками</b>"]
    for run in runs:
        parts.append(f"\n<b>#{run['id']}</b> {escape(run['filename'] or '')} — {run['status']}, "
                     f"{run['created_at'][:16]}")
        for item in run["report"].get("rejected", [])[:5]:
            parts.append(f"• {escape(item['kind'])} <code>{escape(str(item['key']))}</code>: "
                         f"{escape('; '.join(item['errors']))}")
        if run["report"].get("error"):
            parts.append(f"• ошибка записи: {escape(run['report']['error'])}")
    text = "\n".join(parts)
    await respond(callback, text[:3900], admin_back_kb())


@router.callback_query(AdminCB.filter(F.action == "log"))
async def cb_log(callback: CallbackQuery, import_service: ImportService) -> None:
    entries = import_service.admin_repo.recent_log(10)
    if not entries:
        return await respond(callback, "📜 Журнал пуст.", admin_back_kb())
    lines = ["📜 <b>Журнал изменений</b>"]
    for e in entries:
        details = json.loads(e["details"] or "{}")
        short = ", ".join(f"{k}={v}" for k, v in details.items())[:120]
        lines.append(f"• {e['created_at'][:16]} {escape(e['action'])} "
                     f"{escape(e['object_type'] or '')} {escape(e['object_id'] or '')} "
                     f"(admin {e['admin_id']}) {escape(short)}")
    await respond(callback, "\n".join(lines)[:3900], admin_back_kb())


def _parse_id(value: str | None) -> int | None:
    return int(value) if value and value.lstrip("-").isdigit() else None


@router.message(Command("build_admin"))
async def cmd_build_admin(message: Message, command: CommandObject, build_service) -> None:
    from views.build_view import render_build

    build_id = _parse_id((command.args or "").strip())
    build = build_service.get_build(build_id, for_admin=True) if build_id else None
    if build is None:
        return await respond(message, "Использование: /build_admin &lt;id&gt; (билд не найден)")
    text = render_build(build, "main") + f"\n\nID: {build.id}, code: <code>{escape(build.code)}</code>"
    await respond(message, text)


@router.message(Command("status", "outdated"))
async def cmd_status(message: Message, command: CommandObject, admin_service: AdminService) -> None:
    args = (command.args or "").split(maxsplit=2 if command.command == "status" else 1)
    build_id = _parse_id(args[0] if args else None)
    if command.command == "status":
        if build_id is None or len(args) < 2:
            return await respond(message, "Использование: /status &lt;id&gt; &lt;статус&gt; [обоснование]")
        status, reason = args[1], (args[2] if len(args) > 2 else None)
    else:
        if build_id is None:
            return await respond(message, "Использование: /outdated &lt;id&gt; [причина]")
        status, reason = OUTDATED, (args[1] if len(args) > 1 else None)
    try:
        admin_service.set_status(message.from_user.id, build_id, status, reason)
    except AdminError as exc:
        return await respond(message, f"❌ {escape(str(exc))}")
    await respond(message, f"✅ Статус билда #{build_id}: {escape(status)}")


@router.message(Command("edit"))
async def cmd_edit(message: Message, command: CommandObject, admin_service: AdminService) -> None:
    args = (command.args or "").split(maxsplit=2)
    build_id = _parse_id(args[0] if args else None)
    if build_id is None or len(args) < 3:
        return await respond(message, "Использование: /edit &lt;id&gt; &lt;поле&gt; &lt;значение&gt;")
    try:
        admin_service.edit_field(message.from_user.id, build_id, args[1], args[2])
    except AdminError as exc:
        return await respond(message, f"❌ {escape(str(exc))}")
    await respond(message, f"✅ Билд #{build_id}: поле {escape(args[1])} обновлено")


@router.message(Command("game_update"))
async def cmd_game_update(message: Message, command: CommandObject, admin_service: AdminService) -> None:
    version = (command.args or "").strip()
    try:
        changed = admin_service.register_game_update(message.from_user.id, "warpath", version)
    except AdminError as exc:
        return await respond(message, f"❌ {escape(str(exc))}")
    await respond(message, f"✅ Версия {escape(version)} добавлена. Помечено «возможно устарело»: {changed}")


@router.message(Command("grant", "revoke"))
async def cmd_grant(message: Message, command: CommandObject, access_service: AccessService,
                    admin_service: AdminService) -> None:
    args = (command.args or "").split()
    subject_type = args[0] if args else None
    subject_id = _parse_id(args[1] if len(args) > 1 else None)
    if subject_type not in ("user", "chat") or subject_id is None:
        return await respond(message, "Использование: /grant &lt;user|chat&gt; &lt;id&gt; &lt;тариф&gt; [дней]\n"
                                      "/revoke &lt;user|chat&gt; &lt;id&gt;")
    from database.connection import transaction, utcnow_iso

    if command.command == "revoke":
        with transaction(access_service.conn):
            n = access_service.users.revoke_subscriptions(subject_type, subject_id, utcnow_iso())
            admin_service.log.log(message.from_user.id, "revoke", subject_type, subject_id, {"count": n})
        return await respond(message, f"Отозвано подписок: {n}")
    plan = args[2] if len(args) > 2 else ""
    days = _parse_id(args[3]) if len(args) > 3 else None
    try:
        access_service.grant(subject_type, subject_id, plan, days, message.from_user.id, source="test")
        with transaction(admin_service.conn):
            admin_service.log.log(message.from_user.id, "grant", subject_type, subject_id,
                                  {"plan": plan, "days": days, "source": "test"})
    except ValueError as exc:
        return await respond(message, f"❌ {escape(str(exc))}")
    period = f"на {days} дн." if days else "без срока"
    await respond(message, f"✅ Тестовая подписка {escape(plan)} для {subject_type} {subject_id} {period}. "
                           "Оплата не списывалась.")
