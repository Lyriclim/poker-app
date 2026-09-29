# 🃏 朋友德州扑克 · The ace in the pack

一个给**朋友之间**玩的在线德州扑克网站。**学习项目**：不盈利、不涉及真钱，只使用虚拟筹码。

## ✨ 功能特性

### 玩法

- **经典局（Classic）**：自由带入虚拟筹码，输光后可原座位补码（Rebuy），随时中途入座。
- **锦标赛（Tournament）**：统一起始筹码，可配置盲注级别与时长、自动升盲，按淘汰规则决出冠军；开赛后不能补码或临时加入。
- **Session 本场记录**：展示每位玩家的带入、补码、带出与净输赢；房主可暂停、恢复、结束本场、指定最后一手。
- **趣味称号（Session Highlights）**：本场结算后颁发「收池达人 / 摊牌常客 / 逆风翻盘 / 一手大收获」，并列共享，仅供娱乐。

### 多端与语言

- **中英双语**：大厅与牌桌随时切换 English / 简体中文，选择保存在浏览器。
- **PC 与手机**：桌面布局 + 独立的手机竖屏牌桌，同一套深色风格，手机端放大手牌与公共牌。

### 安全与公平

- **服务器权威 + 信息隔离**：完整牌局状态只在服务端，推给每个玩家的是「私有视图」，永远看不到别人的底牌。
- **真随机**：52 张牌用 Fisher–Yates 洗牌，随机数来自 `node:crypto`（密码学安全 CSPRNG），非 `Math.random`。
- **纯游戏引擎**：规则与网络/数据库/定时器完全解耦，可独立单元测试，杜绝 UI 层作弊入口。

### 数据与容错

- **落库**：每手结果、每个动作、座位余额与本场流水通过数据库事务保存，失败可重试。
- **崩溃恢复**：进行中的一手会在发牌和每次行动后把牌堆、底牌、下注与轮次快照到本机，服务意外重启后可冻结该手，由房主恢复。
- **挂机检测**：60 秒未行动弹窗提醒，再 20 秒无回应自动过牌/弃牌；断线保留座位、标记离线，重连继续。

## 🚀 快速开始

### 环境要求

- **Node.js ≥ 20**（开发环境为 v24）
- npm（项目自带 `package-lock.json`）

### 启动步骤

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量（先复制模板）
cp apps/server/.env.example apps/server/.env

# 3. 初始化数据库（生成 Prisma Client + 建表）
npm run db:push

# 4. 启动（同时起后端 3001 端口 + 前端 5173 端口）
npm run dev
```

打开 http://localhost:5173 ，输入一个名字、创建牌桌，朋友输入名字后从大厅选择同一牌桌即可一起玩。

> 名字就是身份：首次输入即自动创建玩家，下次用同名回到原座位，无需密码。

## 🎮 游戏规则（已实现）

- **盲注与按钮**顺时针轮转，含**单挑（heads-up）特殊规则**：按钮即小盲、翻牌前按钮先行动。
- **行动**：下注 / 过牌 / 跟注 / 加注 / 全下；**最小加注**规则，**短码全下（under-raise）不会重开加注**。
- **下注轮次计数**：动作文案区分 **raise / 3-bet / 4-bet**（依此类推）。
- **烧牌（burn）**：发翻牌、转牌、河牌前各弃一张；全部全下时自动发完剩余公共牌并摊牌。
- **边池（side pot）**：按各玩家投入金额正确分配主池与边池。
- **摊牌比牌**：7 选 5，支持同花顺 / 四条 / 葫芦 / 同花 / 顺子 / 三条 / 两对 / 一对 / 高牌，含轮子顺子 A-2-3-4-5。
- **快捷下注**：¼ / ½ / ¾ / 满池 / +15 + 滑块与整数输入。

## 🛠 常用命令

| 命令 | 说明 |
|---|---|
| `npm run dev` | 同时启动前后端（热更新） |
| `npm run dev:server` / `npm run dev:web` | 只启动后端 / 前端 |
| `npm test` | 运行游戏引擎、牌桌与界面流程测试（Vitest） |
| `npm run typecheck` | 前后端类型检查 |
| `npm run build` | 构建前端产物到 `apps/web/dist` |
| `npm run db:push` | 生成 Prisma Client 并同步表结构 |

## 🧱 技术栈

| 层 | 技术 |
|---|---|
| 语言 | TypeScript（前后端同构） |
| 后端 | Node.js + Fastify + Socket.IO + Prisma |
| 前端 | React 18 + Vite 6 + Tailwind CSS 4 + Zustand + React Router |
| 数据库 | SQLite（可换 Postgres） |
| 工程化 | npm workspaces（monorepo） |
| 测试 | Vitest |

## 📁 项目结构

```
poker-app/
├── packages/shared/            # 前后端共享：类型、常量、事件协议
├── apps/server/
│   ├── src/game/               # ★ 纯游戏引擎（无网络/DB/定时器，可单测）
│   │   ├── deck.ts             #   牌组与洗牌（CSPRNG）
│   │   ├── hand-evaluator.ts   #   7 选 5 比牌 + 牌型描述
│   │   ├── pots.ts             #   主池 / 边池计算
│   │   ├── engine.ts           #   牌局状态机
│   │   └── __tests__/          #   单元测试
│   ├── src/table/              # 运行时牌桌（引擎 + 坐席 + Socket + 计时 + 落库）
│   ├── src/http/               # Fastify REST（名字入口/房间）+ 前端静态托管
│   ├── src/ws/                 # Socket.IO 网关（连接鉴权 + 事件分发）
│   ├── src/utils/              # JWT、限流
│   └── prisma/schema.prisma    # User / Room / SessionEntry / Seat / Hand / HandAction
└── apps/web/                   # React 前端
    ├── src/pages/              # Landing / Login / Lobby / Table
    ├── src/components/         # 牌、座位、行动栏、聊天、结算弹窗等
    └── src/store/              # Zustand（auth 持久化、table 状态）
