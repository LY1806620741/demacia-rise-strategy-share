# 去中心化搜索 P2P 系统

## 概述

该系统将本地策略检索转变为完全去中心化的 P2P 搜索网络，通过点赞/点踩机制实现跨节点权重传播。

## 核心特性

### 1. 投票同步（Vote Broadcasting）

#### 工作流程
```
用户操作 → 本地投票 → 广播投票事件 → 所有对等节点接收 → 全网权重更新
   ↓          ↓         (localStorage)        ↓
点赞/点踩    立即更新                    聚合投票计数
```

#### 实现细节

**投票广播函数**:
```javascript
window.voteOnStrategy = function(strategyId, isLike) {
  broadcastVote(strategyId, isLike);  // 广播到网络
  // 本地立即更新显示
  const strategy = get_strategies().find(s => s.id === strategyId);
  if (strategy) {
    if (isLike) strategy.likes++;
    else strategy.dislikes++;
    renderStrategies();
  }
};

function broadcastVote(strategyId, isLike) {
  const voteEvent = {
    type: 'vote',
    strategyId,
    isLike,
    nodeId,           // 记录投票者身份
    timestamp: nowMs()
  };
  // 通过多窗口存储事件同步
  localStorage.setItem("p2p_msg", JSON.stringify(voteEvent));
}
```

**投票事件处理**:
```javascript
function handleVoteEvent(msg) {
  const { strategyId, isLike, nodeId: voterId } = msg;
  
  // 维护全局投票计数 (按节点追踪)
  if (!localVotes.has(strategyId)) {
    localVotes.set(strategyId, { 
      likes: new Map(),      // Map<nodeId, timestamp>
      dislikes: new Map() 
    });
  }
  
  const votes = localVotes.get(strategyId);
  if (isLike) {
    votes.likes.set(voterId, msg.timestamp);
    votes.dislikes.delete(voterId);  // 反转投票
  } else {
    votes.dislikes.set(voterId, msg.timestamp);
    votes.likes.delete(voterId);     // 反转投票
  }
}
```

### 2. 索引共享（Index Distribution）

#### 周期性广播本地索引
```javascript
// 每 5 秒广播一次本地策略索引
function broadcastIndexShare() {
  const strategies = get_strategies();
  const shareEvent = {
    type: 'index_share',
    nodeId,
    strategies: strategies.map(s => ({
      id: s.id,
      title: s.title,
      description: s.description,
      target_hero: s.target_hero,
      counter_lineup: s.counter_lineup,
      counter_tech: s.counter_tech,
      likes: s.likes,
      dislikes: s.dislikes,
      score: s.score
    })),
    timestamp: nowMs()
  };
  localStorage.setItem("p2p_msg", JSON.stringify(shareEvent));
}
```

#### 接收并存储对等节点索引
```javascript
let peerIndices = new Map(); // nodeId => { strategies: [...], timestamp }

function handleIndexShare(msg) {
  const { nodeId: peerId, strategies } = msg;
  if (!peerIndices.has(peerId)) {
    peerIndices.set(peerId, { strategies: [], timestamp: nowMs() });
  }
  peerIndices.get(peerId).strategies = strategies;
  peerIndices.get(peerId).timestamp = msg.timestamp;
}
```

### 3. 聚合搜索（Aggregated Search）

#### 搜索流程
```
本地查询 → 本地 BM25 搜索 → 对等节点搜索 → 合并结果
   ↓         (WASM)      (calculateRelevance)    ↓
关键词   搜索本地索引   搜索 peerIndices    去重 & 加权排序
```

