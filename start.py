#!/usr/bin/env python3
"""FavoriteChat v3 — Termux launcher. Run: python start.py"""

import os, sys, subprocess, shutil, time, signal, re

ROOT = os.path.dirname(os.path.abspath(__file__))
ENV_FILE = os.path.join(ROOT, ".env")
ENV_EXAMPLE = os.path.join(ROOT, ".env.example")
DB_URL = "postgresql://fchat:fchat123@localhost:5432/favoritechat"

R="\033[0m"; B="\033[1m"; C="\033[96m"; G="\033[92m"; Y="\033[93m"; E="\033[91m"

def log(color, prefix, msg): print(f"{color}{B}[{prefix}]{R} {msg}")
def info(m): log(C, "INFO",  m)
def ok(m):   log(G, "OK",    m)
def warn(m): log(Y, "WARN",  m)
def err(m):  log(E, "ERROR", m)

def sh(cmd, **kw): return subprocess.run(cmd, shell=True, cwd=ROOT, **kw)
def out(cmd): return subprocess.check_output(cmd, shell=True, text=True, cwd=ROOT).strip()

def header():
    print(f"\n{C}{B}╔══════════════════════════════════════╗")
    print(f"║   ⚡ FavoriteChat v3.0  (Termux)    ║")
    print(f"╚══════════════════════════════════════╝{R}\n")

def check_deps():
    is_termux = shutil.which("pkg") is not None
    for tool, pkg, install in [
        ("node",  "nodejs",     "pkg install nodejs -y"),
        ("npm",   "nodejs",     "pkg install nodejs -y"),
        ("psql",  "postgresql", "pkg install postgresql -y"),
    ]:
        if shutil.which(tool):
            ok(f"{tool}: {out(tool + ' --version').splitlines()[0]}")
        elif is_termux:
            info(f"{tool} не найден — устанавливаю...")
            if sh(install).returncode != 0:
                err(f"Не удалось установить {pkg}"); sys.exit(1)
            ok(f"{tool} установлен")
        else:
            err(f"{tool} не найден. Установи его вручную."); sys.exit(1)

    # npm global: pnpm not needed anymore — just use npm
    pass

def ensure_postgres():
    pg_data = os.path.join(
        os.environ.get("PREFIX", "/data/data/com.termux/files/usr"),
        "var", "lib", "postgresql"
    )
    if not os.path.exists(os.path.join(pg_data, "PG_VERSION")):
        info("Инициализирую PostgreSQL кластер...")
        if subprocess.run(["initdb", "-D", pg_data]).returncode != 0:
            err("Не удалось инициализировать PostgreSQL"); sys.exit(1)

    if sh("pg_isready -q").returncode != 0:
        info("Запускаю PostgreSQL...")
        sh(f"pg_ctl -D {pg_data} start -l {pg_data}/pg.log")
        time.sleep(2)
        if sh("pg_isready -q").returncode != 0:
            err("PostgreSQL не запустился. Проверь логи."); sys.exit(1)
    ok("PostgreSQL: запущен")

    u = out("whoami")
    for sql in [
        "CREATE DATABASE favoritechat;",
        "CREATE USER fchat WITH PASSWORD 'fchat123';",
        "GRANT ALL PRIVILEGES ON DATABASE favoritechat TO fchat;",
        "ALTER DATABASE favoritechat OWNER TO fchat;",
    ]:
        subprocess.run(["psql", "-U", u, "-d", "postgres", "-c", sql],
                       capture_output=True)

def load_env():
    if not os.path.exists(ENV_FILE): return
    with open(ENV_FILE) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line: continue
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())

def setup_env():
    if not os.path.exists(ENV_FILE):
        if os.path.exists(ENV_EXAMPLE):
            shutil.copy(ENV_EXAMPLE, ENV_FILE)
            warn(".env создан из .env.example")
            warn(f"Заполни {ENV_FILE} и запусти снова.")
            sys.exit(0)
        else:
            err(".env не найден"); sys.exit(1)
    load_env()
    os.environ.setdefault("DATABASE_URL", DB_URL)

def write_env_key(key, value):
    with open(ENV_FILE, "r") as f: lines = f.readlines()
    found = False
    with open(ENV_FILE, "w") as f:
        for line in lines:
            if line.startswith(key + "="):
                f.write(f"{key}={value}\n"); found = True
            else:
                f.write(line)
        if not found: f.write(f"{key}={value}\n")

