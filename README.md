# SelfTend

个人成长游戏化系统。用任务积分、睡眠记录、每日复盘驱动自律习惯。

**技术栈**：React + TypeScript + Ant Design（前端）/ Go + Gin + SQLite（后端）

---

## 本地开发

### 前置要求

- Node.js 18+
- Go 1.22+
- （可选）[Air](https://github.com/air-verse/air) —— Go 热重载工具

### 启动后端

```bash
cd backend

# 首次运行：下载依赖
go mod download

# 启动（监听 :8080，首次运行会自动创建 data.db）
go run .
```

使用 Air 实现热重载（修改 Go 文件自动重启）：

```bash
# 安装 Air（只需一次）
go install github.com/air-verse/air@latest

cd backend
air
```

#### 环境变量

后端通过环境变量读取配置，本地开发在 `backend/` 目录下新建 `.env` 文件：

```env
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxx
```

> 不配置 `DEEPSEEK_API_KEY` 的话，除复盘 AI 对话外其他功能均正常使用。

### 启动前端

```bash
cd frontend

# 首次运行：安装依赖
npm install

# 启动开发服务器（默认 http://localhost:5173）
npm run dev
```

前端开发时请求会代理到后端 `:8080`，见 `frontend/vite.config.ts`。

---

## 生产部署（Linux 服务器）

部署脚本和配置文件均在 `deploy/` 目录。

### 1. 构建

```bash
# 构建前端静态文件
cd frontend && npm install && npm run build

# 编译后端二进制
cd backend && go build -o selftend .
```

### 2. 上传文件

```bash
# 将编译产物上传到服务器（路径见 nginx.conf / selftend.service）
scp -r frontend/dist root@<服务器IP>:/opt/selftend/frontend/
scp backend/selftend root@<服务器IP>:/opt/selftend/backend/
```

### 3. 服务器配置

```bash
# 安装 nginx（如未安装）
apt install nginx -y

# 复制 nginx 配置
cp deploy/nginx.conf /etc/nginx/sites-enabled/selftend.conf
nginx -t && systemctl reload nginx

# 创建后端环境变量文件
echo "DEEPSEEK_API_KEY=sk-xxx" > /opt/selftend/backend/.env

# 注册并启动后端系统服务
cp deploy/selftend.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable selftend
systemctl start selftend

# 查看运行状态
systemctl status selftend
```

### 常用运维命令

```bash
# 查看后端日志
journalctl -u selftend -f

# 重启后端
systemctl restart selftend

# 重新部署后端（上传新二进制后）
systemctl restart selftend

# 重新部署前端（上传新 dist 后，nginx 无需重启）
# 刷新浏览器即可
```

---

## 目录结构

```
SelfTend/
├── backend/
│   ├── handler/       # 路由处理器（任务、睡眠、复盘等）
│   ├── model/         # 数据库模型
│   ├── middleware/    # 中间件
│   ├── main.go        # 入口，路由注册
│   ├── data.db        # SQLite 数据库（运行后自动生成）
│   └── .env           # 本地环境变量（不提交 git）
├── frontend/
│   ├── src/
│   │   ├── pages/     # 页面组件（任务、睡眠、复盘、奖励…）
│   │   ├── api/       # 接口封装
│   │   ├── stores/    # Zustand 状态
│   │   └── types/     # TypeScript 类型定义
│   └── dist/          # 构建产物（部署用）
└── deploy/            # 服务器配置文件
```
