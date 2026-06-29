# SelfTend

个人成长游戏化系统。用任务积分、睡眠记录、每日复盘驱动自律习惯。

**技术栈**：React + TypeScript + Ant Design（前端）/ Go + Gin + SQLite（后端）

> 🚀 **部署 / 更新一行命令**（本地 `git push` 之后）：
> ```bash
> ssh root@<服务器IP> 'cd /opt/selftend && bash deploy/2_deploy.sh'
> ```
> 自动拉代码 + 构建前后端 + 重载 Nginx + 重启服务。详见 [生产部署](#生产部署linux-服务器)。

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

部署全靠 `deploy/` 目录下两个脚本，服务器直接 `git pull` 取代码，**不用手动 scp / cp 配置**。

### 日常更新（最常用）

本地改完代码 `git push` 后，一行命令完成更新：

```bash
ssh root@<服务器IP> 'cd /opt/selftend && bash deploy/2_deploy.sh'
```

`2_deploy.sh` 会自动：`git pull` → 构建前端 → 编译后端 → 更新 Nginx 配置并 reload → 重启 systemd 服务，最后校验服务是否起来。

### 首次部署（每台新服务器只需一次）

```bash
# 1. SSH 登录服务器，初始化环境（装 Go / Node / Nginx / certbot 等）
ssh root@<服务器IP>
bash 1_setup.sh                       # 脚本在 deploy/，或先 scp 过去

# 2. 配置 DNS：把域名解析到本机 IP

# 3. 拉代码到 /opt/selftend
cd /opt/selftend && git clone https://github.com/fysxaki/SelfTend.git .

# 4. 写后端环境变量
echo "DEEPSEEK_API_KEY=sk-xxx" > backend/.env

# 5. 首次部署（HTTP）
bash deploy/2_deploy.sh

# 6. 申请 SSL 证书（certbot 自动改 Nginx + 自动续期）
certbot --nginx -d <你的域名>
```

### 常用运维命令

```bash
# 查看后端实时日志
journalctl -u selftend -f

# 重启 / 查看后端服务
systemctl restart selftend
systemctl status selftend
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

---

## 依赖维护

### chinese-days（节假日 / 调休判断）

睡眠模块的「今晚建议入睡」按**明天是否工作日**分两套逻辑（工作日 07:35 起床倒推，休息日按习惯窗口）。
是否工作日由 [`chinese-days`](https://www.npmjs.com/package/chinese-days) 的 `isWorkday()` 判断——它基于国务院每年发布的放假安排，**已包含调休补班**，所以「因补假期导致周末上班」这种预期外工作日也能正确识别（例：2026-02-14 周六春节补班 → 判为工作日）。

⚠️ **每年底需要升级一次**：这类库的假期数据按年硬编码。国务院通常每年 11~12 月发布次年放假安排，届时 `chinese-days` 会发新版本。**每年 12 月 / 次年 1 月初**记得跑一次：

```bash
cd frontend
npm update chinese-days     # 拿到次年的放假 + 调休补班数据
```

不升级的话，跨年后新一年的节假日 / 补班会判断错误（退化成「仅按周末判断」）。