```

### 架构要点

- **引擎与网络/DB 解耦**：`src/game/` 是纯函数式状态机，所有方法同步返回事件数组（`handStarted` / `streetDealt` / `action` / `showdown` / `handEnded`），由外层 `Table` 负责广播、计时、落库。
- **服务器权威 + 信息隔离**：完整状态只在服务端内存，推送给每个玩家的是「私有视图」（`TableView`），别人的底牌被抹掉。
- **自由带入筹码**：入座时决定带入多少虚拟筹码，无跨桌账户余额，与真实资金无关。

## 🌐 部署与公网分享

### 本机运行

后端会同时托管打包好的前端（同源，前端用相对路径，无需单独配域名）：

```bash
npm run build
npm run start -w @poker/server
```

启动后访问 http://localhost:3001 即可。

### 分享给朋友（ngrok）

项目内置了 ngrok 一键分享脚本，双击以下文件即可生成临时公网链接发给朋友：

| 文件 | 作用 |
|---|---|
| `Configure ngrok.cmd` | 首次使用：粘贴你自己的 ngrok Authtoken（免费注册） |
| `Start Public Access.cmd` | 开启公网分享，生成 `https://...ngrok-free.dev` 链接 |
| `Stop Public Access.cmd` | 停止分享（本地 App 仍在运行） |
| `Update App.cmd` | 旧版服务仍在运行时，结束牌局后更新到新版 |

电脑需保持开机联网；重启隧道会更换链接。详细说明见 [PUBLIC-ACCESS.md](PUBLIC-ACCESS.md)。

## ⚙️ 环境变量

在 `apps/server/.env` 中配置（模板见 `.env.example`）：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DATABASE_URL` | `file:./dev.db` | SQLite 文件路径；换 Postgres 时改成连接串并改 schema 的 provider |
| `JWT_SECRET` | 开发占位 | JWT 签名密钥，**生产环境务必改成强随机串** |
| `PORT` | `3001` | 后端端口 |
| `CLIENT_URL` | `http://localhost:5173` | 允许的前端来源（CORS）；ngrok 等跨域场景设为 `*` |

## ⚠️ 已知限制

- **单进程运行**：适合朋友规模（几十人、几张桌）。进行中的手牌快照保存在本机 `.runtime/room-state/`，服务重启后需房主恢复，不能把同一桌同时跑在多台服务器。
- **大厅只显示当前进程内的活跃牌桌**；每局结果虽已落库（`Hand` / `HandAction`），但暂未提供历史战绩回看界面。
- **名字入口限流为内存版**（单进程有效），多实例部署时需换成共享存储。
