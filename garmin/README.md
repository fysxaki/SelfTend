# Garmin 睡眠自动同步

每天定时从 Garmin Connect 拉取最近一晚的睡眠，自动写入 SelfTend，免去每天早上手填。

## 原理

```
systemd timer（工作日10:00 / 周末15:00 / 每天21:00 兜底）
  → garmin_sync.py
      · 用已保存的 garth token 登录（首次用账号密码换 token，之后复用 ~1 年）
      · 拉最近一晚睡眠 start/end → 转成 CST 的 入睡/起床 时间
  → POST http://localhost:8080/api/sleep-logs/import  (X-Import-Secret, source=garmin)
      · 后端算时长/奖惩；手动记录永远优先，不被覆盖；同一自动记录时间没变则幂等跳过
```

Garmin 登录没有可用的 Go 库，所以这层用 Python（[python-garminconnect](https://github.com/cyberjunky/python-garminconnect)）。

## 首次启用（服务器上，一次性）

```bash
cd /opt/selftend/garmin

# 1. 配置
cp .env.example .env
vim .env          # 填 GARMIN_EMAIL / GARMIN_PASSWORD；SLEEP_IMPORT_SECRET 必须与 backend/.env 一致

# 2. 装依赖（部署脚本会自动做，这里手动也行）
python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt

# 3. 换 token（开了两步验证会提示输验证码；换到后 token 存进 tokens/，之后无需密码）
./.venv/bin/python garmin_login.py

# 4. 验证拉取（不写库）
./.venv/bin/python garmin_sync.py --dry-run

# 5. 跑一次真同步 + 注册定时器（跑一次 deploy 即可，或手动）
systemctl start selftend-garmin-sync
journalctl -u selftend-garmin-sync -n 20
```

配好 `.env` 后，`bash deploy/2_deploy.sh` 会自动建 venv、装依赖、注册并启用定时器。

## 常用命令

```bash
# 手动触发一次
systemctl start selftend-garmin-sync

# 看日志 / 下次触发时间
journalctl -u selftend-garmin-sync -n 30
systemctl list-timers selftend-garmin-sync

# 只拉取不写入（排查用）
./.venv/bin/python garmin_sync.py --dry-run
# 指定某天
./.venv/bin/python garmin_sync.py --date 2026-09-13 --dry-run
```

## 注意

- **佳明中国账号**：Garmin 中国 App（connect.garmin.cn）注册的账号，在 `.env` 设 `GARMIN_IS_CN=true`；国际版留 false。
- **两步验证**：`garmin_login.py` 若提示 `MFA code:`，输入手机/邮箱收到的验证码即可（一次性，换到 token 后不再需要）。
- **手动优先**：你在 App 里手填/编辑过的当天记录，同步永不覆盖。
- **幂等**：一天多次触发安全，时间没变会跳过，不会反复退/发积分。
- **token 过期**（约 1 年）：`garmin_sync.py` 会报错提示，重跑 `garmin_login.py` 即可。
- **日期口径**：SelfTend 的日期是「起床那天」，脚本按睡眠结束时间取。首次用 `--dry-run` 核对一下拉到的日期/时间对不对。
- **时区**：systemd 定时器按系统时区，服务器需为 `Asia/Shanghai`（`1_setup.sh` 已设置）。
- **安全**：`.env` 和 `tokens/` 已被 gitignore，绝不提交。
