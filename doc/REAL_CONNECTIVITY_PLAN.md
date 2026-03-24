# 真实公网连接计划

## 现状结论

当前项目 **还不能** 在访问 GitHub Pages 后自动加入真实公网 P2P 网络并显示真实节点数。

原因：

1. `src/p2p.rs` 目前只有 bootstrap 地址预检，没有真实 `Swarm` 生命周期。
2. 当前没有实现：
   - `swarm.dial(...)`
   - `SwarmEvent` 轮询
   - 远程连接成功后的节点数回写
3. `config.json` 默认使用的是 `/dnsaddr/bootstrap.libp2p.io`，而当前浏览器 wasm 客户端 **未实现 dnsaddr 解析**。
4. 当前页面里能看到的“节点数”主要来自本地标签页同步，不是公网 libp2p 节点数。

## 什么时候才能做到“访问 GitHub Pages 即加入网络”

前提必须满足：

1. 提供一个 **长期在线、浏览器可直拨** 的显式地址。
2. 这个地址必须是浏览器兼容的 multiaddr，例如：
   - `/dns4/example.com/tcp/443/wss/p2p/<peer-id>`
   - `/dns4/example.com/udp/443/webrtc/p2p/<peer-id>`
   - `/dns4/example.com/udp/443/webtransport/p2p/<peer-id>`
3. Rust 侧完成真实 `Swarm` 生命周期：
   - `init_swarm`
   - `dial_addr`
   - `poll_once`
   - 连接事件状态回传
4. 前端轮询这些状态，并把真实 `connected_peers.length` 显示在仪表盘。

如果以上前提已经具备，下一轮可以开始接真实拨号；否则只能继续停留在“预检”与“接线位”阶段。

## 推荐的真实组网路线：引导节点 + 注册发现

如果目标是“打开 GitHub Pages 后尽快加入网络并看到节点数”，最现实的路线不是继续依赖 `/dnsaddr/bootstrap.libp2p.io`，而是：

1. 准备一个 **显式浏览器可达** 的引导节点地址。
2. 浏览器客户端启动后先拨这个地址。
3. 连接成功后，向引导节点执行最小注册发现协议：
   - 注册本节点 `peer_id`
   - 上报可拨地址
   - 拉取其他在线 peer 列表
4. 客户端再继续拨号其他 peer，形成去中心化扩散。

这个方案不是“完全无入口”，但它是浏览器环境下最现实的 **弱中心引导 + 去中心化扩散** 路线。

## 当前最小真实验证方案

### 方案目标

验证“浏览器客户端是否能对一个显式浏览器可达 multiaddr 发起真实连接尝试”。

### 需要准备

1. 一个显式的浏览器兼容 multiaddr
2. 一个稳定在线的远端 peer
3. 将该地址写入 `config.json > network.bootstrap_sources`

示例（示意，不代表当前仓库可直接使用）：

```text
/dns4/example.com/tcp/443/wss/p2p/12D3KooW...
```

### 验证通过标准

1. 页面启动后，Rust 侧 `network_state` 不再只是“未初始化 swarm”。
2. 前端能看到真实网络状态变化：
   - 拨号中
   - 成功 / 失败
3. 成功时：
   - `connected_peers.length > 0`
   - 仪表盘中的节点数与远程 peer 数同步变化

## 当前已实现但不应误解的内容

项目已实现：

1. bootstrap 地址真实预检
2. 浏览器可达协议分类：
   - `wss`
   - `webrtc`
   - `webtransport`
3. 本地标签页同步
4. 远程网络运行时骨架（但不是完整 swarm）

这 **不等于** 已完成真实公网去中心化组网。

## 下一步实施清单

需要修改的核心文件：

- `src/p2p.rs`
  - 持有真实 `Swarm`
  - 新增 `dial_addr`
  - 新增 `poll_once`
  - 处理 `SwarmEvent`
  - 为后续注册发现协议预留 `register_peer` / `list_peers` 入口
- `src/lib.rs`
  - 精简并把真正的 swarm 构建逻辑交给 `p2p.rs`
- `frontend/min-entry.js`
  - 启动时触发真实拨号
  - 轮询 `poll_once`
- `frontend/view-renderers.js`
  - 显示真实远程连接状态与节点数
- `config.json`
  - 使用显式浏览器兼容 multiaddr，而不是仅使用 `/dnsaddr/...`

## 下一阶段的最小完成标准

达到以下条件，才算真正进入“访问页面即可加入网络”的阶段：

1. `config.json` 中存在一个显式浏览器可达引导地址。
2. `P2PNode.init_swarm()` 真正创建 `Swarm`。
3. `P2PNode.dial_addr()` 能对显式地址发起真实拨号。
4. `P2PNode.poll_once()` 能回传真实连接事件。
5. 仪表盘节点数改为显示远程已连接 peer 数。

## 一句话结论

**只靠当前仓库和 `/dnsaddr/bootstrap.libp2p.io`，还做不到“打开 GitHub Pages 就自动加入真实公网网络并拿到节点数”。**

要做到这一点，必须先有一个显式浏览器可达的真实引导地址，并把 Rust 侧 `Swarm` 生命周期真正接起来。
