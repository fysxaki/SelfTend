#!/usr/bin/env python3
"""
一次性：用 Garmin 账号密码登录，把 token 存到 GARMIN_TOKENSTORE。
之后 garmin_sync.py 复用 token（有效约 1 年），无需再输密码。

- 没开两步验证：直接登录换 token。
- 开了两步验证(MFA)：会提示 "MFA code:"，输入手机/邮箱收到的验证码即可。
- 佳明中国账号：在 .env 里设 GARMIN_IS_CN=true。

用法：
    python garmin_login.py     # 账号密码可写在 .env（GARMIN_EMAIL/GARMIN_PASSWORD）或运行时输入
"""
import getpass
import os
import sys

# 自动加载脚本同目录的 .env（本地测试免手动 source）
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


def main() -> int:
    tokenstore = os.environ.get("GARMIN_TOKENSTORE", os.path.expanduser("~/.garminconnect")).strip()
    is_cn = os.environ.get("GARMIN_IS_CN", "").strip().lower() in ("1", "true", "yes")
    email = os.environ.get("GARMIN_EMAIL", "").strip() or input("Garmin 邮箱: ").strip()
    password = os.environ.get("GARMIN_PASSWORD", "").strip() or getpass.getpass("Garmin 密码: ")

    # 显式传 prompt_mfa（库默认是 None，开了两步验证会因 None() 崩）；没开 MFA 则永不调用
    garmin = Garmin(
        email=email,
        password=password,
        is_cn=is_cn,
        prompt_mfa=lambda: input("Garmin 两步验证码: ").strip(),
    )
    try:
        garmin.login()  # tokenstore=None → 全新登录换 token
    except Exception as e:
        print(f"❌ 登录失败：{e}", file=sys.stderr)
        return 1

    try:
        # Client.dump 写 oauth1_token.json / oauth2_token.json，sync 端 login(tokenstore) 读回
        garmin.garth.dump(tokenstore)
    except Exception as e:
        print(f"❌ 保存 token 失败：{e}", file=sys.stderr)
        return 1

    print(f"✅ 登录成功（{garmin.full_name}），token 已保存到 {tokenstore}")
    print("   验证拉取：python garmin_sync.py --dry-run")
    return 0


if __name__ == "__main__":
    sys.exit(main())