#### 实现细节
```javascript
async function aggregateSearch(q, limit) {
  // 1. 本地搜索
  const localHits = await search(q, limit);  // WASM BM25
  
  // 2. 对等节点搜索
  const peerResults = [];
  const cutoff = nowMs() - NODE_TTL;
  
  for (const [peerId, peerData] of peerIndices) {
    if (peerData.timestamp < cutoff) {
      peerIndices.delete(peerId);  // 清理过期节点
      continue;
    }
    
    // 对每个对等节点的策略使用相同的 BM25 算法
    for (const strategy of peerData.strategies) {
      const score = calculateRelevance(q, strategy);
      if (score > 0) {
        peerResults.push({
          ...strategy,
          rank: score,
          doc_type: `peer:${peerId.slice(0, 8)}`,
          from_peer: peerId
        });
      }
    }
  }
  
  // 3. 合并 & 加权
  const allResults = [
    ...localHits,
    ...peerResults
  ].map(r => {
    const votes = localVotes.get(r.id) || { likes: new Map(), dislikes: new Map() };
    // 加权公式: rank + (赞数 * 0.5 - 踩数 * 0.3) * 100
    const voteBoost = (votes.likes.size * 0.5 - votes.dislikes.size * 0.3) * 100;
    return {
      ...r,
      weighted_score: r.rank + voteBoost,
      vote_info: {
        likes: votes.likes.size,
        dislikes: votes.dislikes.size
      }
    };
  });
  
  // 4. 去重 & 排序
  const seen = new Set();
  return allResults
    .filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    })
    .sort((a, b) => b.weighted_score - a.weighted_score)
    .slice(0, limit);
}
```

#### 相关性计算
```javascript
function calculateRelevance(query, strategy) {
  const searchText = `${strategy.title} ${strategy.description} 
                     ${strategy.counter_lineup} ${strategy.counter_tech}`.toLowerCase();
  const terms = query.split(/\s+/).filter(Boolean);
  
  let score = 0;
  terms.forEach(term => {
    const lowerTerm = term.toLowerCase();
    // 加权计分: 标题权重 3x
    if (strategy.title.toLowerCase().includes(lowerTerm)) score += 3;
    // 目标权重 2x
    if (strategy.target_hero.toLowerCase().includes(lowerTerm)) score += 2;
    // 其他字段权重 1x
    if (searchText.includes(lowerTerm)) score += 1;
  });
  
  // 基础策略评分加成 (0-10 分)
  return score + (strategy.score * 0.1);
}
```

### 4. 加权排序算法

#### 公式
```
weighted_score = BM25_rank + (全局赞数 * 0.5 - 全局踩数 * 0.3) * 倍数系数

其中:
- BM25_rank: 基础关键词匹配分 (1-20)
- 全局赞数: 所有节点对该策略的赞数之和
- 全局踩数: 所有节点对该策略的踩数之和
- 倍数系数: 100 (用于权衡关键词匹配 vs 社群共识)
```

#### 实例
```
场景: 两个策略都包含 "对抗达瑞斯"

策略 A (本地)
  - 基础分: 15 (高度相关)
  - 赞数: 10 | 踩数: 0
  - weighted = 15 + (10 * 0.5 - 0 * 0.3) * 100 = 515

策略 B (来自对等节点)
  - 基础分: 12 (中等相关)
  - 赞数: 50 | 踩数: 3
  - weighted = 12 + (50 * 0.5 - 3 * 0.3) * 100 = 2512

结果: 策略 B 排名更高 (社群共识大于本地相关性)
```

## P2P 消息格式

### 投票消息
```json
{
  "type": "vote",
  "strategyId": "uuid-xxxx-xxxx",
  "isLike": true,
  "nodeId": "node-id-xxxx",
  "timestamp": 1704067200000
}
```

### 索引共享消息
```json
{
  "type": "index_share",
  "nodeId": "node-id-xxxx",
  "timestamp": 1704067200000,
  "strategies": [
    {
      "id": "strategy-id",
      "title": "对抗达瑞斯的坦克阵地",
      "description": "使用 Poppy + Garen + Quinn...",
      "target_hero": "darius",
      "counter_lineup": "Poppy + Garen + Quinn",
      "counter_tech": "盾牌强化, 反伤技能",
      "likes": 10,
      "dislikes": 1,
      "score": 8.5
    }
  ]
}
```

