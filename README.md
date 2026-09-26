# 🃏 The ace in the pack · 朋友德州扑克

一个**朋友之间**玩的在线德州扑克网站。**学习项目**：不盈利、不涉及真钱，只使用虚拟筹码。

## 功能

- 注册 / 登录：bcrypt 密码哈希 + JWT（30 天），可选**注册邀请码**（服务端配置 `REGISTER_CODE`，留空则开放注册）
- 大厅：创建牌桌（可设名称、盲注、人数 2~9）、用 **6 位邀请码**加入、实时牌桌列表
- 入座**自由带入虚拟筹码**（无账户余额，离座即清空），可围观聊天（未入座为观众）
- 准备机制：所有玩家点击「准备」后自动开局
- 标准德州扑克规则（详见下文「游戏规则」）：盲注、按钮轮转、下注/加注/全下、边池、烧牌、摊牌比牌
- 服务器权威 + 信息隔离：客户端永远看不到别人的底牌
- 行动倒计时 + **挂机检测**：60 秒未行动弹窗提醒，再 20 秒无回应则自动过牌/弃牌
- 断线保留座位、标记离线，重连继续
- 摊牌交互：多人摊牌各自确认；全弃牌时赢家可选**亮牌 / 盖牌（muck）**
- 聊天：支持牌桌上的气泡（观众无座位）
- 每局结果与每个动作落库（`Hand` / `HandAction`）

## 技术栈

| 层 | 技术 |
|---|---|
| 语言 | TypeScript（前后端同构） |
| 后端 | Node.js + Fastify + Socket.IO + Prisma |
| 前端 | React 18 + Vite 6 + Tailwind CSS 4 + Zustand + React Router |
| 数据库 | SQLite（可换 Postgres） |
| 工程化 | npm workspaces（monorepo） |
| 测试 | Vitest |

## 快速开始

要求：**Node.js ≥ 20**（开发环境为 v24）。

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

打开 http://localhost:5173 ，注册账号、创建牌桌，把邀请码发给朋友即可一起玩。

### 常用命令

| 命令 | 说明 |
|---|---|
| `npm run dev` | 同时启动前后端（热更新） |
| `npm run dev:server` / `npm run dev:web` | 只启动后端 / 前端 |
| `npm test` | 运行游戏引擎单元测试（Vitest） |
| `npm run typecheck` | 前后端类型检查 |
| `npm run build` | 构建前端产物到 `apps/web/dist` |
| `npm run db:push` | 生成 Prisma Client 并同步表结构 |

## 生产部署

后端会同时托管打包好的前端（同源，前端用相对路径，无需单独配域名）：

```bash
npm run build
npm run start -w @poker/server
```

启动后访问 `http://localhost:3001` 即可。远程公开给朋友玩可加一层 ngrok 或部署到服务器。

## 环境变量

在 `apps/server/.env` 中配置（模板见 `.env.example`）：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DATABASE_URL` | `file:./dev.db` | SQLite 文件路径；换 Postgres 时改成连接串并改 schema 的 provider |
| `JWT_SECRET` | 开发占位 | JWT 签名密钥，**生产环境务必改成强随机串** |
| `PORT` | `3001` | 后端端口 |
| `CLIENT_URL` | `http://localhost:5173` | 允许的前端来源（CORS）；ngrok 等跨域场景设为 `*` |
| `REGISTER_CODE` | 空 | 注册邀请码；留空则开放注册，设置后只有填对的人能注册 |

## 项目结构

```
poker-app/
├── packages/shared/            # 前后端共享：类型、常量、事件协议
├── apps/server/
│   ├── src/game/               # ★ 纯游戏引擎（无网络/DB/定时器，可单测）
│   │   ├── deck.ts             #   牌组与洗牌（CSPRNG）
│   │   ├── hand-evaluator.ts   #   7 选 5 比牌 + 中文牌型名
│   │   ├── pots.ts             #   主池 / 边池计算
│   │   ├── engine.ts           #   牌局状态机
│   │   └── __tests__/          #   单元测试
│   ├── src/table/              # 运行时牌桌（引擎 + 坐席 + Socket + 计时 + 落库）
│   ├── src/http/               # Fastify REST（注册/登录/房间）+ 前端静态托管
│   ├── src/ws/                 # Socket.IO 网关（连接鉴权 + 事件分发）
│   ├── src/utils/              # JWT/bcrypt、邀请码、限流
│   └── prisma/schema.prisma    # User / Room / Seat / Hand / HandAction
└── apps/web/                   # React 前端
    ├── src/pages/              # Landing / Login / Lobby / Table
    ├── src/components/         # 牌、座位、行动栏、聊天、结算弹窗等
    └── src/store/              # Zustand（auth 持久化、table 状态）
```

## 架构要点

- **引擎与网络/DB 解耦**：`src/game/` 是纯函数式状态机，所有方法同步返回事件数组（`handStarted` / `streetDealt` / `action` / `showdown` / `handEnded`），由外层 `Table` 负责广播、计时、落库。可脱离 UI 独立测试。
- **服务器权威 + 信息隔离**：完整状态只在服务端内存，推送给每个玩家的是「私有视图」（`TableView`），别人的底牌被抹掉，杜绝作弊。
- **自由带入筹码**：入座时决定带入多少虚拟筹码，无账户余额，与真实资金无关。

## 游戏规则（已实现）

- 盲注与按钮顺时针轮转，含**单挑（heads-up）特殊规则**：按钮即小盲、翻牌前按钮先行动
- 下注 / 过牌 / 跟注 / 加注 / 全下；**最小加注**规则，**短码全下（under-raise）不会重开加注**
- 发公共牌前**烧牌（burn）**；全部全下时自动发完剩余公共牌并摊牌
- **边池（side pot）**按各玩家投入金额正确分配
- 摊牌比牌：7 选 5，支持同花顺/四条/葫芦/同花/顺子/三条/两对/一对/高牌，含轮子顺子 A-2-3-4-5，结果用中文牌型名展示
- 下注轮次计数，动作文案区分 **raise / 3-bet / 4-bet**
- 快捷下注按钮（¼ / ½ / ¾ / 满池）+ 滑块

## 已知限制

- **单进程内存态**：适合朋友规模（几十人、几张桌）。服务重启会丢失进行中的一手牌（座位和筹码会从上一手结算后的状态恢复）；要扩展多实例需引入 Redis 做状态外置。
- 大厅列表只显示当前进程内活跃的牌桌；每局结果虽已落库（`Hand` / `HandAction`），但暂未提供历史战绩回看界面。
- 登录/注册限流为**内存版**（单进程有效），多实例部署时需换成共享存储。
