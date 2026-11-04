# Развёртывание

Бот работает через long polling: нужен **постоянно работающий процесс** и **постоянное
хранилище** для файла SQLite.

## Выбор хостинга (проверено 01.11.2026)

| Вариант | Постоянный процесс | Сохранность SQLite | Вывод |
|---|---|---|---|
| **Railway (Hobby, ~$5/мес)** + Volume | да | да, на Volume (до 5 ГБ на Hobby) | ✅ рекомендуется |
| VPS (любой) + systemd | да | да, локальный диск | ✅ надёжно и дёшево, но нужна настройка сервера |
| Render Free | засыпает без трафика | **нет**: файловая система эфемерна, диски только на платных инстансах | ❌ не подходит для SQLite |
| Render платный (Background Worker) + Persistent Disk | да | да, только в пути монтирования диска | ✅ подходит, дороже |

Источники: [Render — Persistent Disks](https://render.com/docs/disks),
[Railway — Volumes](https://docs.railway.com/reference/volumes),
[Railway — Pricing](https://docs.railway.com/pricing/plans). Цены меняются — сверяйтесь
с актуальной страницей перед оплатой.

⚠️ HoReCa-бот в этом репозитории работает на бесплатном Render. Для Warpath-бота так делать
нельзя: при каждом деплое или перезапуске база SQLite будет теряться.

## Railway (рекомендуемый путь, всё из браузера/телефона)

1. railway.com → New Project → Deploy from GitHub repo → выберите этот репозиторий.
2. В настройках сервиса: **Settings → Root Directory** = `warpath_bot`.
   Railway найдёт `Dockerfile` и соберёт образ.
3. **Volume**: правый клик по сервису (или Command Palette) → *Attach Volume*,
   Mount path = `/data`.
4. **Variables**:
   - `BOT_TOKEN` — токен от @BotFather
   - `ADMIN_IDS` — ваш Telegram ID (узнать: @userinfobot)
   - `DATABASE_PATH` = `/data/warpath.db` (уже задано в Dockerfile, можно не указывать)
   - `SHOW_TEST_DATA` = `false` (для временной проверки интерфейса — `true`)
5. Deploy. В логах должно появиться `Бот @<имя> запущен (polling)`.
6. Проверка: напишите боту `/start`, админом — `/health`.

Важно: у бота должен работать **ровно один** экземпляр (не включайте реплики) —
два процесса polling с одним токеном конфликтуют.

**Повторное развёртывание**: push в ветку, подключённую к Railway, запускает деплой
автоматически; вручную — кнопка *Redeploy*. База на Volume сохраняется, миграции схемы
применяются при старте автоматически и не удаляют данные.

## VPS (Ubuntu/Debian)

```bash
sudo adduser --system --group warpath
sudo mkdir -p /opt/warpath && sudo chown warpath:warpath /opt/warpath
sudo -u warpath git clone https://github.com/<owner>/HoReCa-Baku.git /opt/warpath/HoReCa-Baku
sudo -u warpath python3 -m venv /opt/warpath/venv
sudo -u warpath /opt/warpath/venv/bin/pip install -r /opt/warpath/HoReCa-Baku/warpath_bot/requirements.txt
sudo -u warpath tee /opt/warpath/warpath.env <<'EOF'
BOT_TOKEN=...
ADMIN_IDS=...
DATABASE_PATH=/opt/warpath/data/warpath.db
EOF
sudo chmod 600 /opt/warpath/warpath.env
sudo cp /opt/warpath/HoReCa-Baku/warpath_bot/deploy/warpath-bot.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now warpath-bot
journalctl -u warpath-bot -f
```

Обновление: `git pull`, `pip install -r requirements.txt`, `sudo systemctl restart warpath-bot`.

Резервная копия базы (без остановки бота):
`sqlite3 /opt/warpath/data/warpath.db ".backup '/opt/warpath/backup-$(date +%F).db'"`.

## Health-check

Если платформа требует HTTP-порт (например, Render Web Service), задайте `HEALTH_PORT`
(на Render — `HEALTH_PORT=10000` или значение `PORT`). Эндпоинт `/health` отвечает
`200` при работающем polling и доступной базе, иначе `503`.

## Ошибки запуска

| Код выхода | Причина | Что делать |
|---|---|---|
| 2 | нет/неверный формат `BOT_TOKEN`, неверный `ADMIN_IDS` | проверить переменные |
| 3 | Telegram отклонил токен | перевыпустить токен в @BotFather |
| 4 | нет связи с api.telegram.org | проверить сеть хостинга; платформа перезапустит процесс |
