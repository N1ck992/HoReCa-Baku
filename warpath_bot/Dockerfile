# Образ для Railway / Fly.io / VPS. База SQLite хранится в /data —
# этот путь ОБЯЗАТЕЛЬНО должен быть постоянным томом (volume).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DATABASE_PATH=/data/warpath.db

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

CMD ["python", "bot.py"]