def mask(token):
    if len(token) <= 10: return "*" * len(token)
    return token[:6] + "..." + token[-4:]

def prompt_token():
    current = os.environ.get("MAIN_BOT_TOKEN", "").strip()
    print(f"\n{C}{B}╔════════════════════════════════════╗")
    print(f"║     Токен главного Telegram-бота   ║")
    print(f"╚════════════════════════════════════╝{R}")

    if current:
        print(f"  Текущий токен: {B}{mask(current)}{R}")
        print(f"  {C}[Enter]{R}      — использовать текущий")
        print(f"  {C}[токен]{R}      — заменить")
        print(f"  {C}[0]{R}          — запустить без бота")
        print()
        try:
            answer = input(f"{B}Выбор:{R} ").strip()
        except (EOFError, KeyboardInterrupt):
            answer = ""

        if answer == "0":
            err("Бот не будет запущен (нет токена). Выход."); sys.exit(0)
        elif answer == "":
            pass
        else:
            os.environ["MAIN_BOT_TOKEN"] = answer
            write_env_key("MAIN_BOT_TOKEN", answer)
            ok("Токен сохранён.")
    else:
        print(f"  {Y}Токен не задан.{R} Введи токен от @BotFather:")
        print(f"  Формат: {C}1234567890:ABCdef...{R}")
        print()
        try:
            token = input(f"{B}Токен:{R} ").strip()
        except (EOFError, KeyboardInterrupt):
            err("Токен не введён. Выход."); sys.exit(0)

        if not token:
            err("Токен пустой. Выход."); sys.exit(0)

        os.environ["MAIN_BOT_TOKEN"] = token
        write_env_key("MAIN_BOT_TOKEN", token)
        ok("Токен сохранён.")

def install_deps():
    nm = os.path.join(ROOT, "node_modules")
    if not os.path.exists(nm):
        info("Устанавливаю зависимости npm...")
        if sh("npm install").returncode != 0:
            err("npm install завершился с ошибкой"); sys.exit(1)
        ok("Зависимости установлены")
    else:
        ok("node_modules: есть")

def push_db():
    info("Синхронизирую схему БД...")
    env = os.environ.copy()
    env["DATABASE_URL"] = os.environ.get("DATABASE_URL", DB_URL)
    r = subprocess.run("npx drizzle-kit push", shell=True, cwd=ROOT, env=env)
    if r.returncode != 0:
        warn("drizzle-kit push завершился с ошибкой — возможно БД уже актуальна")
    else:
        ok("Схема БД синхронизирована")

def prompt_owner_id():
    current = os.environ.get("OWNER_TELEGRAM_ID", "").strip()
    if current and current.isdigit():
        ok(f"OWNER_TELEGRAM_ID: {mask(current)}")
        return

    print(f"\n{C}{B}Telegram ID владельца{R}")
    print(f"  Узнай свой ID: напиши @userinfobot в Telegram")
    print(f"  {C}[Enter]{R} — пропустить (бот будет доступен всем!)")
    print()
    try:
        val = input(f"{B}Твой Telegram ID:{R} ").strip()
    except (EOFError, KeyboardInterrupt):
        val = ""

    if val and val.isdigit():
        os.environ["OWNER_TELEGRAM_ID"] = val
        write_env_key("OWNER_TELEGRAM_ID", val)
        ok(f"Owner ID сохранён: {val}")
    else:
        warn("OWNER_TELEGRAM_ID не задан — бот доступен всем кто найдёт его.")

def run():
    env = os.environ.copy()
    env["NODE_ENV"] = "development"
    info("Запускаю FavoriteChat v3.0...")
    print(f"\n{G}{B}  Ctrl+C — остановить{R}\n")
    try:
        subprocess.run("npx tsx src/index.ts", shell=True, cwd=ROOT, env=env)
    except KeyboardInterrupt:
        print(f"\n{Y}Остановлено.{R}")

def main():
    header()
    check_deps()
    setup_env()
    ensure_postgres()
    prompt_token()
    prompt_owner_id()
    install_deps()
    push_db()
    run()

if __name__ == "__main__":
    main()
