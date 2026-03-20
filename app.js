import init, {
    create_strategy,
    get_strategies,
    load_official_data,
    p2p_receive_json,
    create_p2p_node,
    search,
    recommend_strategies_for_enemy,  // 🆕 阵容相似度推荐
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
        const res = await fetch('./config.json');
        config = await res.json();
        populateFormSelects();
    } catch (e) {
        console.error('加载配置文件失败', e);
    }
}

function populateFormSelects() {
    if (!config) return;

    // 填充敌人选择（用于查询）
    const searchByEnemySelect = document.getElementById('search-by-enemy');
    searchByEnemySelect.innerHTML = '<option value="">选择敌人阵容，查询最佳防守方案...</option>';
    config.enemy_compositions.forEach(comp => {
        const opt = document.createElement('option');
        opt.value = comp.id;
        opt.textContent = `${comp.name}（威胁度: ${comp.threat_level}）`;
        searchByEnemySelect.appendChild(opt);
    });

    // 填充阵容多选（从所有单位中选择，最多8个）
    const lineupSelect = document.getElementById('lineup-select');
    lineupSelect.innerHTML = '';
    lineupSelect.multiple = true;
    lineupSelect.size = 10; // 显示更多选项
    
    // 添加分组: 德玛西亚
    const demaciaGroup = document.createElement('optgroup');
    demaciaGroup.label = '德玛西亚';
    config.units.demacia.forEach(unit => {
        const opt = document.createElement('option');
        opt.value = unit.id;
        opt.textContent = `${unit.name} (${unit.type})`;
        demaciaGroup.appendChild(opt);
    });
    lineupSelect.appendChild(demaciaGroup);
    
    // 添加分组: 诺克萨斯
    const noxusGroup = document.createElement('optgroup');
    noxusGroup.label = '诺克萨斯';
    config.units.noxus.forEach(unit => {
        const opt = document.createElement('option');
        opt.value = unit.id;
        opt.textContent = `${unit.name} (${unit.type})`;
        noxusGroup.appendChild(opt);
    });
    lineupSelect.appendChild(noxusGroup);
    
    // 添加分组: 其他
    const otherGroup = document.createElement('optgroup');
    otherGroup.label = '其他单位';
    config.units.other.forEach(unit => {
        const opt = document.createElement('option');
        opt.value = unit.id;
        opt.textContent = `${unit.name} (${unit.type})`;
        otherGroup.appendChild(opt);
    });
    lineupSelect.appendChild(otherGroup);

    // 填充科技树复选，按主城等级区分
    const techTree = document.getElementById('tech-tree');
    techTree.innerHTML = '';
    config.tech_tree.forEach(chapter => {
        const chapterDiv = document.createElement('div');
        chapterDiv.className = 'tech-chapter';
        const title = document.createElement('h4');
        title.textContent = `主城等级 ${chapter.chapter}：${chapter.name}`;
        const desc = document.createElement('p');
        desc.style.fontSize = '0.85rem';
        desc.style.color = '#999';
        desc.textContent = chapter.description;
        chapterDiv.appendChild(title);
        chapterDiv.appendChild(desc);

        chapter.techs.forEach(tech => {
            const label = document.createElement('label');
            label.className = 'tech-checkbox';
            label.title = `${tech.effect} - ${tech.description}`;
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = tech.id;
            checkbox.title = tech.description;
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(` ${tech.name} (${tech.effect})`));
            chapterDiv.appendChild(label);
        });

        techTree.appendChild(chapterDiv);
    });

    // 初始化拖放功能
    initDragAndDrop();
}

