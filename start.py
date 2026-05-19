#!/usr/bin/env python3
"""
FavoriteChat — скрипт запуска для Termux / Linux
Использование: python start.py
"""

import os
import sys
import subprocess
import shutil
import time
import signal
import threading

ROOT = os.path.dirname(os.path.abspath(__file__))
ENV_FILE = os.path.join(ROOT, ".env")
ENV_EXAMPLE = os.path.join(ROOT, ".env.example")

CYAN  = "\033[96m"
GREEN = "\033[92m"
YELLOW= "\033[93m"
RED   = "\033[91m"
BOLD  = "\033[1m"
RESET = "\033[0m"

def log(color, prefix, msg):
    print(f"{color}{BOLD}[{prefix}]{RESET} {msg}")

def info(msg):  log(CYAN,   "INFO",  msg)
def ok(msg):    log(GREEN,  "OK",    msg)
def warn(msg):  log(YELLOW, "WARN",  msg)
def err(msg):   log(RED,    "ERROR", msg)

def run(cmd, **kwargs):
    return subprocess.run(cmd, shell=True, cwd=ROOT, **kwargs)

def require(tool, hint=""):
    if not shutil.which(tool):
        err(f"'{tool}' не найден. {hint}")
        sys.exit(1)

def load_env():
    """Загружает .env в os.environ"""
    if not os.path.exists(ENV_FILE):
        return
    with open(ENV_FILE) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())

def setup_env():
    if not os.path.exists(ENV_FILE):
        if os.path.exists(ENV_EXAMPLE):
            import shutil as _sh
            _sh.copy(ENV_EXAMPLE, ENV_FILE)
            warn(".env не найден — создан из .env.example")
            warn(f"Отредактируй {ENV_FILE} и запусти снова.")
            sys.exit(0)
        else:
            err(".env не найден и .env.example тоже отсутствует.")
            sys.exit(1)
    load_env()

def check_db():
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        err("DATABASE_URL не задан в .env")
        sys.exit(1)

def install_deps():
    info("Установка зависимостей (pnpm install)...")
    r = run("pnpm install --frozen-lockfile 2>&1 || pnpm install")
    if r.returncode != 0:
        err("pnpm install завершился с ошибкой")
        sys.exit(1)
    ok("Зависимости установлены")

def push_db():
    info("Применение схемы БД (drizzle push)...")
    r = run("pnpm --filter @workspace/db run push")
    if r.returncode != 0:
        warn("DB push завершился с ошибкой — возможно, схема уже актуальна")
    else:
        ok("Схема БД применена")

def build_api():
    info("Сборка API-сервера...")
    r = run("pnpm --filter @workspace/api-server run build")
    if r.returncode != 0:
        err("Сборка API завершилась с ошибкой")
        sys.exit(1)
    ok("API собран")

def build_dashboard():
    info("Сборка дашборда...")
    env = os.environ.copy()
    env["BASE_PATH"] = "/"
    env.setdefault("PORT", "3000")
    r = subprocess.run(
        "pnpm --filter @workspace/dashboard run build",
        shell=True, cwd=ROOT, env=env
    )
    if r.returncode != 0:
        warn("Сборка дашборда завершилась с ошибкой — дашборд может не работать")
    else:
        ok("Дашборд собран")

processes = []

def start_api():
    port = os.environ.get("PORT", "5000")
    info(f"Запуск API-сервера на порту {port}...")
    env = os.environ.copy()
    env["PORT"] = port
    p = subprocess.Popen(
        "node --enable-source-maps artifacts/api-server/dist/index.mjs",
        shell=True, cwd=ROOT, env=env
    )
    processes.append(p)
    return p

def start_dashboard():
    port = os.environ.get("DASHBOARD_PORT", "3000")
    info(f"Запуск дашборда на порту {port} (vite preview)...")
    env = os.environ.copy()
    env["PORT"] = port
    env["BASE_PATH"] = "/"
    p = subprocess.Popen(
        "pnpm --filter @workspace/dashboard run preview",
        shell=True, cwd=ROOT, env=env
    )
    processes.append(p)
    return p

def shutdown(sig=None, frame=None):
    print()
    warn("Завершение работы...")
    for p in processes:
        try:
            p.terminate()
        except Exception:
            pass
    time.sleep(1)
    for p in processes:
        try:
            p.kill()
        except Exception:
            pass
    sys.exit(0)

def watch(proc, name):
    proc.wait()
    if proc.returncode not in (0, -15, -9):
        err(f"{name} завершился с кодом {proc.returncode}")

def main():
    print(f"\n{BOLD}{CYAN}╔══════════════════════════════╗")
    print(f"║      FavoriteChat Start      ║")
    print(f"╚══════════════════════════════╝{RESET}\n")

    require("node", "Установи Node.js: pkg install nodejs")
    require("pnpm", "Установи pnpm: npm install -g pnpm")

    setup_env()
    check_db()

    steps = [
        ("Установка зависимостей", install_deps),
        ("Схема БД",               push_db),
        ("Сборка API",             build_api),
        ("Сборка дашборда",        build_dashboard),
    ]

    for label, fn in steps:
        info(f"── {label}...")
        fn()

    signal.signal(signal.SIGINT,  shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    api_port = os.environ.get("PORT", "5000")
    dash_port = os.environ.get("DASHBOARD_PORT", "3000")

    api_proc  = start_api()
    dash_proc = start_dashboard()

    time.sleep(2)

    print()
    ok("══════════════════════════════════")
    ok(f"  API-сервер:  http://localhost:{api_port}/api/healthz")
    ok(f"  Дашборд:     http://localhost:{dash_port}/")
    ok("══════════════════════════════════")
    if not os.environ.get("PUBLIC_URL"):
        warn("PUBLIC_URL не задан — Telegram вебхуки не будут регистрироваться автоматически.")
        warn("Для Termux используй ngrok: ngrok http " + api_port)
        warn("Затем добавь PUBLIC_URL=https://xxxx.ngrok-free.app в .env")
    print(f"\n{CYAN}Нажми Ctrl+C для остановки{RESET}\n")

    threading.Thread(target=watch, args=(api_proc,  "API"), daemon=True).start()
    threading.Thread(target=watch, args=(dash_proc, "Dashboard"), daemon=True).start()

    try:
        api_proc.wait()
    except KeyboardInterrupt:
        shutdown()

if __name__ == "__main__":
    main()
