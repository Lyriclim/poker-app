# 🃏 朋友德州扑克

一个**朋友之间**玩的在线德州扑克网站。**学习项目**：不盈利、不涉及真钱，只使用虚拟筹码。

## 功能

- 注册 / 登录（密码哈希 + JWT），注册即送 1000 虚拟筹码
- 创建牌桌 / 通过 6 位邀请码加入 / 大厅查看进行中的牌桌
- 标准德州扑克规则：盲注、按钮轮转、下注/加注/全下、边池（side pot）、摊牌比牌
- 服务器权威 + 信息隔离（客户端永远看不到别人的底牌）
- 行动倒计时（超时自动过牌/弃牌）、断线保留座位、聊天
- 每局结果落库，可回看战绩

## 技术栈

| 层 | 技术 |
|---|---|
| 语言 | TypeScript（前后端同构） |
| 后端 | Node.js + Fastify + Socket.IO |
| 前端 | React + Vite + Tailwind CSS + Zustand |
| 数据库 | SQLite + Prisma（可无缝换 Postgres） |
| 工程化 | npm workspaces（monorepo） |
| 测试 | Vitest |

## 快速开始

要求：**Node.js ≥ 20**（开发环境为 v24）。

```bash
# 1. 安装依赖
npm install

# 2. 初始化数据库（生成 Prisma Client + 建表）
npm run db:push

# 3. 启动（同时起后端 3001 端口 + 前端 5173 端口）
npm run dev
```

打开 http://localhost:5173 ，注册账号，创建牌桌，把邀请码发给朋友即可一起玩。

### 常用命令

| 命令 | 说明 |
|---|---|
| `npm run dev` | 同时启动前后端（开发模式，热更新） |
| `npm test` | 运行游戏引擎单元测试 |
| `npm run typecheck` | 前后端类型检查 |
| `npm run build` | 构建前端产物到 `apps/web/dist` |
| `npm run db:push` | 同步数据库表结构 |

## 项目结构

```
poker-app/
├── packages/shared/        # 前后端共享的类型、常量、事件协议
├── apps/server/
│   ├── src/game/           # ★ 游戏引擎（纯逻辑，无网络/DB，可单测）
│   │   ├── deck.ts         #   牌组与洗牌（CSPRNG）
│   │   ├── hand-evaluator.ts  # 7选5 比牌
│   │   ├── pots.ts         #   主池/边池计算
│   │   ├── engine.ts       #   牌局状态机
│   │   └── __tests__/      #   单元测试
│   ├── src/table/          # 运行时牌桌（引擎 + Socket + DB + 计时器）
│   ├── src/http/           # REST 路由（注册/登录/房间）
│   ├── src/ws/             # Socket.IO 网关
│   └── prisma/schema.prisma
└── apps/web/               # React 前端
```

## 架构要点

- **游戏引擎与网络解耦**：`src/game/` 是纯函数式状态机，不依赖网络和数据库，可脱离 UI 独立测试。Socket.IO 只是"收动作 → 调引擎 → 广播各自视角"的薄层。
- **服务器权威 + 信息隔离**：完整状态只在服务端内存里；推送给每个玩家的是"私有视图"，别人的底牌被抹掉，杜绝作弊。
- **自由带入筹码**：`seats.stack` 是桌上筹码，玩家入座时自由决定带入多少，与任何真实资金无关。

## 已知简化（学习项目取舍）

- 没有实现"短码全下不重开加注"的完整限制（允许被短码全下后再加注），对朋友局无感。
- 发牌不烧牌（burn card），不影响随机公平性。
- 服务重启会丢失进行中的一手牌（座位和筹码会从上一手结算后的状态恢复）。
- 单进程内存态，适合朋友规模（几十人、几张桌）；要扩展多实例需引入 Redis 做状态外置。

## 环境变量

见 `apps/server/.env`（已带默认值，可直接跑）：

- `DATABASE_URL` — SQLite 文件路径（换 Postgres 时改成连接串并改 schema 的 provider）
- `JWT_SECRET` — 签名密钥（生产环境务必修改）
- `PORT` — 后端端口
- `CLIENT_URL` — 前端地址
