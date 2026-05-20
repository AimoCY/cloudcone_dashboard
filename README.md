# Cloudcone VPS 监控看板

> 自建的轻量 VPS 监控系统：Go agent 采集指标，TypeScript 看板实时展示、保留历史、推送告警。

每台 VPS 上跑一个轻量 Go agent，采集 CPU / 内存 / 磁盘 / 网络 / 进程等指标，通过 HTTPS
推送到一个 TypeScript 写的 Dashboard。Dashboard 用 SQLite 保留 7 天历史、提供实时图表，
并在指标超阈值时页面内告警 + 推送 Telegram。

## 特性

- **实时指标**：CPU（总体 / 每核）、内存、Swap、磁盘容量与 I/O、网络速率、负载、运行时间
- **Top 进程**：按 CPU / 内存排序的进程列表
- **月流量统计**：按账单周期累计出 / 入流量，对照套餐配额
- **历史趋势**：SQLite 保留 7 天，支持 1h / 6h / 24h / 7d 时间范围切换
- **告警**：超阈值时卡片变红 + Telegram 推送（2 样本迟滞防抖），agent 离线检测
- **轻量部署**：agent 是单个静态二进制；Dashboard 是单个 Node 进程

## 架构

```
每台 VPS:  agent (Go) ──HTTPS POST /ingest──▶  Dashboard (Node + Hono)
                                                ├─ SQLite（7 天历史）
                                                ├─ REST API + 密码登录
                                                ├─ 告警引擎 → Telegram
                                                └─ 托管前端（React）
       浏览器 ──────────HTTPS───────────────▶  Dashboard
```

通信方向单一：agent 主动推送，被监控的 VPS 无需开放任何入站端口。

## 目录结构

- `agent/` — Go 指标采集器（gopsutil 采集 + 月流量统计 + 带缓冲的推送）
- `dashboard/server/` — Hono API + 数据接收 + 告警引擎 + SQLite
- `dashboard/web/` — Vite + React 前端（uPlot 图表）
- `deploy/` — systemd 单元、nginx 配置、安装脚本
- `CONTRACT.md` — agent → Dashboard 的上报数据契约

## 构建

Agent（交叉编译 Linux x86-64）：

```bash
cd agent && GOOS=linux GOARCH=amd64 go build -o vps-agent .
```

Dashboard：

```bash
cd dashboard && npm install && npm run build:web
```

## 部署

### Dashboard

1. 把 `dashboard/` 拷到服务器（不含 `node_modules/`），在服务器上执行 `npm install`。
2. 基于 `deploy/config-samples/dashboard.config.json` 创建配置文件：
   - 密码哈希：`node -e 'console.log(require("bcryptjs").hashSync(process.argv[1],10))' '你的密码'`
   - 会话密钥：`openssl rand -hex 32`
3. 安装 systemd 服务：`deploy/vps-dashboard.service`。
4. 用 nginx 反向代理并配置 HTTPS：参考 `deploy/nginx-monitor.conf`。

### Agent —— 一键安装

在每台要监控的 VPS 上执行（替换 `TOKEN` 与 `DASHBOARD_URL`）：

```bash
curl -fsSL https://raw.githubusercontent.com/AimoCY/cloudcone_dashboard/main/deploy/install-agent-remote.sh \
  | sudo VPS_ID=vps-b TOKEN=你的token DASHBOARD_URL=https://你的看板域名:9443/ingest bash
```

脚本会自动下载 agent 二进制（仓库 `bin/` 内的预编译 linux/amd64 版本）、创建专用系统
用户、写入配置、安装并启动 systemd 服务。`VPS_ID` 需与 Dashboard 配置里 `agents[]` 的
某个 `id` 对应。

## 测试

```bash
cd agent && go test ./...
cd dashboard && npm test
```

## 许可证

[MIT](LICENSE)
