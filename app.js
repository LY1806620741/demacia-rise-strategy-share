import init, {
    create_strategy,
    get_strategies,
    load_official_data,
    p2p_receive_json,
    create_p2p_node,
    search,                  // ✅ 新增：WASM 本地全文检索
} from './pkg/demacia_rise.js';

let p2pNode;
let nodeId = crypto.randomUUID();
let knownNodes = new Map();
const NODE_TTL = 10000;
let nodeHeartBeatTimer = null;
let config = null;
let db = null;

// 分布式搜索：对等节点索引缓存
let peerIndices = new Map(); // nodeId => { strategiesIndex: Map, votes: Map }
let localVotes = new Map(); // strategyId => { likes: Map<nodeId>, dislikes: Map<nodeId> }

function nowMs() { return Date.now(); }

// ——— IndexedDB 初始化 ———
async function initIndexedDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('DemaciaRise', 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
            db = req.result;
            resolve(db);
        };
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            // 策略库：存储用户创建/P2P收到的所有策略
            if (!db.objectStoreNames.contains('strategies')) {
                db.createObjectStore('strategies', { keyPath: 'id' });
            }
            // 阵容方案库：存储用户保存的阵容模板
            if (!db.objectStoreNames.contains('lineups')) {
                const lineupStore = db.createObjectStore('lineups', { keyPath: 'id' });
                lineupStore.createIndex('target', 'target', { unique: false });
            }
            // 投票历史库：存储投票计数持久化
            if (!db.objectStoreNames.contains('vote_history')) {
                db.createObjectStore('vote_history', { keyPath: 'strategyId' });
            }
        };
    });
}

