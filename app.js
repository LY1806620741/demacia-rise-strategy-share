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

function nowMs() { return Date.now(); }

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

// 渲染策略
function renderStrategies() {
    const list = get_strategies();
    const el = document.getElementById("strategy-list");
    el.innerHTML = "";

    list.forEach(s => {
        el.innerHTML += `
       <div class="card" data-id="${s.id}">
         <h4>${s.title}</h4>
         <p>${s.description}</p>
         <div class="vote">
           <span>👍 ${s.likes}</span>
           <span>👎 ${s.dislikes}</span>
           <span>评分: ${s.score.toFixed(1)}</span>
         </div>
       </div>`;
    });
}

// 提交战术（P2P 广播）
window.submitStrategy = function () {
    const title = document.getElementById("title").value;
    const desc = document.getElementById("desc").value;
    if (!title || !desc) return;

    const id = crypto.randomUUID();
    create_strategy(id, title, desc, "garen");

    document.getElementById("title").value = "";
    document.getElementById("desc").value = "";
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
        p2p_receive_json(e.newValue);
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
        const hits = await search(q, 20); // 调用 WASM 检索
        renderSearchHits(hits, q);
    } catch (err) {
        console.error("搜索失败：", err);
    }
}

function renderSearchHits(hits, q) {
    const box = document.getElementById("search-results");
    if (!hits || hits.length === 0) {
        box.innerHTML = `<div class="muted">未找到匹配项</div>`;
        return;
    }
    const hi = (s) => highlight(s, q);
    box.innerHTML = hits.map(h => `
     <div class="hit ${h.doc_type}">
       <div class="hit-type">[${h.doc_type}]</div>
       <div class="hit-title">${hi(escapeHtml(h.title))}</div>
       <div class="hit-snippet">${hi(escapeHtml(h.snippet))}</div>
       <div class="hit-score">rank: ${h.rank.toFixed(2)}</div>
     </div>
   `).join("");
}

// —— 小工具：防抖 & 高亮 & 转义 ——
function debounce(fn, ms) {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
function highlight(text, q) {
    if (!q) return text;
    // 简单词切分高亮（按空白拆分）；可换为更精细的分词
    const terms = q.split(/\s+/).filter(Boolean).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!terms.length) return text;
    const re = new RegExp(`(${terms.join('|')})`, 'ig');
    return text.replace(re, '<mark>$1</mark>');
}

start();