function initDragAndDrop() {
    // 为阵容选择添加拖放功能
    const lineupSelect = document.getElementById('lineup-select');
    const selectedLineup = document.getElementById('selected-lineup');
    
    // 使选项可拖动
    lineupSelect.addEventListener('dragstart', (e) => {
        if (e.target.tagName === 'OPTION') {
            e.dataTransfer.setData('text/plain', e.target.value);
            e.dataTransfer.effectAllowed = 'copy';
        }
    });
    
    // 使selected-lineup可接收拖放
    selectedLineup.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });
    
    selectedLineup.addEventListener('drop', (e) => {
        e.preventDefault();
        const unitId = e.dataTransfer.getData('text/plain');
        if (unitId && selectedLineup.children.length < 8) { // 最多8个
            addUnitToLineup(unitId);
        }
    });
    
    // 双击添加
    lineupSelect.addEventListener('dblclick', (e) => {
        if (e.target.tagName === 'OPTION' && selectedLineup.children.length < 8) {
            addUnitToLineup(e.target.value);
        }
    });
}

function addUnitToLineup(unitId) {
    const selectedLineup = document.getElementById('selected-lineup');
    
    // 检查是否已存在
    if (Array.from(selectedLineup.children).some(div => div.dataset.unitId === unitId)) {
        return;
    }
    
    // 找到单位信息
    let unit = null;
    for (const faction of ['demacia', 'noxus', 'other']) {
        unit = config.units[faction].find(u => u.id === unitId);
        if (unit) break;
    }
    if (!unit) return;
    
    // 创建单位div
    const unitDiv = document.createElement('div');
    unitDiv.className = 'lineup-unit';
    unitDiv.dataset.unitId = unitId;
    unitDiv.draggable = true;
    unitDiv.innerHTML = `
        <span class="unit-icon">${unit.name.charAt(0)}</span>
        <span class="unit-name">${unit.name}</span>
        <button class="remove-unit" onclick="removeUnitFromLineup('${unitId}')">×</button>
    `;
    
    // 添加拖放事件
    unitDiv.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', unitId);
        e.dataTransfer.effectAllowed = 'move';
    });
    
    selectedLineup.appendChild(unitDiv);
    updateLineupInput();
}

function removeUnitFromLineup(unitId) {
    const selectedLineup = document.getElementById('selected-lineup');
    const unitDiv = selectedLineup.querySelector(`[data-unit-id="${unitId}"]`);
    if (unitDiv) {
        unitDiv.remove();
        updateLineupInput();
    }
}

