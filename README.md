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
- **多用户隔离**：管理员查看全部 VPS，普通用户只能访问分配给自己的 VPS、告警和历史数据
- **邀请码注册**：管理员生成一次性邀请码，用户自助注册，不开放任意注册
- **自助接入 VPS**：用户在看板创建 VPS、获取一次性接入 Token 和安装命令
- **独立通知设置**：每个用户维护自己的告警阈值、Telegram 与邮件通道
- **轻量部署**：agent 是单个静态二进制；Dashboard 是单个 Node 进程

## 架构

```
每台 VPS:  agent (Go) ──HTTPS POST /ingest──▶  Dashboard (Node + Hono)
                                                ├─ SQLite（7 天历史）
                                                ├─ REST API + 邀请码注册 / 密码登录
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
   - 为初始管理员生成密码哈希：`node -e 'console.log(require("bcryptjs").hashSync(process.argv[1],10))' '你的密码'`
   - 会话密钥：`openssl rand -hex 32`
   - 在 `users[]` 中保留至少一个初始管理员；后续普通用户通过邀请码注册
   - 已有 VPS 可以继续放在 `agents[]` 中，并用 `owner_user_id` 指定归属；新 VPS 可在页面自助添加
3. 安装 systemd 服务：`deploy/vps-dashboard.service`。
4. 用 nginx 反向代理并配置 HTTPS：参考 `deploy/nginx-monitor.conf`。

### 邀请码注册

系统不开放任意注册，注册流程如下：

1. 初始管理员使用配置文件中的账号登录。
2. 进入“设置 → 邀请码”，选择有效天数并生成邀请码。
3. 把邀请码发给用户。邀请码只在生成时显示一次，使用一次后立即失效。
4. 用户在登录页切换到“邀请码注册”，设置用户名和密码后即可登录。

邀请码只以哈希形式保存在 SQLite 中，服务端不能找回明文。管理员可以查看邀请码的创建、
过期和使用状态，也可以在邀请码尚未使用时将其撤销。

### 用户与 VPS 归属

管理员可以查看全部 VPS；普通用户只能访问自己创建或分配给自己的 VPS。隔离在服务端 API
执行，手工修改前端 URL 不能访问其他用户的 overview、历史曲线、Top 进程或告警日志。

登录后进入“VPS 管理”，填写名称、流量配额和账单重置日即可创建 VPS。系统会生成唯一的
VPS ID、接入 Token 和一条安装命令；Token 只显示一次。把安装命令复制到目标 VPS 执行后，
agent 会主动通过 HTTPS 上报数据，被监控 VPS 无需开放入站端口。

配置文件中的 `users[]` 和 `agents[]` 现在是启动时同步到 SQLite 的“引导配置”，主要用于
初始管理员和兼容已有 VPS。例如：

```json
{
  "users": [
    { "id": "admin", "username": "admin", "password_hash": "...", "role": "admin" }
  ],
  "agents": [
    { "id": "vps-a", "label": "VPS-A", "token": "...", "traffic_quota_gb": 1000, "owner_user_id": "admin" }
  ]
}
```

配置来源的账号和 VPS 每次启动都会按配置重新同步；配置来源的 VPS 在页面中只读。页面中新建
的用户、邀请码和 VPS 则完全由 SQLite 管理，不需要修改配置或重启 Dashboard。每个用户可维护
自己的告警阈值和通知通道；SQLite 历史保留天数是全局设置，只有管理员可以修改。

旧版只有 `admin_password_hash`、没有 `users[]` 的配置仍可直接启动：系统会自动映射为
用户名 `admin` 的管理员，未声明 `owner_user_id` 的 VPS 也默认归该管理员所有。

### Agent —— 一键安装

推荐直接复制“VPS 管理”页面在创建 VPS 后生成的命令。手工安装时可以执行：

```bash
curl -fsSL https://raw.githubusercontent.com/AimoCY/cloudcone_dashboard/main/deploy/install-agent-remote.sh \
  | sudo VPS_ID=vps-b TOKEN=你的token DASHBOARD_URL=https://你的看板域名:9443/ingest bash
```

脚本会自动下载 agent 二进制（仓库 `bin/` 内的预编译 linux/amd64 版本）、创建专用系统
用户、写入配置、安装并启动 systemd 服务。`VPS_ID` 和 `TOKEN` 必须来自“VPS 管理”页面，
或与 Dashboard 引导配置中某个 `agents[]` 条目对应。

## 测试

```bash
cd agent && go test ./...
cd dashboard && npm test
```

## 许可证

[MIT](LICENSE)
