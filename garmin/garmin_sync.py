#!/usr/bin/env python3
"""
Garmin 睡眠自动同步 → SelfTend

从 Garmin Connect 拉取最近一晚的睡眠（入睡/起床时间），转成 CST，
POST 到 SelfTend 的导入接口（走 X-Import-Secret，source=garmin）。

设计要点：
- 只用已保存的 garth token（首次换 token 请先跑 garmin_login.py），本脚本不做交互式登录，
  适合 systemd 定时无人值守运行。
- SelfTend 的 SleepLog.date 口径是「起床那天」，所以日期取睡眠结束(end)时间戳的日期。
- 幂等：后端 import 接口对「同一自动记录且时间未变」会跳过，所以一天多次运行安全。
- 无睡眠数据（没戴表/还没同步）时正常退出(0)，不算失败——交给后面的定时点补。

用法：
    python garmin_sync.py                 # 同步最近一晚（默认今天，取不到回退昨天）
    python garmin_sync.py --date 2026-09-13
    python garmin_sync.py --dry-run       # 只拉取打印，不 POST
"""
import argparse
import os
import sys
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import requests

# 自动加载脚本同目录的 .env（本地测试免手动 source；服务器上 systemd 已注入，默认不覆盖已有变量）
try:
    from pathlib import Path

    from dotenv import load_dotenv

    load_dotenv(Path(__file__).with_name(".env"))
except ImportError:
    pass

try:
    from garminconnect import Garmin
except ImportError:
    print("缺少依赖：pip install -r requirements.txt", file=sys.stderr)
    sys.exit(2)

CST = ZoneInfo("Asia/Shanghai")

# Garmin 睡眠分数 → SelfTend 睡眠质量分级。
# 直接用 Garmin 返回的 qualifierKey 原生四档，不自己定阈值：
# 完全贴合 App 里显示的分级，Garmin 日后调整阈值也自动跟随。
QUALIFIER_TO_LEVEL = {
    "POOR": 1,
    "FAIR": 2,
    "GOOD": 3,
    "EXCELLENT": 4,
}

# 兜底：极少数情况下 qualifierKey 缺失，按 Garmin 官方公开阈值判断
SCORE_FALLBACK_BANDS = [(59, 1), (79, 2), (89, 3), (100, 4)]


def sleep_score_to_level(score: int, qualifier: str | None = None) -> int:
    if qualifier and qualifier.upper() in QUALIFIER_TO_LEVEL:
        return QUALIFIER_TO_LEVEL[qualifier.upper()]
    for upper, level in SCORE_FALLBACK_BANDS:
        if score <= upper:
            return level
    return 4


def env(key: str, default: str = "") -> str:
    return os.environ.get(key, default).strip()


def load_client(tokenstore: str) -> Garmin:
    """只从 token 目录恢复登录；失败即报错提示先跑 garmin_login.py。"""
    if not tokenstore or not os.path.isdir(tokenstore):
        print(f"❌ 未找到 token 目录 {tokenstore!r}，请先运行：python garmin_login.py", file=sys.stderr)
        sys.exit(3)
    is_cn = env("GARMIN_IS_CN").lower() in ("1", "true", "yes")
    garmin = Garmin(is_cn=is_cn)
    try:
        garmin.login(tokenstore)  # tokenstore 非空 → 从目录恢复 token（不触发密码登录）
    except Exception as e:  # token 过期/损坏
        print(f"❌ Garmin token 恢复失败（可能已过期）：{e}\n   请重新运行：python garmin_login.py", file=sys.stderr)
        sys.exit(3)
    return garmin


def fetch_sleep_dto(garmin: Garmin, cdate: str):
    """拉某天的睡眠，返回含有效 start/end 时间戳的 dailySleepDTO，否则 None。"""
    try:
        data = garmin.get_sleep_data(cdate)
    except Exception as e:
        print(f"⚠️  拉取 {cdate} 睡眠失败：{e}", file=sys.stderr)
        return None
    dto = (data or {}).get("dailySleepDTO") or {}
    if dto.get("sleepStartTimestampGMT") and dto.get("sleepEndTimestampGMT"):
        return dto
    return None


def to_cst(ms_gmt: int) -> datetime:
    return datetime.fromtimestamp(ms_gmt / 1000, tz=timezone.utc).astimezone(CST)


def fetch_sleep_score(garmin: Garmin, cdate: str):
    """返回当天睡眠分数 (value, qualifierKey)，无数据返回 (None, None)。"""
    try:
        dto = (garmin.get_sleep_data(cdate) or {}).get("dailySleepDTO") or {}
    except Exception as e:
        print(f"⚠️  拉取 {cdate} 睡眠分数失败：{e}", file=sys.stderr)
        return None, None
    overall = ((dto.get("sleepScores") or {}).get("overall") or {})
    return overall.get("value"), overall.get("qualifierKey")