function updateLineupInput() {
    const selectedLineup = document.getElementById('selected-lineup');
    const unitIds = Array.from(selectedLineup.children).map(div => div.dataset.unitId);
    document.getElementById('lineup').value = unitIds.join(',');
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
    document.getElementById('community-strategy-count').textContent = String(dataCount);

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

// 🆕 标签切换功能
window.switchTab = function(tabName) {
    // 隐藏所有标签内容
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(tab => tab.classList.remove('active'));
    
    // 取消所有标签按钮的活跃状态
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(btn => btn.classList.remove('active'));
    
    // 显示新标签
    const activeTab = document.getElementById(tabName);
    if (activeTab) {
        activeTab.classList.add('active');
    }
    
    // 激活对应的按钮
    event.target.classList.add('active');
};

// 🆕 敌人配队管理
let enemyQueue = [];

window.addEnemyUnit = function() {
    const select = document.getElementById('enemy-unit-select');
    if (!select.value) {
        alert('请选择敌人单位');
        return;
    }
    
    // 从配置中找到单位信息
    let unitName = select.value;
    if (config) {
        for (const faction of ['demacia', 'noxus', 'other']) {
            const unit = config.units[faction]?.find(u => u.id === select.value);
            if (unit) {
                unitName = unit.name;
                break;
            }
        }
    }
    
    enemyQueue.push({ id: select.value, name: unitName, quantity: 1 });
    renderEnemyQueue();
};

function renderEnemyQueue() {
    const editor = document.getElementById('enemy-units-editor');
    if (enemyQueue.length === 0) {
        editor.innerHTML = '<div class="muted">敌人配队将显示在这里</div>';
        return;
    }
    
    let html = '';
    enemyQueue.forEach((unit, idx) => {
        html += `
            <div style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; background: #2a2a2a; border-radius: 4px; margin: 0.3rem 0;">
                <span>${unit.name}</span>
                <input type="number" min="1" value="${unit.quantity}" 
                    onchange="updateEnemyQuantity(${idx}, this.value)" 
                    style="width: 50px; padding: 0.3rem; background: #1a1a1a; color: #fff; border: 1px solid #444;">
                <button onclick="removeEnemyUnit(${idx})" style="width: auto; padding: 0.2rem 0.5rem; background: #d32f2f;">-</button>
            </div>
        `;
    });
    editor.innerHTML = html;
}

window.updateEnemyQuantity = function(idx, value) {
    enemyQueue[idx].quantity = parseInt(value) || 1;
};

window.removeEnemyUnit = function(idx) {
    enemyQueue.splice(idx, 1);
    renderEnemyQueue();
};

// 🆕 根据敌人阵容推荐策略（使用相似度计算）
window.searchByEnemyLineup = async function() {
    const presetSelect = document.getElementById('search-enemy-preset');
    const customInput = document.getElementById('search-enemy-custom');
    
    let enemyLineup = presetSelect.value || customInput.value;
    
    if (!enemyLineup || !enemyLineup.trim()) {
        alert('请选择或输入敌人阵容');
        return;
    }
    
    const resultContainer = document.getElementById('similarity-recommendations');
    resultContainer.innerHTML = '<div class="muted">正在搜索相似策略...</div>';
    
    try {
        // 调用 WASM 函数进行相似度推荐
        const recommendations = recommend_strategies_for_enemy(enemyLineup, 10);
        
        if (!recommendations || recommendations.length === 0) {
            resultContainer.innerHTML = '<div class="muted">未找到对应的防守策略，请尝试其他阵容</div>';
            return;
        }
        
        let html = '<h3>推荐防守方案（按相似度排序）</h3>';
        recommendations.forEach((rec, idx) => {
            const similarity = Math.round(rec.similarity_score * 100);
            html += `
                <div style="background: #2a2a2a; padding: 1rem; border-radius: 8px; margin: 0.5rem 0; border-left: 4px solid ${similarity > 70 ? '#4caf50' : '#ff9800'};">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <h4 style="margin: 0;">方案 ${idx + 1} - 相似度: ${similarity}%</h4>
                        <span style="background: ${similarity > 70 ? '#4caf50' : '#ff9800'}; color: #000; padding: 0.3rem 0.8rem; border-radius: 4px; font-weight: bold;">
                            ${similarity > 70 ? '高度匹配' : '部分匹配'}
                        </span>
                    </div>
                    <p style="color: #aaa; margin: 0.5rem 0;">推荐阵容：<strong>${rec.counter_lineup}</strong></p>
                    <button onclick="adoptStrategy('${rec.strategy_id}')" style="width: auto; padding: 0.4rem 0.8rem;">采纳此方案</button>
                </div>
            `;
        });
        resultContainer.innerHTML = html;
    } catch (e) {
        console.error('搜索失败', e);
        resultContainer.innerHTML = '<div class="muted">搜索出错，请重试</div>';
    }
};

// 🆕 更新数据统计面板
async function updateDashboard() {
    try {
        // 官方数据统计
        const officialData = await load_official_data();
        if (officialData) {
            document.getElementById('official-hero-count').textContent = String(officialData.heroes?.length || 0);
            document.getElementById('official-building-count').textContent = String(officialData.buildings?.length || 0);
        }
        
        // 本地数据统计
        const localStrategies = await loadStrategiesFromDB();
        document.getElementById('local-strategy-count').textContent = String(localStrategies.length);
        
        // 社区策略统计
        const communityStrategies = get_strategies();
        document.getElementById('community-strategy-count').textContent = String(Array.isArray(communityStrategies) ? communityStrategies.length : 0);
    } catch (e) {
        console.error('更新面板失败', e);
    }
}

// 🆕 加载官方推荐方案
async function loadOfficialRecommendations() {
    try {
        const officialData = await load_official_data();
        if (!officialData || !officialData.heroes) {
            return;
        }
        
        const container = document.getElementById('official-recommendations-container');
        let html = '';
        
        // 基于豆包报告中的建议，展示官方推荐
        const recommendations = [
            {
                title: '对抗诺克萨斯龙犬',
                description: '根据报告，龙犬是远程闪避单位，推荐使用近战单位克制',
                counterUnits: '卫兵 × 3 + 士兵 × 2',
                threatLevel: '⭐⭐⭐⭐'
            },
            {
                title: '对抗部落战士',
                description: '近战克制远程，需要坦克防守或远程输出',
                counterUnits: '士兵 × 5 + 卫兵 × 3',
                threatLevel: '⭐⭐⭐'
            },
            {
                title: '对抗龙蜥飞行单位',
                description: '飞行单位需要游侠或特定英雄应对',
                counterUnits: '游侠 × 3 + 盖伦 × 1',
                threatLevel: '⭐⭐⭐⭐⭐'
            },
            {
                title: '均衡防守方案',
                description: '通用高效方案，适合大多数场景',
                counterUnits: '卫兵 × 4 + 弓兵 × 2 + 加里奥 × 1',
                threatLevel: '⭐⭐⭐'
            }
        ];
        
        recommendations.forEach(rec => {
            html += `
                <div style="background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%); padding: 1.2rem; border-radius: 8px; border-left: 4px solid #ffc107; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">
                    <h4 style="margin: 0 0 0.5rem 0; color: #ffc107;">${rec.title}</h4>
                    <p style="margin: 0 0 0.5rem 0; color: #aaa; font-size: 0.9rem;">${rec.description}</p>
                    <div style="background: #1a1a1a; padding: 0.8rem; border-radius: 4px; margin: 0.5rem 0;">
                        <strong style="color: #4caf50;">推荐防守：</strong> ${rec.counterUnits}
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.5rem;">
                        <span style="color: #ff6f00;">难度等级：${rec.threatLevel}</span>
                        <button onclick="adoptOfficialStrategy('${rec.title}')" style="width: auto; padding: 0.4rem 0.8rem; background: #ffc107; color: #000; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">采用方案</button>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
    } catch (e) {
        console.error('加载官方推荐失败', e);
    }
}

window.adoptStrategy = function(strategyId) {
    alert(`已采纳策略 ${strategyId}，系统将在战斗页面中应用此方案`);
};

window.adoptOfficialStrategy = function(strategyTitle) {
    alert(`已采纳方案：${strategyTitle}，请在战斗策略编辑页面配置详细参数`);
};

// 🆕 提交战斗策略
window.submitBattleStrategy = function() {
    const title = document.getElementById('battle-strategy-title').value;
    const desc = document.getElementById('battle-strategy-desc').value;
    const tech = document.getElementById('battle-strategy-tech').value;
    
    if (!title || !desc) {
        alert('请填写标题和描述');
        return;
    }
    
    // 获取敌人配队
    const enemyLineupStr = enemyQueue.map(u => u.name).join(',');
    
    // 生成策略 ID
    const strategyId = `battle_${crypto.randomUUID().slice(0, 8)}`;
    
    // 提交策略
    create_strategy(
        strategyId,
        title,
        desc,
        enemyLineupStr,
        '待配置',  // counter_lineup 待用户在下一步配置
        tech
    );
    
    alert('✅ 战斗策略已发布到德玛西亚网络！');
    document.getElementById('battle-strategy-title').value = '';
    document.getElementById('battle-strategy-desc').value = '';
    enemyQueue = [];
    renderEnemyQueue();
};

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

    // 🆕 加载仪表盘数据和官方推荐
    updateDashboard();
    loadOfficialRecommendations();
    
    // 🆕 更新敌人选择列表
    if (config && config.enemy_compositions) {
        const presetSelect = document.getElementById('search-enemy-preset');
        presetSelect.innerHTML = '<option value="">-- 选择预设敌人阵容 --</option>';
        config.enemy_compositions.forEach(comp => {
            const opt = document.createElement('option');
            opt.value = comp.units.join(',');
            opt.textContent = `${comp.name}（威胁度: ${comp.threat_level}）`;
            presetSelect.appendChild(opt);
        });
    }
    
    // 🆕 更新敌人单位选择列表
    if (config) {
        const enemyUnitSelect = document.getElementById('enemy-unit-select');
        if (enemyUnitSelect && config.units) {
            enemyUnitSelect.innerHTML = '<option value="">-- 选择敌人单位 --</option>';
            for (const faction of ['noxus', 'demacia', 'other']) {
                if (config.units[faction]) {
                    config.units[faction].forEach(unit => {
                        const opt = document.createElement('option');
                        opt.value = unit.id;
                        opt.textContent = `${unit.name} (${unit.type})`;
                        enemyUnitSelect.appendChild(opt);
                    });
                }
            }
        }
    }
    
    // 🆕 初始化防守单位列表
    if (config && config.units) {
        const counterContainer = document.getElementById('counter-units-available');
        counterContainer.innerHTML = '';
        for (const faction of ['demacia', 'noxus']) {
            if (config.units[faction]) {
                config.units[faction].forEach(unit => {
                    const unitDiv = document.createElement('div');
                    unitDiv.style.css = 'padding: 0.4rem 0.8rem; background: #2a2a2a; border-radius: 4px; cursor: move;';
                    unitDiv.textContent = unit.name;
                    unitDiv.draggable = true;
                    unitDiv.ondragstart = (e) => {
                        e.dataTransfer.effectAllowed = 'copy';
                        e.dataTransfer.setData('text/plain', JSON.stringify({
                            id: unit.id,
                            name: unit.name,
                            type: unit.type
                        }));
                    };
                    counterContainer.appendChild(unitDiv);
                });
            }
        }
    }
    
    // 🆕 设置防守单位拖放容器
    const counterSelected = document.getElementById('counter-units-selected');
    counterSelected.ondragover = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    };
    counterSelected.ondrop = (e) => {
        e.preventDefault();
        try {
            const data = JSON.parse(e.dataTransfer.getData('text/plain'));
            const unitDiv = document.createElement('div');
            unitDiv.style.padding = '0.4rem 0.8rem';
            unitDiv.style.background = '#1a1a1a';
            unitDiv.style.border = '1px solid #4caf50';
            unitDiv.style.borderRadius = '4px';
            unitDiv.textContent = data.name;
            counterSelected.appendChild(unitDiv);
        } catch (e) {
            // 忽略无效数据
        }
    };

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
    const compositionId = document.getElementById('search-by-enemy').value;
    if (!compositionId) {
        document.getElementById('search-results-container').innerHTML = '';
        return;
    }

    const enemyComposition = config.enemy_compositions.find(c => c.id === compositionId);
    if (!enemyComposition) {
        document.getElementById('search-results-container').innerHTML = '<div class="muted">敌人阵容不存在</div>';
        return;
    }

    const container = document.getElementById('search-results-container');
    
    // 显示敌人阵容信息
    let enemyHtml = `
        <div style="background: #2a2a2a; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; border-left: 4px solid #d32f2f;">
            <h3>${enemyComposition.name} (威胁度: ${enemyComposition.threat_level})</h3>
            <p style="color: #ccc; margin-top: 0.5rem;">${enemyComposition.description}</p>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 0.5rem; margin-top: 0.8rem;">
    `;
    
    // 显示敌人阵容中的主要单位
    const uniqueUnits = [...new Set(enemyComposition.units)];
    uniqueUnits.forEach(unitId => {
        let unitName = unitId;
        // 从各个单位列表中找
        const allUnits = [...config.units.demacia, ...config.units.noxus, ...config.units.other];
        const unit = allUnits.find(u => u.id === unitId);
        if (unit) unitName = unit.name;
        enemyHtml += `<span style="background: #1a1a1a; padding: 0.4rem 0.8rem; border-radius: 4px; font-size: 0.9rem;">⚔️ ${unitName}</span>`;
    });
    
    enemyHtml += `</div></div>`;
    
    // 从 IndexedDB 获取对应的策略
    const strategiesFromDB = await loadStrategiesFromDB();
    
    // 根据敌人阵容中包含的单位来搜索对应的防守方案
    const relevantStrategies = strategiesFromDB.filter(strat => {
        // 检查策略是否提到敌人阵容中的单位
        const stratText = (strat.counter_lineup + strat.counter_tech).toLowerCase();
        const enemyUnitNames = uniqueUnits.map(id => {
            const allUnits = [...config.units.demacia, ...config.units.noxus, ...config.units.other];
            const unit = allUnits.find(u => u.id === id);
            return unit ? unit.name.toLowerCase() : id.toLowerCase();
        });
        
        return enemyUnitNames.some(name => stratText.includes(name));
    });
    
    // 如果没有直接匹配，返回所有策略（让P2P聚合搜索）
    const strategies = relevantStrategies.length > 0 ? relevantStrategies : strategiesFromDB;
    
    if (!strategies || strategies.length === 0) {
        container.innerHTML = enemyHtml + '<div class="muted">暂无推荐方案，欢迎用户创建！</div>';
        return;
    }

    // 添加投票权重，并排序
    const strategies_with_votes = strategies.map(s => {
        const votes = localVotes.get(s.id) || { likes: new Map(), dislikes: new Map() };
        return {
            ...s,
            vote_count: votes.likes.size - votes.dislikes.size,
            likes: votes.likes.size,
            dislikes: votes.dislikes.size
        };
    });

    strategies_with_votes.sort((a, b) => {
        // 优先按投票差值排序
        const voteDiff = (b.likes - b.dislikes) - (a.likes - a.dislikes);
        if (voteDiff !== 0) return voteDiff;
        // 其次按策略评分排序
        return b.score - a.score;
    });

    const strategyHtml = strategies_with_votes.map((strat, idx) => {
        const votes = localVotes.get(strat.id) || { likes: new Map(), dislikes: new Map() };
        
        // 查找该策略涉及的科技
        const stratTechs = strat.counter_tech.split(',')
            .map(t => t.trim())
            .filter(t => t.length > 0);
        
        const techDetails = stratTechs.map(techName => {
            // 从config中查找科技详情
            for (const chapter of config.tech_tree) {
                const tech = chapter.techs.find(t => t.name.toLowerCase().includes(techName.toLowerCase()) || t.id === techName);
                if (tech) {
                    return `<li><strong>${tech.name}</strong>: ${tech.effect} - ${tech.description}</li>`;
                }
            }
            return `<li>${techName}</li>`;
        }).join('');
        
        return `
            <div class="card recommendation-card" style="margin-top: 1rem;">
                <h4>#${idx + 1} - ${strat.title}</h4>
                <div class="meta">
                    <span>🎯 目标平台</span>
                    <span>👥 阵容: <strong>${strat.counter_lineup}</strong></span>
                </div>
                <p>${strat.description}</p>
                ${techDetails ? `<div style="background: #1a2a3a; padding: 0.8rem; border-radius: 6px; margin: 0.8rem 0;"><strong style="color: #4dabf7;">推荐科技:</strong><ul style="margin: 0.5rem 0; padding-left: 1.2rem;">${techDetails}</ul></div>` : ''}
                <div class="vote">
                    <button class="vote-btn" onclick="voteOnStrategy('${strat.id}', true)">👍 ${votes.likes.size || strat.likes}</button>
                    <button class="vote-btn" onclick="voteOnStrategy('${strat.id}', false)">👎 ${votes.dislikes.size || strat.dislikes}</button>
                    <span class="hit-score">综合评分: ${(strat.score + votes.likes.size * 2 - votes.dislikes.size * 1).toFixed(1)}</span>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = enemyHtml + strategyHtml;
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