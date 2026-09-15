#!/usr/bin/env python3
"""
一次性：用「浏览器人工登录拿到的 service ticket」换取 OAuth token（佳明中国专用）。

为什么需要这个：
    garmin.cn 的登录页带 reCAPTCHA，纯脚本提交账号密码会被 401 拒（见 README）。
    但「ticket → OAuth token」这步走 connectapi.garmin.cn，是纯 API、没有验证码。
    所以由你在浏览器里人工登录（人过验证码）拿到 ticket，脚本只做后半段交换。

换到 token 后，garmin_sync.py 每天靠 token 拉数据（约一年内不用再登录）。

用法：
    1) 浏览器打开 SSO 登录页（见 README 的「佳明中国」一节），登录成功后
       页面会显示形如 {serviceUrl: ..., serviceTicket: 'ST-xxxxx-cas'}
    2) 立刻复制 ST- 开头那串，运行本脚本并粘贴（ticket 有效期很短，要快）
       python garmin_login_ticket.py
"""
import os
import sys

# 自动加载脚本同目录的 .env
try:
    from pathlib import Path

    from dotenv import load_dotenv

    load_dotenv(Path(__file__).with_name(".env"))
except ImportError:
    pass

try:
    from garminconnect import Garmin
    from garth import sso
except ImportError:
    print("缺少依赖：pip install -r requirements.txt", file=sys.stderr)
    sys.exit(2)


def main() -> int:
    tokenstore = os.environ.get(
        "GARMIN_TOKENSTORE", os.path.expanduser("~/.garminconnect")
    ).strip()
    is_cn = os.environ.get("GARMIN_IS_CN", "").strip().lower() in ("1", "true", "yes")

    ticket = (sys.argv[1] if len(sys.argv) > 1 else input("粘贴 serviceTicket (ST-...): ")).strip()
    # 容错：允许粘整段 'serviceTicket: ST-xxx' 或带引号
    ticket = ticket.replace("serviceTicket:", "").strip().strip("'\",")
    if not ticket.startswith("ST-"):
        print(f"❌ ticket 格式不对（应以 ST- 开头）：{ticket[:40]!r}", file=sys.stderr)
        return 2

    garmin = Garmin(is_cn=is_cn)
    client = garmin.garth
    print(f"域名: {client.domain}")

    try:
        oauth1 = sso.get_oauth1_token(ticket, client)
        print("✅ 已换到 OAuth1 token")
    except Exception as e:
        print(f"❌ ticket 换 OAuth1 失败（多半是 ticket 已过期，重新登录再拿一个）：{e}", file=sys.stderr)
        return 1

    try:
        oauth2 = sso.exchange(oauth1, client)
        print("✅ 已换到 OAuth2 token")
    except Exception as e:
        print(f"❌ OAuth2 交换失败：{e}", file=sys.stderr)
        return 1

    client.oauth1_token = oauth1
    client.oauth2_token = oauth2

    try:
        client.dump(tokenstore)
    except Exception as e:
        print(f"❌ 保存 token 失败：{e}", file=sys.stderr)
        return 1

    # 验证 token 真能调接口
    try:
        prof = client.connectapi("/userprofile-service/userprofile/profile")
        name = (prof or {}).get("displayName") or (prof or {}).get("fullName") or "(未知)"
        print(f"✅ token 可用，账号：{name}")
    except Exception as e:
        print(f"⚠️  token 已保存，但调接口验证失败：{e}", file=sys.stderr)

    print(f"✅ token 已保存到 {tokenstore}")
    print("   下一步验证拉取：python garmin_sync.py --dry-run")
    return 0


if __name__ == "__main__":
    sys.exit(main())