// 保存策略到 IndexedDB
async function saveStrategyToDB(strategy) {
    if (!db) return;
    return new Promise((resolve, reject) => {
        const tx = db.transaction('strategies', 'readwrite');
        const store = tx.objectStore('strategies');
        store.put(strategy);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

// 从 IndexedDB 读取所有策略
async function loadStrategiesFromDB() {
    if (!db) return [];
    return new Promise((resolve, reject) => {
        const tx = db.transaction('strategies', 'readonly');
        const store = tx.objectStore('strategies');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

// 保存阵容方案
async function saveLineupToDB(lineup) {
    if (!db) return;
    return new Promise((resolve, reject) => {
        const tx = db.transaction('lineups', 'readwrite');
        const store = tx.objectStore('lineups');
        store.put(lineup);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

// 根据敌人查询阵容方案
async function getLineupsByEnemy(enemyId) {
    if (!db) return [];
    return new Promise((resolve, reject) => {
        const tx = db.transaction('lineups', 'readonly');
        const store = tx.objectStore('lineups');
        const index = store.index('target');
        const req = index.getAll(enemyId);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

// 从描述文本中自动识别兵种
function extractUnitsFromText(text) {
    if (!config) return [];
    const unitNames = config.demacia_units.map(u => u.name);
    const found = [];
    const lowerText = text.toLowerCase();
    config.demacia_units.forEach(unit => {
        if (lowerText.includes(unit.name.toLowerCase()) || lowerText.includes(unit.id)) {
            if (!found.find(u => u.id === unit.id)) {
                found.push(unit);
            }
        }
    });
    return found;
}

// 初始化官方推荐数据
async function initOfficialLineups() {
    // 检查是否已初始化
    const existing = await queryDB('lineups', 'all');
    if (existing.length > 0) return;

    const officialLineups = [
        {
            id: crypto.randomUUID(),
            name: '官方推荐：对抗达瑞斯',
            target: 'darius',
            units: ['lux', 'quinn', 'jarvan'],
            description: '远距离消耗，控制接近',
            likes: 100,
            dislikes: 5,
            created: nowMs()
        },
        {
            id: crypto.randomUUID(),
            name: '官方推荐：对抗勒布朗',
            target: 'leblanc',
            units: ['jarvan', 'quinn', 'poppy'],
            description: '坦克先手，远程补伤',
            likes: 85,
            dislikes: 3,
            created: nowMs()
        },
        {
            id: crypto.randomUUID(),
            name: '官方推荐：对抗伊芙琳',
            target: 'evelynn',
            units: ['poppy', 'lux', 'sylas'],
            description: '坦克拦截，魔法防护',
            likes: 92,
            dislikes: 4,
            created: nowMs()
        },
        {
            id: crypto.randomUUID(),
            name: '官方推荐：均衡阵容',
            target: 'ahri',
            units: ['garen', 'lux', 'quinn'],
            description: '攻防兼备，通用方案',
            likes: 78,
            dislikes: 2,
            created: nowMs()
        }
    ];

    for (const lineup of officialLineups) {
        await saveLineupToDB(lineup);
    }
    console.log('✅ 官方推荐阵容已初始化');
}

// 查询数据库通用方法
async function queryDB(storeName, key) {
    if (!db) return [];
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = key === 'all' ? store.getAll() : store.get(key);
        req.onsuccess = () => resolve(key === 'all' ? req.result : [req.result]);
        req.onerror = () => reject(req.error);
    });
}


async function loadConfig() {
    try {
        const res = await fetch('/config.json');
        config = await res.json();
        populateFormSelects();
    } catch (e) {
        console.error('加载配置文件失败', e);
    }
}

function populateFormSelects() {
    if (!config) return;

    // 填充敌人选择
    const targetSelect = document.getElementById('target');
    targetSelect.innerHTML = '<option value="">选择目标敌人...</option>';
    config.enemy_units.forEach(unit => {
        const opt = document.createElement('option');
        opt.value = unit.id;
        opt.textContent = `${unit.name}（${unit.threat_level}）`;
        targetSelect.appendChild(opt);
    });

    // 填充查询敌人选择
    const searchByEnemySelect = document.getElementById('search-by-enemy');
    searchByEnemySelect.innerHTML = '<option value="">选择敌人，查询最佳应对方案...</option>';
    config.enemy_units.forEach(unit => {
        const opt = document.createElement('option');
        opt.value = unit.id;
        opt.textContent = `${unit.name}（${unit.threat_level}）`;
        searchByEnemySelect.appendChild(opt);
    });

    // 填充阵容多选
    const lineupSelect = document.getElementById('lineup-select');
    lineupSelect.innerHTML = '';
    config.demacia_units.forEach(unit => {
        const opt = document.createElement('option');
        opt.value = unit.id;
        opt.textContent = `${unit.name} (${unit.type})`;
        lineupSelect.appendChild(opt);
    });

    // 填充科技树复选
    const techTree = document.getElementById('tech-tree');
    techTree.innerHTML = '';
    config.tech_tree.forEach(chapter => {
        const chapterDiv = document.createElement('div');
        chapterDiv.className = 'tech-chapter';
        const title = document.createElement('h4');
        title.textContent = `第 ${chapter.chapter} 章：${chapter.name}`;
        chapterDiv.appendChild(title);

        chapter.techs.forEach(tech => {
            const label = document.createElement('label');
            label.className = 'tech-checkbox';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = tech.id;
            checkbox.title = tech.description;
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(` ${tech.name}`));
            chapterDiv.appendChild(label);
        });

        techTree.appendChild(chapterDiv);
    });
}

function updateNodeHeartbeat() {
    const key = 'p2p_nodes';
    const raw = localStorage.getItem(key);
    let map = {};
    if (raw) {
        try { map = JSON.parse(raw); } catch (e) { map = {}; }
    }
    map[nodeId] = nowMs();
    localStorage.setItem(key, JSON.stringify(map));
    mergeNodeMap(map);
}

function mergeNodeMap(map) {
    const cutoff = nowMs() - NODE_TTL;
    let changed = false;
    for (const [id, ts] of Object.entries(map)) {
        if (ts < cutoff) {
            delete map[id];
            changed = true;
        } else {
            knownNodes.set(id, ts);
        }
    }
    for (const id of [...knownNodes.keys()]) {
        if (!map[id]) {
            knownNodes.delete(id);
            changed = true;
        }
    }
    if (changed) {
        localStorage.setItem('p2p_nodes', JSON.stringify(Object.fromEntries(knownNodes)));
    }
    renderP2PStatus();
}

function getNodeCount() {
    const cutoff = nowMs() - NODE_TTL;
    for (const [id, ts] of knownNodes) {
        if (ts < cutoff) knownNodes.delete(id);
    }
    return Math.max(1, knownNodes.size); // 含自身
}

function isNetworkConnected() {
    return knownNodes.size > 1;
}

function renderP2PStatus() {
    const nodeCount = getNodeCount();
    const dataCount = Array.isArray(get_strategies()) ? get_strategies().length : 0;
    document.getElementById('p2p-node-count').textContent = String(nodeCount);
    document.getElementById('p2p-data-count').textContent = String(dataCount);

    const stateEl = document.getElementById('p2p-network-state');
    const light = document.getElementById('p2p-status-light');
    if (!p2pNode) {
        stateEl.textContent = '离线';
        light.className = 'status-light offline';
    } else if (isNetworkConnected()) {
        stateEl.textContent = '已连接';
        light.className = 'status-light online';
    } else {
        stateEl.textContent = '单机';
        light.className = 'status-light warn';
    }
}

async function start() {
    await init();
    p2pNode = create_p2p_node();
    console.log('✅ WASM 初始化完成');

    // 初始化 IndexedDB
    try {
        await initIndexedDB();
        console.log('✅ IndexedDB 初始化完成');
    } catch (e) {
        console.error('IndexedDB 初始化失败', e);
    }

    // 加载配置
    await loadConfig();

    // 初始化官方推荐阵容
    await initOfficialLineups();

    // 从 IndexedDB 恢复持久化的策略和投票数据
    try {
        const savedStrategies = await loadStrategiesFromDB();
        if (savedStrategies.length > 0) {
            // 恢复策略到 WASM 内存
            for (const strat of savedStrategies) {
                create_strategy(
                    strat.id,
                    strat.title,
                    strat.description,
                    strat.target_hero,
                    strat.counter_lineup,
                    strat.counter_tech
                );
            }
            console.log(`✅ 从 IndexedDB 恢复了 ${savedStrategies.length} 个策略`);
        }
        // 恢复投票数据
        await loadVoteHistoryFromDB();
    } catch (e) {
        console.error('恢复 IndexedDB 数据失败', e);
    }

    // P2P 元信息和心跳
    knownNodes.set(nodeId, nowMs());
    updateNodeHeartbeat();
    nodeHeartBeatTimer = setInterval(updateNodeHeartbeat, 3000);

    // 监听退出，清理节点
    window.addEventListener('beforeunload', () => {
        const raw = localStorage.getItem('p2p_nodes');
        if (!raw) return;
        try {
            const map = JSON.parse(raw);
            delete map[nodeId];
            localStorage.setItem('p2p_nodes', JSON.stringify(map));
        } catch (e) {}
    });

    // 加载官方数据（内部会重建索引）
    await loadHeroData();

    // 绑定搜索框监听（防抖）
    bindSearchBox();

    // 实时刷新策略与状态
    setInterval(() => {
        renderStrategies();
        renderP2PStatus();
    }, 1000);

    renderP2PStatus();
}


// 加载官方英雄数据
async function loadHeroData() {
    try {
        const data = await load_official_data();
        const list = data.heroes;
        const el = document.getElementById("hero-list");
        el.innerHTML = "";

        list.forEach(h => {
            el.innerHTML += `
         <div class="card">
           <strong>${h.name}</strong> 
           HP:${h.hp} | 攻击:${h.attack} | 定位:${h.role}
         </div>`;
        });
    } catch (e) {
        console.error("加载失败，使用内置数据", e);
    }
}

// 自动识别描述中的兵种并填充
window.autoDetectUnits = function () {
    const desc = document.getElementById('desc').value;
    if (!desc.trim()) {
        alert('请先输入战术描述');
        return;
    }

    const detectedUnits = extractUnitsFromText(desc);
    if (detectedUnits.length === 0) {
        alert('未检测到任何兵种，请手动选择');
        return;
    }

    const lineupSelect = document.getElementById('lineup-select');
    // 清除之前的选择
    Array.from(lineupSelect.options).forEach(opt => opt.selected = false);

    // 选中检测到的兵种
    detectedUnits.forEach(unit => {
        const option = Array.from(lineupSelect.options).find(opt => opt.value === unit.id);
        if (option) option.selected = true;
    });

    alert(`✅ 已自动识别 ${detectedUnits.length} 个兵种: ${detectedUnits.map(u => u.name).join(', ')}`);
};
async function searchByEnemy() {
    const enemyId = document.getElementById('search-by-enemy').value;
    if (!enemyId) {
        document.getElementById('search-results-container').innerHTML = '';
        return;
    }

    const lineups = await getLineupsByEnemy(enemyId);
    const container = document.getElementById('search-results-container');

    if (!lineups || lineups.length === 0) {
        container.innerHTML = '<div class="muted">暂无推荐方案</div>';
        return;
    }

    // 按赞数排序
    lineups.sort((a, b) => (b.likes - b.dislikes) - (a.likes - a.dislikes));

    const html = lineups.map(lineup => {
        const unitNames = lineup.units.map(unitId => {
            const unit = config.demacia_units.find(u => u.id === unitId);
            return unit ? unit.name : unitId;
        }).join(' + ');

        return `
            <div class="card recommendation-card">
                <h4>${lineup.name}</h4>
                <div class="meta">
                    <span>👥 阵容：<strong>${unitNames}</strong></span>
                </div>
                <p>${lineup.description}</p>
                <div class="vote">
                    <span>👍 ${lineup.likes}</span>
                    <span>👎 ${lineup.dislikes}</span>
                    <span>评分: ${((lineup.likes - lineup.dislikes) / Math.max(1, lineup.likes + lineup.dislikes)).toFixed(2)}</span>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}
function renderStrategies() {
    const list = get_strategies();
    const el = document.getElementById("strategy-list");
    el.innerHTML = "";

    list.forEach(s => {
        const votes = localVotes.get(s.id) || { likes: new Map(), dislikes: new Map() };
        el.innerHTML += `
       <div class="card strategy-card" data-id="${s.id}">
         <h4>${s.title}</h4>
         <div class="meta">
           <span>🎯 敌手：<strong>${s.target_hero}</strong></span>
           <span>👥 阵容：<strong>${s.counter_lineup}</strong></span>
         </div>
         <div class="meta">
           <span>🔧 科技：<strong>${s.counter_tech}</strong></span>
         </div>
         <p>${s.description}</p>
         <div class="vote">
           <button class="vote-btn" onclick="voteOnStrategy('${s.id}', true)">👍 ${votes.likes.size || s.likes}</button>
           <button class="vote-btn" onclick="voteOnStrategy('${s.id}', false)">👎 ${votes.dislikes.size || s.dislikes}</button>
           <span>评分: ${s.score.toFixed(1)}</span>
         </div>
       </div>`;
    });
}

// 提交战术（P2P 广播）
window.submitStrategy = function () {
    const title = document.getElementById('title').value.trim();
    const desc = document.getElementById('desc').value.trim();
    const target = document.getElementById('target').value.trim();

    // 获取选中的阵容
    const lineupSelect = document.getElementById('lineup-select');
    const selectedLineupIds = Array.from(lineupSelect.selectedOptions).map(o => o.value);
    const selectedLineupNames = Array.from(lineupSelect.selectedOptions).map(o => o.textContent).join(' + ');

    // 获取选中的科技
    const techCheckboxes = document.querySelectorAll('#tech-tree input[type="checkbox"]:checked');
    const selectedTechs = Array.from(techCheckboxes).map(cb => {
        const label = cb.parentElement;
        return label.textContent.trim();
    }).join(', ');

    if (!title || !desc || !target || !selectedLineupNames || !selectedTechs) {
        alert('请完整填写标题、描述、选择敌人、阵容和科技。');
        return;
    }

    const id = crypto.randomUUID();
    create_strategy(id, title, desc, target, selectedLineupNames, selectedTechs);

    // 保存到 IndexedDB
    const strategy = {
        id,
        title,
        description: desc,
        target_hero: target,
        counter_lineup: selectedLineupNames,
        counter_tech: selectedTechs,
        likes: 0,
        dislikes: 0,
        score: 0,
        created: nowMs()
    };
    saveStrategyToDB(strategy);

    // 同时保存阵容方案
    const lineup = {
        id: crypto.randomUUID(),
        name: title,
        target,
        units: selectedLineupIds,
        description: desc,
        likes: 0,
        dislikes: 0,
        created: nowMs()
    };
    saveLineupToDB(lineup);

    // 清表单
    document.getElementById('title').value = '';
    document.getElementById('desc').value = '';
    document.getElementById('target').value = '';
    lineupSelect.selectedIndex = -1;
    techCheckboxes.forEach(cb => cb.checked = false);

    alert('✅ 策略已发布并保存！');
};

// --- P2P 广播通道（多窗口同步）---
window.js_p2p_broadcast = function (json) {
    // 多窗口广播
    localStorage.setItem("p2p_msg", json);
    const event = new StorageEvent("storage", { key: "p2p_msg" });
    window.dispatchEvent(event);
};

// 监听 P2P 消息与节点变动
window.addEventListener('storage', (e) => {
    if (e.key === 'p2p_msg' && e.newValue) {
        try {
            const msg = JSON.parse(e.newValue);
            if (msg.type === 'vote') {
                // 投票事件：更新对等节点投票计数
                handleVoteEvent(msg);
            } else if (msg.type === 'index_share') {
                // 索引共享：聚合对等节点的策略索引
                handleIndexShare(msg);
            } else {
                // 默认策略广播
                p2p_receive_json(e.newValue);
            }
        } catch (err) {
            // 降级处理：如果不是 JSON，视为旧格式策略
            p2p_receive_json(e.newValue);
        }
        const q = document.getElementById('q')?.value?.trim();
        if (q) runSearch(q);
    }
    if (e.key === 'p2p_nodes' && e.newValue) {
        try {
            const map = JSON.parse(e.newValue);
            mergeNodeMap(map);
        } catch (err) {
            console.warn('p2p_nodes cannot parse', err);
        }
    }
});
// —— 投票事件处理 ——
function broadcastVote(strategyId, isLike) {
    const voteEvent = {
        type: 'vote',
        strategyId,
        isLike,
        nodeId,
        timestamp: nowMs()
    };
    localStorage.setItem("p2p_msg", JSON.stringify(voteEvent));
    const event = new StorageEvent("storage", { key: "p2p_msg" });
    window.dispatchEvent(event);
}

function handleVoteEvent(msg) {
    const { strategyId, isLike, nodeId: voterId } = msg;
    if (!localVotes.has(strategyId)) {
        localVotes.set(strategyId, { likes: new Map(), dislikes: new Map() });
    }
    const votes = localVotes.get(strategyId);
    if (isLike) {
        votes.likes.set(voterId, msg.timestamp);
        votes.dislikes.delete(voterId); // 撤销点踩
    } else {
        votes.dislikes.set(voterId, msg.timestamp);
        votes.likes.delete(voterId); // 撤销点赞
    }
    // 同步到 IndexedDB
    updateVoteInDB(strategyId, votes);
}

async function updateVoteInDB(strategyId, votes) {
    if (!db) return;
    return new Promise((resolve) => {
        const tx = db.transaction(['strategies', 'vote_history'], 'readwrite');
        
        // 更新策略的投票计数
        const stratStore = tx.objectStore('strategies');
        const getReq = stratStore.get(strategyId);
        getReq.onsuccess = () => {
            const strategy = getReq.result;
            if (strategy) {
                strategy.likes = votes.likes.size;
                strategy.dislikes = votes.dislikes.size;
                stratStore.put(strategy);
            }
        };
        
        // 保存投票详情到 vote_history (用于恢复)
        const voteStore = tx.objectStore('vote_history');
        const votesDetail = {
            strategyId,
            likes: Array.from(votes.likes.entries()),    // 转换为可序列化格式
            dislikes: Array.from(votes.dislikes.entries()),
            timestamp: nowMs()
        };
        voteStore.put(votesDetail);
        
        tx.oncomplete = () => resolve();
    });
}

// 从 IndexedDB 恢复保存的投票数据到内存
async function loadVoteHistoryFromDB() {
    if (!db) return;
    return new Promise((resolve) => {
        const tx = db.transaction('vote_history', 'readonly');
        const store = tx.objectStore('vote_history');
        const req = store.getAll();
        req.onsuccess = () => {
            const records = req.result;
            records.forEach(record => {
                if (!localVotes.has(record.strategyId)) {
                    localVotes.set(record.strategyId, {
                        likes: new Map(),
                        dislikes: new Map()
                    });
                }
                const votes = localVotes.get(record.strategyId);
                // 恢复投票数据
                record.likes.forEach(([nodeId, ts]) => votes.likes.set(nodeId, ts));
                record.dislikes.forEach(([nodeId, ts]) => votes.dislikes.set(nodeId, ts));
            });
            console.log(`✅ 从 IndexedDB 恢复了 ${records.length} 个策略的投票数据`);
            resolve();
        };
        req.onerror = () => {
            console.error('加载投票历史失败');
            resolve();
        };
    });
}

// 本地投票操作（用户点钢/点踩时调用）
window.voteOnStrategy = async function(strategyId, isLike) {
    broadcastVote(strategyId, isLike);
    // 立即更新本地卡片显示
    const strategy = get_strategies().find(s => s.id === strategyId);
    if (strategy) {
        if (isLike) {
            strategy.likes++;
        } else {
            strategy.dislikes++;
        }
        renderStrategies();
        // 同时保存到 IndexedDB 以持久化投票计数
        await saveStrategyToDB(strategy);
    }
};

// —— 索引共享：对等节点相互分享他们的策略索引 ——
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
    const event = new StorageEvent("storage", { key: "p2p_msg" });
    window.dispatchEvent(event);
}

function handleIndexShare(msg) {
    const { nodeId: peerId, strategies } = msg;
    if (!peerIndices.has(peerId)) {
        peerIndices.set(peerId, { strategies: [], timestamp: nowMs() });
    }
    peerIndices.get(peerId).strategies = strategies;
    peerIndices.get(peerId).timestamp = msg.timestamp;
}

// 聚合所有对等节点的搜索结果
async function aggregateSearch(q, limit) {
    try {
        // 1. 本地搜索
        const localHits = await search(q, limit);
        
        // 2. 聚合对等节点搜索结果
        const cutoff = nowMs() - NODE_TTL;
        const peerResults = [];
        
        for (const [peerId, peerData] of peerIndices) {
            if (peerData.timestamp < cutoff) {
                peerIndices.delete(peerId);
                continue;
            }
            
            // 对对等节点的策略进行本地 BM25 索引计算
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
        
        // 3. 合并结果并按加权得分排序
        const allResults = [
            ...localHits,
            ...peerResults
        ].map(r => {
            // 调整得分：加入全局投票权重
            const votes = localVotes.get(r.id) || { likes: new Map(), dislikes: new Map() };
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
        const results = allResults
            .filter(r => {
                if (seen.has(r.id)) return false;
                seen.add(r.id);
                return true;
            })
            .sort((a, b) => b.weighted_score - a.weighted_score)
            .slice(0, limit);
        
        return results;
    } catch (err) {
        console.error('聚合搜索失败：', err);
        return [];
    }
}

// 计算策略对查询的相关性（简化的 BM25）
function calculateRelevance(query, strategy) {
    const searchText = `${strategy.title} ${strategy.description} ${strategy.counter_lineup} ${strategy.counter_tech}`.toLowerCase();
    const terms = query.split(/\s+/).filter(Boolean);
    
    let score = 0;
    terms.forEach(term => {
        const lowerTerm = term.toLowerCase();
        // 标题权重 3x
        if (strategy.title.toLowerCase().includes(lowerTerm)) score += 3;
        // 目标权重 2x
        if (strategy.target_hero.toLowerCase().includes(lowerTerm)) score += 2;
        // 描述/阵容/科技权重 1x
        if (searchText.includes(lowerTerm)) score += 1;
    });
    
    // 基础分数增加策略得分
    return score + (strategy.score * 0.1);
}

// —— 搜索：输入监听 + 渲染命中 ——
function bindSearchBox() {
    const input = document.getElementById("q");
    if (!input) return;
    const debounced = debounce(() => {
        const q = input.value.trim();
        runSearch(q);
    }, 150);
    input.addEventListener("input", debounced);
}

async function runSearch(q) {
    const box = document.getElementById("search-results");
    if (!box) return;
    if (!q) {
        box.innerHTML = `<div class="muted">请输入关键词进行检索</div>`;
        return;
    }
    try {
        // 使用分布式聚合搜索
        const hits = await aggregateSearch(q, 20);
        renderSearchHitsWithVotes(hits, q);
    } catch (err) {
        console.error("搜索失败：", err);
    }
}

function renderSearchHitsWithVotes(hits, q) {
    const box = document.getElementById("search-results");
    if (!hits || hits.length === 0) {
        box.innerHTML = `<div class="muted">未找到匹配项</div>`;
        return;
    }
    const hi = (s) => highlight(s, q);
    box.innerHTML = hits.map((h, idx) => `
     <div class="hit ${h.doc_type}">
       <div class="hit-type">[${h.doc_type}] #${idx + 1}</div>
       <div class="hit-title">${hi(escapeHtml(h.title))}</div>
       <div class="hit-snippet">${hi(escapeHtml(h.snippet || h.description || ''))}</div>
       <div class="hit-meta">
         <span>🎯 ${h.target_hero}</span>
         <span>👥 ${h.counter_lineup}</span>
         <span>🔧 ${h.counter_tech}</span>
       </div>
       <div class="hit-vote">
         <button class="vote-btn" onclick="voteOnStrategy('${h.id}', true)">👍 ${h.vote_info?.likes || 0}</button>
         <button class="vote-btn" onclick="voteOnStrategy('${h.id}', false)">👎 ${h.vote_info?.dislikes || 0}</button>
         <span class="hit-score">得分: ${h.weighted_score.toFixed(2)}</span>
       </div>
     </div>
   `).join("");
}

// —— 小工具：防抖 & 高亮 & 转义 ——
function debounce(fn, ms) {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
function escapeHtml(s) {
    if (!s) return '';
    return s.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
function highlight(text, q) {
    if (!q || !text) return text;
    // 简单词切分高亮（按空白拆分）；可换为更精细的分词
    const terms = q.split(/\s+/).filter(Boolean).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!terms.length) return text;
    const re = new RegExp(`(${terms.join('|')})`, 'ig');
    return text.replace(re, '<mark>$1</mark>');
}

// 定期广播索引共享
function startIndexBroadcast() {
    setInterval(() => {
        if (isNetworkConnected()) {
            broadcastIndexShare();
        }
    }, 5000); // 每 5 秒广播一次本地索引
}

start();
startIndexBroadcast();