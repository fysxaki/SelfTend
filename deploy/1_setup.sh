#!/bin/bash
# ============================================================
# SelfTend 服务器初始化脚本（只需执行一次）
# 用法：ssh root@你的IP，然后 bash 1_setup.sh
# ============================================================
set -e

echo "📦 更新系统..."
apt update && apt upgrade -y

echo "📦 安装基础工具..."
apt install -y git curl wget gcc nginx

echo "📦 安装 Go 1.22..."
wget -q https://go.dev/dl/go1.22.5.linux-amd64.tar.gz -O /tmp/go.tar.gz
rm -rf /usr/local/go
tar -C /usr/local -xzf /tmp/go.tar.gz
rm /tmp/go.tar.gz

# 写入 PATH，所有用户生效
cat >> /etc/profile.d/go.sh << 'EOF'
export PATH=$PATH:/usr/local/go/bin
EOF
export PATH=$PATH:/usr/local/go/bin
echo "✅ Go 版本：$(go version)"

echo "📦 安装 Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
echo "✅ Node 版本：$(node -v)"

echo "📁 创建应用目录..."
mkdir -p /opt/selftend

echo ""
echo "🎉 服务器初始化完成！"
echo ""
echo "下一步："
echo "  cd /opt/selftend"
echo "  git clone https://github.com/你的用户名/SelfTend.git ."
echo "  bash deploy/2_deploy.sh"