### 策略广播（兼容旧格式）
```json
{
  "id": "strategy-id",
  "title": "对抗达瑞斯的坦克阵地",
  "description": "使用 Poppy + Garen + Quinn...",
  "target_hero": "darius",
  "counter_lineup": "Poppy + Garen + Quinn",
  "counter_tech": "盾牌强化, 反伤技能",
  "likes": 10,
  "dislikes": 1,
  "score": 8.5
}
```

## 实现细节

### 跨标签页同步 (localStorage 事件)
```javascript
window.addEventListener('storage', (e) => {
  if (e.key === 'p2p_msg' && e.newValue) {
    try {
      const msg = JSON.parse(e.newValue);
      
      if (msg.type === 'vote') {
        handleVoteEvent(msg);        // 投票同步
      } else if (msg.type === 'index_share') {
        handleIndexShare(msg);       // 索引共享
      } else {
        p2p_receive_json(e.newValue); // 策略广播 (旧格式兼容)
      }
    } catch (err) {
      // 降级处理: 非 JSON 格式视为旧策略消息
      p2p_receive_json(e.newValue);
    }
  }
});
```

### 节点生命周期
```
节点启动
  ↓
updateNodeHeartbeat() 每秒执行
  ↓ 写入 localStorage['p2p_nodes']
  ↓
其他标签页监听 storage 事件
  ↓
mergeNodeMap() 更新本地节点表
  ↓
计算 TTL: cutoff = now - 10000ms
  ↓
过期节点自动清理
```

### IndexedDB 持久化
```javascript
// 投票结果同步到 IndexedDB
async function updateVoteInDB(strategyId, votes) {
  const tx = db.transaction(['strategies'], 'readwrite');
  const strategy = await getStrategy(strategyId);
  if (strategy) {
    strategy.likes = votes.likes.size;      // 更新全局赞数
    strategy.dislikes = votes.dislikes.size; // 更新全局踩数
    await tx.objectStore('strategies').put(strategy);
  }
}

// 重启后恢复投票状态
async function loadPersistentVotes() {
  const strategies = await loadStrategiesFromDB();
  strategies.forEach(s => {
    localVotes.set(s.id, {
      likes: new Map(),
      dislikes: new Map()
    });
  });
}
```

## 使用示例

### 场景 1: 多用户投票权重提升
```
时刻 T1: 用户 A 发布策略 "对抗达瑞斯的完美阵容"
        - 本地搜索分: 15
        - 初始赞数: 0
        
时刻 T2: 用户 B 通过 P2P 接收到该策略
        - 搜索 "对抗达瑞斯"
        - 该策略排名: 第 3 位 (基于 BM25 分)

时刻 T3: 用户 B 点赞 ✓
        - 赞数变为: 1
        - 权重分变为: 15 + (1 * 0.5) * 100 = 65
        - 排名提升: 第 1 位

时刻 T4: 用户 C 也点赞该策略
        - 赞数变为: 2
        - 权重分变为: 15 + (2 * 0.5) * 100 = 115
        - 排名进一步稳定
```

### 场景 2: 社群共识压过本地相关性
```
用户 A 本地创建的策略:
- 标题: "我的个人秘密阵容"
- 基础分: 20 (完全匹配)
- 赞数: 0 | 踩数: 0
- 权重: 20 + 0 = 20
- 排名: #1

社群广泛推荐的策略 (来自 100 个对等节点):
- 标题: "官方推荐对抗达瑞斯"
- 基础分: 10 (部分匹配)
- 赞数: 85 | 踩数: 2  
- 权重: 10 + (85 * 0.5 - 2 * 0.3) * 100 = 4210
- 排名: #1 ✓ (社群共识赢家)
```

## 性能考虑

### 索引广播频率
- **当前**: 5 秒一次
- **优化**:
  - 仅在阈值变化时广播 (如新增策略 / 投票数 ±5)
  - 根据网络连接数动态调整频率
  - 压缩消息体积 (omit zero-fields)

### 搜索 O(n) 复杂度
```
n = 本地策略数 + Σ(对等节点策略数)

修复方向:
1. 倒排索引缓存 (避免每次搜索重新计算)
2. 布隆过滤器预筛选
3. 对等节点分片 (超过 100 节点后启用)
```

