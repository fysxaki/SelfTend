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

echo ""
echo "🎉 部署完成！"
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "YOUR_SERVER_IP")
echo "   访问地址：http://$SERVER_IP"
