# League of Legends Demacia Rise Sim

![Status](https://img.shields.io/badge/status-experimental-blue)
![Frontend](https://img.shields.io/badge/frontend-vanilla%20js%20%2B%20html%20%2B%20css-brightgreen)
![Storage](https://img.shields.io/badge/storage-Helia%20%2B%20IPFS-orange)
![Deployment](https://img.shields.io/badge/deploy-static%20hosting%20friendly-purple)

一个面向《德玛西亚崛起》战斗编排场景的纯前端策略模拟与社区协作工具。

它将 **官方配置数据**、**敌人阵容编辑**、**社区策略发布** 和 **Helia/IPFS 社区索引同步** 组合到一个无需后端的静态 Web 应用中。

---

## Why This Project

这个项目主要解决三个实际问题：

1. 官方阵容、研究和敌人信息分散，不方便快速检索
2. 玩家很难把“敌人阵容 → 应对阵容 → 研究 → 诀窍”沉淀成可复用方案
3. 在没有后端服务的前提下，社区内容仍然需要一种可分享、可同步的协作方式

因此，项目选择了：

- **静态前端部署**
- **配置驱动的官方数据结构**
- **浏览器端 Helia/IPFS 内容分发**
- **基于指针 CID 的最小社区索引机制**

---

## Features

- 官方阵容与城镇防守推荐浏览
- 敌人阵容文本快速输入与相似策略搜索
- 社区策略发布、浏览、点赞 / 点踩
- 本地社区索引持久化
- 公告板 / 指针 CID 同步社区索引
- 社区索引导入 / 导出
- 浏览器端 IPFS 节点状态展示
- 纯静态部署，无需后端服务

---

## Demo Capabilities

当前版本可完成的典型流程：

- 输入敌人阵容，查看官方与社区相似策略
- 发布一条新的社区策略到 Helia/IPFS
- 自动将新内容写入本地社区索引
- 将本地索引发布为新的“指针 CID”
- 其他用户通过该指针 CID 合并并浏览社区内容

---

## Tech Stack

- **Frontend**: Vanilla JavaScript + HTML + CSS
- **Content Store**: Helia + UnixFS
- **Local Persistence**: `localStorage`
- **Deployment**: GitHub Pages / 任意静态文件服务器
- **Data Source**: `config.json` + `doc/` 文档

---

## Architecture Overview

```text
Official Data (config.json / docs)
            │
            ▼
  Static Frontend Application
            │
   ┌────────┴────────┐
   │                 │
   ▼                 ▼
UI Rendering     Community Strategy Editing
   │                 │
   └────────┬────────┘
            ▼
     Local Community Index
            │
            ▼
      Helia / IPFS Storage
            │
            ▼
 Pointer CID / Bulletin-style Sharing
```

---

## Project Status

当前版本已经完成从旧的 Rust / WASM / libp2p 方案迁移到纯前端方案：

- 已移除旧的 `ipfs-core`
- 已迁移到 **Helia**
- 已实现基础社区索引机制
- 已支持通过“指针 CID”同步社区内容

当前仍属于 **持续演进中的实验性版本**，尤其是浏览器网络传播与去中心化发现能力仍受浏览器运行环境限制。

---

## Quick Start

github pages: https://ly1806620741.github.io/demacia-rise-strategy-share/

---

## Usage

### 浏览官方数据

- 打开“官方阵容数据”页
- 查看城镇防守推荐、英雄数据与研究说明

### 发布社区策略

1. 在“战斗策略编辑”页录入敌人阵容
2. 选择应对单位和研究
3. 填写策略描述
4. 点击“发布社区战斗策略”
5. 系统会把该策略上传到 Helia，并写入本地社区索引

### 发布社区索引

在“社区阵容数据”页：

1. 点击“发布本地索引”
2. 获得一个新的 **指针 CID / 公告板 CID**
3. 将该 CID 分享给其他用户

### 同步他人社区内容

在“社区阵容数据”页：

1. 将对方分享的指针 CID 粘贴到输入框
2. 点击“同步索引”
3. 页面会拉取远端索引并合并到本地
4. 对应社区内容会被批量解析并显示

### 导入 / 导出索引

- 点击“导出索引”可下载本地索引 JSON
- 点击“导入索引”可手动合并外部索引文件

---

## Browser-side IPFS / Helia Setup

项目当前通过浏览器 ESM CDN 直接加载 Helia：

- `https://cdn.jsdelivr.net/npm/helia@5.5.0/+esm`
- `https://cdn.jsdelivr.net/npm/@helia/unixfs@3.0.0/+esm`
- `https://cdn.jsdelivr.net/npm/multiformats@13.3.1/+esm`

对应封装文件：

- `frontend/ipfs-client.js`

已支持的能力：

- 社区策略上传：Helia UnixFS `addBytes`
- 社区策略读取：Helia UnixFS `cat`
- 节点状态展示：`peerId` + `multiaddrs`

---

## Project Structure

```text
.
├── app.js                       # 前端入口
├── app.css                      # 样式
├── index.html                   # 页面结构
├── config.json                  # 官方配置与基础数据
├── justfile                     # 本地开发辅助命令
├── need.md                      # 当前需求摘要
├── readme.md                    # 项目说明
├── doc/                         # 游戏资料与实现说明文档
├── frontend/
│   ├── community-index.js       # 社区索引机制
│   ├── community-strategy.js    # 社区策略逻辑
│   ├── config-ui.js             # 配置与编辑 UI
│   ├── data.js                  # 数据读取封装
│   ├── enemy-lineup.js          # 敌人阵容编辑
│   ├── enemy-search.js          # 敌方相似策略搜索
│   ├── ipfs-client.js           # Helia / IPFS 封装
│   ├── min-entry.js             # 页面初始化与事件绑定
│   ├── state.js                 # 前端状态
│   ├── unit-tooltips.js         # 单位说明提示
│   ├── utils.js                 # 工具函数
│   └── view-renderers.js        # 各类渲染逻辑
└── test/
    └── community-index.test.mjs # 社区索引最小契约测试
```

---

## Data Sources

项目中的主要内容来源如下：

- `config.json`
  - 官方英雄、单位、建筑、研究树、敌方组合、城镇推荐
- `doc/gameinfo.md`
  - 已确认的游戏文本与推荐依据
- `need.md`
  - 当前需求重点与上下文摘要

如果你要继续扩展推荐规则、官方阵容或搜索逻辑，优先检查这三个入口。

---

## Limitations

当前架构仍有几个现实限制：

1. 浏览器端 Helia 的内容传播能力受浏览器网络环境限制
2. 社区内容发现目前依赖“索引 CID / 公告板 CID”的传播
3. 没有中心化后端，因此不存在自动全网公告板更新
4. 不同浏览器、不同网络环境下的节点可达性可能不同

换句话说：

- **内容存储可以去中心化**
- **内容发现目前仍需要人为传播索引 CID，或额外的命名/公告板层**

---

## FAQ

### 这是一个纯前端项目吗？

是。当前版本不依赖自建后端，主要依靠静态资源、配置文件、本地存储和浏览器端 Helia/IPFS。

### 社区内容会自动被所有节点发现吗？

不会。当前版本已经支持通过“指针 CID”同步社区索引，但**索引 CID 仍需要被分享**，还没有实现全自动的全网发现。

### 为什么不用传统数据库？

项目目标之一就是在无后端条件下，探索社区内容共享与浏览的最小可行路径。

### 适合部署到哪里？

适合部署到 GitHub Pages、Netlify、Vercel 静态站点，或任意本地静态文件服务器。

---

## Roadmap

- [x] 从 `ipfs-core` 迁移到 Helia
- [x] 社区索引本地持久化
- [x] 指针 CID 同步与索引导入导出
- [ ] 多公告板订阅列表
- [ ] 自动合并多个指针来源
- [ ] 更强的社区搜索排序
- [ ] 更稳定的浏览器端内容传播策略
- [ ] 更完整的社区策略元数据结构

---

## Development Notes

当前推荐的开发方式：

```bash
just check
just serve
```

或：

```bash
python3 -m http.server 8080
```

如果你在修改社区索引逻辑，建议先验证：

- 发布策略后本地索引是否追加
- 发布索引后是否生成新的指针 CID
- 通过其他指针 CID 是否能成功合并索引
- 社区列表和侧边计数是否同步刷新

---

## Contributing

欢迎提交 Issue 或 Pull Request。

建议贡献方向：

- 战略数据完善
- 社区索引同步体验优化
- 搜索与推荐排序算法
- UI / UX 改进
- 文档完善
- 浏览器兼容性修复

在提交较大改动前，建议先在 `need.md` 或 Issue 中说明目标和范围。

---

## Acknowledgements

- Helia
- IPFS / UnixFS
- 游戏内容资料与社区策略整理贡献者