### 存储上限
```
IndexedDB 限额: 通常 50MB (取决于浏览器)

当前:
- 每个策略 ~500 字节
- 10,000 策略 = 5MB (充足)

未来瓶颈: 投票历史 (追踪每个投票者的时间戳)
解决: 定期清理 >30 天的投票记录
```

## 故障恢复

### 网络分区 (Partition)
```
问题: 相邻的 P2P 节点分离

当前行为:
- 各自维持独立的索引 (不同的权重)
- TTL 机制后自动清理对方数据
- 重新连接后自动同步

改进方案:
- 向量时钟 (Vector Clock) 冲突检测
- 最终一致性 (Eventual Consistency) 协调
```

### 恶意投票 (Sybil 攻击)
```
威胁: 单一用户创建多个节点进行刷赞

缓解措施:
1. 按 nodeId 去重 (单个浏览器 = 单个 nodeId)
2. 记录投票来源 (localVotes 中按 voterId 追踪)
3. 可选: 引入信誉系统 (NodeReputation Map)

示例实现:
let nodeReputation = new Map(); // nodeId => score
function recordVote(nodeId) {
  if (nodeReputation.get(nodeId) < -10) {
    console.warn(`Blocking suspicious node: ${nodeId}`);
    return false; // 拒绝低信誉节点的投票
  }
}
```

## 测试方式

### 测试 1: 多窗口同步
```bash
# 终端 1: 启动开发服务器
cd League-of-Legends-demacia-rise-sim
npx http-server -p 8000

# 浏览器中:
1. 打开 3 个标签页: http://localhost:8000
2. 在标签页 A 中创建策略 "对抗达瑞斯"
3. 在标签页 B 中搜索 "达瑞斯"
4. 在标签页 A 中点赞该策略 ✓
5. 在标签页 B 中检查赞数是否实时更新
6. 在标签页 C 中搜索同一策略
7. 验证排名是否因共识投票而提升
```

### 测试 2: 索引聚合
```
1. 标签页 A: 搜索 "对抗"
   结果 1: "Page A 的本地策略"
   
2. 标签页 B: 创建 10 个对等节点策略
   
3. 标签页 A: 刷新搜索, 检查结果中是否包含对等节点策略
   
期望: 结果中同时出现本地和对等节点策略 (混合排列)
```

### 测试 3: 加权排序
```
1. 标签页 A: 创建高度相关但无人赞的策略 Score: 20/20
2. 标签页 B: 创建模糊相关但高赞的策略 Score: 10/20, Likes: 100
3. 页面 A: 搜索关键词
4. 验证: Score 10的策略排名更高 (权重战胜相关性)
```

## 配置调整

编辑 `app.js` 中的常量以自定义行为:

```javascript
const NODE_TTL = 10000;           // 节点存活时间 (ms)
const INDEX_BROADCAST_INTERVAL = 5000;  // 索引广播频率 (ms)

// 在 aggregateSearch 中调整权重系数
const voteBoost = (votes.likes.size * 0.5    // 赞数系数 (改为 0.3 降低权重)
                 - votes.dislikes.size * 0.3) // 踩数系数 (改为 0.5 提高惩罚)
                 * 100;                       // 倍数系数 (改为 50 或 200)
```

## 限制与未来工作

### 当前限制
1. localStorage 仅限单设备 (不支持跨设备 P2P)
2. 无加密通信 (localStorage 事件伪造风险)
3. 无持久化投票历史 (刷新后无共识恢复)
4. 无速率限制 (无法防止投票洪泛)

### 未来扩展
1. **WebRTC 数据通道**: 真正跨设备 P2P
2. **IPFS 集成**: 分布式内容寻址存储
3. **区块链投票**: 密码学投票证明
4. **声誉系统**: 多维节点评分 (新鲜度/准确性/多样性)
5. **推荐引擎**: 协同过滤 vs 内容过滤混合

---

**最后更新**: 2024-01-22
**版本**: 1.0 (MVP - 最小可行产品)
