import init, {
    create_strategy,
    get_strategies,
    load_official_data,
    p2p_receive_json,
    create_p2p_node,
    search,                  // ✅ 新增：WASM 本地全文检索
} from './pkg/demacia_rise.js';

let p2pNode;

async function start() {
    await init();
    p2pNode = create_p2p_node();
    console.log("✅ WASM 初始化完成");

    // 加载官方数据（内部会重建索引）
    await loadHeroData();

    // 绑定搜索框监听（防抖）
    bindSearchBox();

    // 实时刷新策略
    setInterval(renderStrategies, 1000);
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

// 监听 P2P 消息
window.addEventListener("storage", (e) => {
    if (e.key === "p2p_msg") {
        p2p_receive_json(e.newValue);
        // 若有搜索词，收到新策略后立即刷新命中
        const q = document.getElementById("q")?.value?.trim();
        if (q) runSearch(q);
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