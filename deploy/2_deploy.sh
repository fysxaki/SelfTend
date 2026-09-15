#!/bin/bash
# ============================================================
# SelfTend 部署/更新脚本
# 用法：cd /opt/selftend && bash deploy/2_deploy.sh
# 每次代码更新后运行此脚本即可
# ============================================================
set -e

export PATH=$PATH:/usr/local/go/bin
APP_DIR=/opt/selftend

cd "$APP_DIR"

echo "📥 拉取最新代码..."
git pull

# ── 构建前端 ────────────────────────────────────────────────
echo "🔨 构建前端..."
cd "$APP_DIR/frontend"
npm install --silent
npm run build
echo "✅ 前端构建完成 → frontend/dist/"

# ── 构建后端 ────────────────────────────────────────────────
echo "🔨 构建后端..."
cd "$APP_DIR/backend"
go build -o selftend .
echo "✅ 后端构建完成 → backend/selftend"

# ── 配置 Nginx ──────────────────────────────────────────────
echo "⚙️  更新 Nginx 配置..."
cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/selftend
ln -sf /etc/nginx/sites-available/selftend /etc/nginx/sites-enabled/selftend
# 删掉默认站点避免冲突
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
echo "✅ Nginx 已更新"

# ── 配置并重启 systemd 服务 ────────────────────────────────
echo "⚙️  更新后端服务..."
cp "$APP_DIR/deploy/selftend.service" /etc/systemd/system/selftend.service
systemctl daemon-reload
systemctl enable selftend
systemctl restart selftend
sleep 1

if systemctl is-active --quiet selftend; then
  echo "✅ 后端服务运行中"
else
  echo "❌ 后端服务启动失败，查看日志："
  journalctl -u selftend -n 20
  exit 1
fi

# ── Garmin 睡眠自动同步（仅当 garmin/.env 已配置才安装）────────────────
if [ -f "$APP_DIR/garmin/.env" ]; then
  echo "⚙️  配置 Garmin 睡眠同步..."
  cd "$APP_DIR/garmin"
  # 老服务器可能没装 venv 支持（早期 1_setup.sh 未包含），缺了就自动补
  if ! python3 -c "import ensurepip" >/dev/null 2>&1; then
    echo "   python3-venv 缺失，自动安装..."
    PYVER=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
    apt update -qq && apt install -y "python${PYVER}-venv" python3-pip || apt install -y python3-venv python3-pip
  fi
  # 幂等：venv 不存在或损坏（缺 pip）就重建
  if [ ! -x .venv/bin/pip ]; then
    rm -rf .venv
    python3 -m venv .venv
  fi
  ./.venv/bin/pip install -q --upgrade pip
  ./.venv/bin/pip install -q -r requirements.txt
  # 注册 timer（service 由 timer 触发，无需 enable service 本身）
  cp "$APP_DIR/deploy/selftend-garmin-sync.service" /etc/systemd/system/
  cp "$APP_DIR/deploy/selftend-garmin-sync.timer" /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable --now selftend-garmin-sync.timer
  echo "✅ Garmin 同步定时器已启用（工作日10:00 / 周末15:00 / 每天21:00）"
  echo "   首次需换 token：cd $APP_DIR/garmin && ./.venv/bin/python garmin_login.py"
  echo "   手动测试一次：  systemctl start selftend-garmin-sync && journalctl -u selftend-garmin-sync -n 20"
else
  echo "⏭️  未检测到 garmin/.env，跳过 Garmin 同步（如需启用见 garmin/README.md）"
fi

echo ""
echo "🎉 部署完成！"
echo "   访问地址：https://zzz.fysxq.lat"
echo ""
echo "💡 如果是第一次部署，还需要申请 SSL 证书："
echo "   certbot --nginx -d zzz.fysxq.lat"