def post_import(url: str, payload: dict, secret: str) -> bool:
    try:
        resp = requests.post(
            url,
            json=payload,
            headers={"X-Import-Secret": secret, "Content-Type": "application/json"},
            timeout=15,
        )
    except requests.RequestException as e:
        print(f"❌ POST 到 SelfTend 失败（{url}）：{e}", file=sys.stderr)
        return False
    if resp.status_code != 200:
        print(f"❌ SelfTend 返回 {resp.status_code}: {resp.text}", file=sys.stderr)
        return False
    print(f"✅ 已同步：{resp.json()}")
    return True


def sync_sleep(garmin, candidates, url, secret, dry_run) -> bool:
    dto = None
    for cdate in candidates:
        dto = fetch_sleep_dto(garmin, cdate)
        if dto:
            break
    if not dto:
        print(f"ℹ️  {candidates} 无睡眠数据（没戴表 / 还没同步到 Garmin 云），跳过。")
        return True

    start = to_cst(dto["sleepStartTimestampGMT"])
    end = to_cst(dto["sleepEndTimestampGMT"])
    payload = {
        "date": end.strftime("%Y-%m-%d"),  # SelfTend 口径：起床那天
        "sleep_time": start.strftime("%H:%M"),
        "wake_time": end.strftime("%H:%M"),
        "source": "garmin",
    }
    # Garmin 对「下一次睡眠」的建议时长（nextSleepNeed.actual，分钟）。
    # baseline 是个人基线，actual 是结合训练负荷/睡眠债后的实际建议，取 actual。
    # 传给后端存进 UserConfig，前端「今晚建议入睡」据此自动倒推，免手填。
    need = dto.get("nextSleepNeed") or {}
    need_minutes, need_date = need.get("actual"), need.get("calendarDate")
    if need_minutes and need_date:
        payload["sleep_need_minutes"] = int(need_minutes)
        payload["sleep_need_date"] = need_date

    print(f"🌙 Garmin 睡眠：{payload['date']} {payload['sleep_time']} → {payload['wake_time']}")
    if need_minutes and need_date:
        print(f"💤 Garmin 建议睡眠时长：{need_date} 需 {need_minutes} 分钟（{need_minutes / 60:.1f}h）")
    if dry_run:
        print("🧪 dry-run，不写入。payload=", payload)
        return True
    return post_import(url, payload, secret)


def sync_energy(garmin, cdate, url, secret, dry_run) -> bool:
    score, qualifier = fetch_sleep_score(garmin, cdate)
    if score is None:
        print(f"ℹ️  {cdate} 无睡眠分数，跳过能量同步。")
        return True

    level = sleep_score_to_level(score, qualifier)
    payload = {
        "date": cdate,
        "energy_level": level,
        "sleep_score": score,  # 原始分数一并存下，UI 直接展示
        "note": f"Garmin {qualifier}" if qualifier else "",
        "source": "garmin",
    }
    print(f"😴 Garmin 睡眠分数：{cdate} {score} 分{f'（{qualifier}）' if qualifier else ''} → 分级 {level}/4")
    if dry_run:
        print("🧪 dry-run，不写入。payload=", payload)
        return True
    return post_import(url, payload, secret)


def main() -> int:
    parser = argparse.ArgumentParser(description="Garmin 睡眠 + 睡眠分数同步到 SelfTend")
    parser.add_argument("--date", help="指定日期 YYYY-MM-DD（默认今天，睡眠取不到回退昨天）")
    parser.add_argument("--dry-run", action="store_true", help="只拉取打印，不写入")
    parser.add_argument(
        "--only", choices=["sleep", "energy"], help="只同步其中一项（默认两项都同步）"
    )
    args = parser.parse_args()

    sleep_url = env("SELFTEND_IMPORT_URL", "http://localhost:8080/api/sleep-logs/import")
    # 能量接口沿用同一 base，未单独配置时自动推导，老 .env 无需改动
    energy_url = env("SELFTEND_ENERGY_IMPORT_URL") or sleep_url.replace(
        "/sleep-logs/import", "/energy-logs/import"
    )
    secret = env("SLEEP_IMPORT_SECRET")
    tokenstore = env("GARMIN_TOKENSTORE", os.path.expanduser("~/.garminconnect"))
    if not secret and not args.dry_run:
        print("❌ 未配置 SLEEP_IMPORT_SECRET（需与后端 .env 一致）", file=sys.stderr)
        return 2

    garmin = load_client(tokenstore)

    today = datetime.now(CST).date()
    # 睡眠：指定则只查该天；否则先今天、取不到回退昨天（应对尚未同步 / 日期归属差异）
    if args.date:
        sleep_candidates = [args.date]
        energy_date = args.date
    else:
        sleep_candidates = [today.isoformat(), (today - timedelta(days=1)).isoformat()]
        energy_date = today.isoformat()

    ok = True
    if args.only != "energy":
        ok &= sync_sleep(garmin, sleep_candidates, sleep_url, secret, args.dry_run)
    if args.only != "sleep":
        ok &= sync_energy(garmin, energy_date, energy_url, secret, args.dry_run)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
