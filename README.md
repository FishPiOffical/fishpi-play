<p align="center">
  <img src="apps/admin/public/icon.svg" width="128" height="128" alt="Elemental Earth Logo">
</p>

<h1 align="center">鱼丸游戏平台</h1>

一个专为纯前端单机游戏打造的全方位集成平台。它旨在通过简单的 SDK 接入，为传统单机游戏提供后端能力，包括用户认证、云端存档、数据同步以及管理后台。

## ✨ 核心特性

- **🚀 快速接入**：通过 `fishpi-play` 几行代码即可完成用户登录与数据持久化。
- **🛡️ 安全认证**：深度集成[摸鱼派](https://fishpi.cn)开放平台，提供安全可靠的身份验证。
- **☁️ 云端存档**：支持游戏存档的上传与下载，支持多设备无缝连接。
- **📊 游戏管理后台**：
  - **开发者端**：注册新游戏、管理域名白名单、配置回调路径、查看玩家数据。
  - **超级管理端**：审批游戏申请、下架违规游戏、全局资源监控。

## 📁 项目结构

项目采用 Monorepo 架构进行管理：

```text
/
├── apps/
│   ├── admin/      # 管理后台前端 (Vue 3, Element Plus, Vite, Pinia)
│   └── server/     # 后端服务 (Express, TypeORM, MongoDB / MySQL, TypeScript)
├── packages/
│   └── sdk/        # 游戏接入 SDK (Type-safe HTTP client)
└── package.json    # 根目录工作区配置
```

## 🛠 技术栈

- **Frontend**: Vue 3, Vite, Element Plus, Pinia, Vue Router, Iconify
- **Backend**: Node.js, Express, TypeORM, TypeScript
- **Database**: MongoDB / MySQL (可选)
- **Package Manager**: NPM (Workspaces)

## 🖥️ 快速开始

### 环境依赖

- Node.js (建议 v18+)
- MongoDB 或 MySQL

### 安装与运行

1. **安装依赖**
   ```bash
   npm install
   ```

2. **配置后端**
   在 `apps/server/src/config.ts`、`config.json` 或环境变量中配置 MongoDB 或 MySQL 连接信息（亦可在首次访问管理后台时通过初始化界面配置）。

3. **启动开发环境**

   **启动后端服务：**
   ```bash
   npm run dev --prefix apps/server
   ```

   **启动管理后台：**
   ```bash
   npm run dev --prefix apps/admin
   ```

### 📦 数据库迁移 (MongoDB -> MySQL)

如需从旧版 MongoDB 迁移数据至 MySQL：

1. **导出 MongoDB 数据**（自动备份至 `./data/mongo-backup`）：
   ```bash
   npm run db:export
   # 或指定连接串与输出目录
   npm run db:export -- --url "mongodb://127.0.0.1:27017/game-platform" --out "./data/mongo-backup"
   ```

2. **导入数据至 MySQL**（自动初始化库表与索引，并更新 `config.json`）：
   ```bash
   npm run db:import
   # 或指定 MySQL 参数
   npm run db:import -- --host localhost --port 3306 --user root --password "your_pass" --database game-platform
   ```

3. **或者一步完成直接迁移**：
   ```bash
   npm run db:migrate
   ```

## 🗺️ 开发者指南

### 游戏注册流程
1. 进入“游戏注册”页面填写游戏名称、Key 及相关配置。
2. 提交申请后，状态默认为 `待审批`。
3. 超级管理员在“超级管理”页面进行 `通过` 操作后，游戏正式上线并可使用 SDK。

### SDK 接入示例
```typescript
import { GameSDK } from 'fishpi-play';

const sdk = new GameSDK('YOUR_GAME_KEY');

// 登录
await sdk.login();

// 获取存档
const archive = await sdk.getArchive();

// 上传存档
await sdk.saveArchive(archiveData);
```

SDK 更多使用方法请参考 [SDK 文档](packages/sdk/README.md)。
