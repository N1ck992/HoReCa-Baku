import asyncio
import socket
from pathlib import Path

import aiohttp

from bot import start_health_server
from config import Settings
from manage import main as manage_main


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def test_health_endpoint(conn):
    port = free_port()
    s = Settings(bot_token="", admin_ids=frozenset(), database_path=Path(":memory:"), health_port=port)

    async def scenario():
        state = {"polling": False}
        runner = await start_health_server(s, conn, state)
        try:
            async with aiohttp.ClientSession() as http:
                async with http.get(f"http://127.0.0.1:{port}/health") as r:
                    assert r.status == 503  # опрос ещё не запущен
                state["polling"] = True
                async with http.get(f"http://127.0.0.1:{port}/health") as r:
                    assert r.status == 200
                    assert (await r.json()) == {"status": "ok", "db": True, "polling": True}
        finally:
            await runner.cleanup()

    asyncio.run(scenario())


def test_health_server_disabled_without_port(conn):
    s = Settings(bot_token="", admin_ids=frozenset(), database_path=Path(":memory:"))
    assert asyncio.run(start_health_server(s, conn, {})) is None


def test_manage_cli(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "cli.db"))
    assert manage_main(["init-db"]) == 0
    assert manage_main(["health"]) == 0
    assert manage_main(["load-demo"]) == 0
    assert "ПРИМЕНЕНО" in capsys.readouterr().out
