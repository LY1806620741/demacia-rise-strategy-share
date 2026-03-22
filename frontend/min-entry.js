import { state, NODE_TTL } from './state.js';
import { byId, wasmArray, debounce, escapeHtml, highlight, nowMs } from './utils.js';
import { loadConfig, renderBattleTechOptions, setupBattleTechPicker, renderEnemyUnitList, setupEnemyUnitPicker, setupCounterUnitSelection } from './config-ui.js';
import { getAllEnemyUnits, getAllTechOptions, getBuildings, getHeroes, getOfficialLineups, getResolvedTownDefenseRecommendations } from './data.js';
import init, { create_strategy, create_p2p_node, get_strategies, load_official_data, p2p_receive_history_json, p2p_receive_json, recommend_strategies_for_enemy, search, vote } from '../pkg/demacia_rise.js';

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const P2P_CHANNEL_NAME = 'demacia-rise-p2p';
const P2P_STORAGE_KEY = '__demacia_rise_p2p_bus__';
const MAX_SEEN_P2P_MESSAGES = 200;

function formatLineup(items) {
  return items.map(item => `${item.name} x${item.count}`).join(', ');
}

function getEnemyUnitPool() {
  return getAllEnemyUnits();
}

function getDefenseUnitPool() {
  const heroes = getHeroes().map(hero => ({ ...hero, isHero: true }));
  const units = Array.isArray(state.config?.units?.demacia) ? state.config.units.demacia : [];
  return [...heroes, ...units];
}

function getSelectedTechNames() {
  return Array.from(state.selectedBattleTechs);
}

function renderEditorTips() {
  const desc = byId('battle-strategy-desc');
  if (desc) desc.placeholder = '补充你的战术思路、站位、目标优先级、科技搭配与使用时机...';
}

function renderEnemyEditor(options = {}) {
  const { preserveDraft = false } = options;
  const editor = byId('enemy-units-editor');
  const textInput = byId('enemy-lineup-text-input');
  const dropzone = byId('enemy-lineup-dropzone');
  if (!editor || !dropzone) return;

  if (!state.enemyQueue.length) {
    editor.innerHTML = '<div class="muted">敌人配队将显示在这里</div>';
    dropzone.innerHTML = '<div class="muted">将单位拖拽至此，或在上方输入框编辑</div>';
    if (textInput) textInput.value = preserveDraft ? state.enemyLineupDraft : '';
    return;
  }

  editor.innerHTML = state.enemyQueue.map(item => `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:.5rem;background:#222;border:1px solid #444;border-radius:4px;padding:.45rem .6rem;margin-bottom:.4rem;">
      <div>
        <div style="font-weight:bold;">${escapeHtml(item.name)}</div>
        <div class="muted" style="font-size:.82rem;">${escapeHtml(item.id)} · ${item.count} 个</div>
      </div>
      <div style="display:flex;gap:.35rem;">
        <button type="button" onclick="changeEnemyUnitCount('${item.id}', -1)">-</button>
        <button type="button" onclick="changeEnemyUnitCount('${item.id}', 1)">+</button>
        <button type="button" onclick="removeEnemyUnit('${item.id}')">移除</button>
      </div>
    </div>
  `).join('');

  dropzone.innerHTML = state.enemyQueue.map(item => `
    <span style="display:inline-flex;align-items:center;gap:.35rem;background:#243447;border:1px solid #3d5a73;border-radius:999px;padding:.35rem .7rem;">
      <strong>${escapeHtml(item.name)}</strong>
      <span>x${item.count}</span>
    </span>
  `).join('');

  if (textInput && !preserveDraft) {
    const normalizedLineup = formatLineup(state.enemyQueue);
    state.enemyLineupDraft = normalizedLineup;
    textInput.value = normalizedLineup;
  }
}

function renderCounterSelection() {
  const selected = byId('counter-units-selected');
  if (!selected) return;

  if (!state.selectedCounterUnits.length) {
    selected.innerHTML = '<div class="muted">拖拽单位到这里</div>';
    return;
  }

  selected.innerHTML = state.selectedCounterUnits.map((unit, index) => `
    <div style="display:inline-flex;align-items:center;gap:.4rem;background:#213127;border:1px solid #3f6b4f;border-radius:999px;padding:.35rem .65rem;">
      <span>${escapeHtml(unit.name)}${unit.isHero ? '（英雄）' : ''}</span>
      <button type="button" onclick="removeCounterUnit(${index})" style="padding:0 .35rem;line-height:1;">×</button>
    </div>
  `).join('');
}

function updateDashboard() {
  const strategies = wasmArray(get_strategies());
  const stateLabel = byId('p2p-network-state');
  const light = byId('p2p-status-light');
  const nodeCount = byId('p2p-node-count');
  const communityCount = byId('community-strategy-count');
  const localCount = byId('local-strategy-count');
  const heroCount = byId('official-hero-count');
  const buildingCount = byId('official-building-count');
  const activeNodeCount = state.knownNodes.size;

  if (stateLabel) stateLabel.textContent = state.p2pNode ? (activeNodeCount > 1 ? '已连接' : '在线') : '离线';
  if (light) light.className = `status-light ${state.p2pNode ? 'online' : 'offline'}`;
  if (nodeCount) nodeCount.textContent = String(activeNodeCount);
  if (communityCount) communityCount.textContent = String(strategies.length);
  if (localCount) localCount.textContent = String(strategies.length);
  if (heroCount) heroCount.textContent = String(getHeroes().length);
  if (buildingCount) buildingCount.textContent = String(getBuildings().length);
}

function renderOfficialLineups() {
  const container = byId('official-recommendations-container');
  if (!container) return;
  const townRecommendations = getResolvedTownDefenseRecommendations();
  const fallbackCompositions = getOfficialLineups();
  const techs = getAllTechOptions();

  if (townRecommendations.length) {
    container.innerHTML = townRecommendations.map(entry => `
      <div style="background:#171717;border:1px solid #333;border-radius:12px;padding:1rem;display:grid;gap:.85rem;">
        <div style="display:flex;justify-content:space-between;gap:.75rem;align-items:flex-start;">
          <div>
            <h4 style="margin:0;color:#ffd54f;">${escapeHtml(entry.town.name)}</h4>
            <div class="muted" style="margin-top:.2rem;">地区：${escapeHtml(entry.town.region || entry.region || '未知')}</div>
          </div>
          <span class="muted">${entry.waves.length} 个来袭波次</span>
        </div>
        <div class="muted">${escapeHtml(entry.notes || '暂无额外说明')}</div>
        ${entry.waves.map(wave => {
          const incomingEnemyText = wave.incoming_enemy_text || (wave.incomingEnemies.length ? wave.incomingEnemies.map(enemy => enemy.name).join('、') : '未配置');
          const lineupText = wave.recommended_lineup_text || (wave.recommendedLineup.length ? wave.recommendedLineup.map(unit => unit.name).join('、') : '未配置');
          const techText = wave.recommendedTechs.length ? wave.recommendedTechs.map(tech => tech.name).join('、') : '未配置';
          return `
          <div style="border:1px solid #2f2f2f;border-radius:10px;padding:.9rem;background:#111;display:grid;gap:.45rem;">
            <strong style="color:#9fd3ff;">${escapeHtml(wave.label || wave.wave_id || '来袭波次')}</strong>
            <div><strong>来袭敌人：</strong>${escapeHtml(incomingEnemyText)}</div>
            <div><strong>推荐阵容：</strong>${escapeHtml(lineupText)}</div>
            <div><strong>推荐科技：</strong>${escapeHtml(techText)}</div>
            ${wave.required_tech_text ? `<div><strong>必需研究：</strong>${escapeHtml(wave.required_tech_text)}</div>` : ''}
            ${wave.optional_tech_text ? `<div><strong>可选研究：</strong>${escapeHtml(wave.optional_tech_text)}</div>` : ''}
            ${wave.tactic ? `<div class="muted"><strong>诀窍：</strong>${escapeHtml(wave.tactic)}</div>` : ''}
          </div>
        `;
        }).join('')}
      </div>
    `).join('');
    return;
  }

  if (!fallbackCompositions.length) {
    container.innerHTML = '<div class="muted">暂无官方阵容数据</div>';
    return;
  }

  container.innerHTML = fallbackCompositions.map((comp, index) => {
    const tech = techs[index % Math.max(techs.length, 1)];
    const suggestedCounter = getDefenseUnitPool().slice(index % 3, (index % 3) + 3).map(unit => unit.name).join('、') || '卫兵、游侠';
    return `
      <div style="background:#171717;border:1px solid #333;border-radius:10px;padding:1rem;display:grid;gap:.45rem;">
        <div style="display:flex;justify-content:space-between;gap:.5rem;align-items:center;">
          <h4 style="margin:0;color:#ffd54f;">${escapeHtml(comp.name)}</h4>
          <span class="muted">威胁 ${comp.threat_level || '-'}</span>
        </div>
        <div class="muted">${escapeHtml(comp.description || '')}</div>
        <div><strong>敌人组成：</strong>${escapeHtml((comp.units || []).join('、'))}</div>
        <div><strong>推荐应对：</strong>${escapeHtml(suggestedCounter)}</div>
        <div><strong>推荐科技：</strong>${escapeHtml(tech?.name || '战场扩增')}</div>
      </div>
    `;
  }).join('');
}

function renderHeroList() {
  const list = byId('hero-list');
  if (!list) return;
  const heroes = getHeroes();
  list.innerHTML = heroes.length
    ? heroes.map(hero => `
      <div style="background:#1b1b1b;border:1px solid #333;border-radius:8px;padding:.8rem;margin-bottom:.6rem;">
        <strong>${escapeHtml(hero.name)}</strong>
        <div class="muted">${escapeHtml(hero.id)} · ${escapeHtml(hero.type || '')}</div>
        <div style="margin-top:.25rem;">${escapeHtml(hero.description || '')}</div>
      </div>
    `).join('')
    : '<div class="muted">暂无官方英雄数据</div>';
}

function buildStrategyTitle(description, target) {
  const desc = (description || '').trim();
  if (desc) return desc.length > 24 ? `${desc.slice(0, 24)}…` : desc;
  return target ? `针对 ${target}` : '未命名策略';
}

function renderCommunityLineups() {
  const list = byId('strategy-list');
  if (!list) return;
  const strategies = wasmArray(get_strategies());
  list.innerHTML = strategies.length
    ? strategies.slice().reverse().map(strategy => {
      const displayTitle = strategy.description || strategy.title || '未命名策略';
      return `
        <div style="background:#171717;border:1px solid #333;border-radius:10px;padding:1rem;margin-bottom:.8rem;">
          <div style="display:flex;justify-content:space-between;gap:.5rem;align-items:center;">
            <strong>${escapeHtml(displayTitle)}</strong>
            <span class="muted">评分 ${Number(strategy.score || 0).toFixed(1)}</span>
          </div>
          <div style="margin:.45rem 0;"><strong>敌人阵容：</strong>${escapeHtml(strategy.target_hero || '未填写')}</div>
          <div style="margin:.45rem 0;"><strong>应对阵容：</strong>${escapeHtml(strategy.counter_lineup || '未填写')}</div>
          <div style="margin:.45rem 0;"><strong>科技：</strong>${escapeHtml(strategy.counter_tech || '未填写')}</div>
          <div class="muted">${escapeHtml(strategy.description || '暂无说明')}</div>
          <div style="display:flex;gap:.5rem;margin-top:.75rem;">
            <button type="button" onclick="voteStrategy('${strategy.id}', true)">👍 ${strategy.likes || 0}</button>
            <button type="button" onclick="voteStrategy('${strategy.id}', false)">👎 ${strategy.dislikes || 0}</button>
          </div>
        </div>
      `;
    }).join('')
    : '<div class="muted">暂无社区策略，快发布第一条吧</div>';

  updateDashboard();
}

function markPeerSeen(nodeId, meta = {}) {
  if (!nodeId || nodeId === state.nodeId) return;
  state.knownNodes.set(nodeId, { ...state.knownNodes.get(nodeId), ...meta, lastSeen: nowMs() });
}

function rememberP2PMessage(messageId) {
  if (!messageId || state.seenP2PMessages.has(messageId)) return false;
  state.seenP2PMessages.add(messageId);
  if (state.seenP2PMessages.size > MAX_SEEN_P2P_MESSAGES) {
    const firstKey = state.seenP2PMessages.values().next().value;
    if (firstKey) state.seenP2PMessages.delete(firstKey);
  }
  return true;
}

function receiveStrategyPayload(json, sourceNodeId) {
  if (sourceNodeId && sourceNodeId !== state.nodeId) {
    markPeerSeen(sourceNodeId, { transport: 'browser-local' });
    p2p_receive_json(json);
    renderCommunityLineups();
    renderSearchResults();
    updateDashboard();
  }
}

function sendHistoryToNode(targetNodeId) {
  if (!targetNodeId || targetNodeId === state.nodeId) return;
  const strategies = wasmArray(get_strategies());
  if (!strategies.length) return;
  broadcastP2PEnvelope('history_response', JSON.stringify(strategies), { targetNodeId });
}

function importHistoryPayload(payload, sourceNodeId) {
  if (!payload || sourceNodeId === state.nodeId) return;
  markPeerSeen(sourceNodeId, { transport: 'browser-local' });
  p2p_receive_history_json(payload);
  renderCommunityLineups();
  renderSearchResults();
  updateDashboard();
}

function handleP2PEnvelope(envelope) {
  if (!envelope || envelope.sourceNodeId === state.nodeId) return;
  if (envelope.targetNodeId && envelope.targetNodeId !== state.nodeId) return;
  if (envelope.messageId && !rememberP2PMessage(envelope.messageId)) return;

  if (envelope.type === 'heartbeat') {
    markPeerSeen(envelope.sourceNodeId, { transport: envelope.transport || 'browser-local' });
    updateDashboard();
    return;
  }

  if (envelope.type === 'history_request') {
    markPeerSeen(envelope.sourceNodeId, { transport: envelope.transport || 'browser-local' });
    sendHistoryToNode(envelope.sourceNodeId);
    updateDashboard();
    return;
  }

  if (envelope.type === 'history_response' && typeof envelope.payload === 'string') {
    importHistoryPayload(envelope.payload, envelope.sourceNodeId);
    return;
  }

  if (envelope.type === 'strategy' && typeof envelope.payload === 'string') {
    receiveStrategyPayload(envelope.payload, envelope.sourceNodeId);
  }
}

function broadcastP2PEnvelope(type, payload = null, extra = {}) {
  const envelope = {
    type,
    payload,
    sourceNodeId: state.nodeId,
    transport: state.p2pChannel ? 'broadcast-channel' : 'storage-event',
    messageId: `${state.nodeId}:${type}:${nowMs()}:${Math.random().toString(36).slice(2, 8)}`,
    sentAt: nowMs(),
    ...extra,
  };

  rememberP2PMessage(envelope.messageId);
  if (state.p2pChannel) state.p2pChannel.postMessage(envelope);

  try {
    localStorage.setItem(P2P_STORAGE_KEY, JSON.stringify(envelope));
    localStorage.removeItem(P2P_STORAGE_KEY);
  } catch {
    // ignore storage failures
  }

  return envelope;
}

function setupLocalP2PTransport() {
  if ('BroadcastChannel' in window) {
    state.p2pChannel = new BroadcastChannel(P2P_CHANNEL_NAME);
    state.p2pChannel.onmessage = (event) => handleP2PEnvelope(event.data);
  }

  window.addEventListener('storage', (event) => {
    if (event.key !== P2P_STORAGE_KEY || !event.newValue) return;
    try {
      handleP2PEnvelope(JSON.parse(event.newValue));
    } catch {
      // ignore malformed messages
    }
  });

  window.addEventListener('beforeunload', () => {
    if (state.p2pChannel) state.p2pChannel.close();
  });
}

function syncKnownNodes() {
  const cutoff = nowMs() - NODE_TTL;
  for (const [key, value] of state.knownNodes.entries()) {
    if ((value.lastSeen || 0) < cutoff) state.knownNodes.delete(key);
  }

  state.knownNodes.set(state.nodeId, {
    lastSeen: nowMs(),
    transport: state.p2pChannel ? 'broadcast-channel' : 'storage-event',
    self: true,
  });

  if (!state.lastHeartbeatAt || nowMs() - state.lastHeartbeatAt >= Math.max(1500, Math.floor(NODE_TTL / 3))) {
    state.lastHeartbeatAt = nowMs();
    broadcastP2PEnvelope('heartbeat');
  }

  updateDashboard();
}

function addEnemyUnit(id) {
  const unit = getEnemyUnitPool().find(item => item.id === id);
  if (!unit) return;
  const existing = state.enemyQueue.find(item => item.id === id);
  if (existing) existing.count += 1;
  else state.enemyQueue.push({ id: unit.id, name: unit.name, count: 1 });
  state.enemyLineupDraft = formatLineup(state.enemyQueue);
  renderEnemyEditor();
  searchByEnemyLineup();
}

function changeEnemyUnitCount(id, delta) {
  const target = state.enemyQueue.find(item => item.id === id);
  if (!target) return;
  target.count += delta;
  state.enemyQueue = state.enemyQueue.filter(item => item.count > 0);
  state.enemyLineupDraft = formatLineup(state.enemyQueue);
  renderEnemyEditor();
  searchByEnemyLineup();
}

function removeEnemyUnit(id) {
  state.enemyQueue = state.enemyQueue.filter(item => item.id !== id);
  state.enemyLineupDraft = formatLineup(state.enemyQueue);
  renderEnemyEditor();
  searchByEnemyLineup();
}

function parseLineupText(text, pool) {
  return text.split(/[，,]/).map(chunk => chunk.trim()).filter(Boolean).map(chunk => {
    const match = chunk.match(/^(.*?)(?:\s*x\s*(\d+))?$/i);
    const rawName = (match?.[1] || chunk).trim();
    const count = Math.max(1, Number(match?.[2] || 1));
    const unit = pool.find(item => item.name === rawName || item.id === rawName);
    return unit ? { id: unit.id, name: unit.name, count } : { id: rawName, name: rawName, count };
  });
}

function handleEnemyTextInput() {
  const input = byId('enemy-lineup-text-input');
  if (!input) return;
  const text = input.value;
  state.enemyLineupDraft = text;
  state.enemyQueue = text.trim() ? parseLineupText(text, getEnemyUnitPool()) : [];
  renderEnemyEditor({ preserveDraft: true });
}

function addCounterUnit(payload) {
  let unit;
  try {
    unit = typeof payload === 'string' ? JSON.parse(payload) : payload;
  } catch {
    return;
  }
  if (!unit?.id) return;
  if (state.selectedCounterUnits.some(item => item.id === unit.id)) return;
  state.selectedCounterUnits.push(unit);
  renderCounterSelection();
}

function removeCounterUnit(index) {
  state.selectedCounterUnits.splice(index, 1);
  renderCounterSelection();
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.toggle('active', tab.id === tabId));
  document.querySelectorAll('.tab-button').forEach(button => {
    const active = button.getAttribute('onclick')?.includes(`'${tabId}'`);
    button.classList.toggle('active', !!active);
  });
}

function submitBattleStrategy() {
  const desc = byId('battle-strategy-desc')?.value?.trim() || '';
  const target = (state.enemyLineupDraft || formatLineup(state.enemyQueue)).trim();
  const counter = state.selectedCounterUnits.map(unit => unit.name).join(', ');
  const tech = getSelectedTechNames().join(', ') || '未选择科技';

  if (!desc || !target || !counter) {
    window.alert('请至少填写策略描述、敌人阵容和应对阵容。');
    return;
  }

  const id = `strategy-${nowMs()}-${Math.random().toString(36).slice(2, 8)}`;
  const title = buildStrategyTitle(desc, target);
  create_strategy(id, title, desc, target, counter, tech);
  renderCommunityLineups();
  searchByEnemyLineup();
  updateDashboard();

  byId('battle-strategy-desc').value = '';
  state.enemyQueue = [];
  state.enemyLineupDraft = '';
  state.selectedCounterUnits = [];
  state.selectedBattleTechs.clear();
  renderEnemyEditor();
  renderCounterSelection();
  renderBattleTechOptions();
}

function normalizeLineupToken(token) {
  const normalized = (token || '').trim().replace(/^[\[\]()（）]+|[\[\]()（）]+$/g, '');
  if (!normalized) return '';
  const lowered = normalized.toLowerCase();
  const cleaned = lowered
    .replace(/[\s]*([x×*])[\s]*\d+$/i, '')
    .replace(/[\s]+\d+$/i, '')
    .replace(/^[+＋*×:：]+|[+＋*×:：]+$/g, '')
    .trim();
  return cleaned;
}

function normalizedLineupUnits(lineup) {
  return new Set(
    String(lineup || '')
      .split(/[，,；;\n\t|/]/)
      .flatMap(segment => segment.split(/[+＋]/))
      .map(normalizeLineupToken)
      .filter(Boolean)
  );
}

function calculateLineupSimilarity(lineupA, lineupB) {
  const unitsA = normalizedLineupUnits(lineupA);
  const unitsB = normalizedLineupUnits(lineupB);
  if (!unitsA.size && !unitsB.size) return 1;
  if (!unitsA.size || !unitsB.size) return 0;
  const intersection = [...unitsA].filter(unit => unitsB.has(unit)).length;
  const union = new Set([...unitsA, ...unitsB]).size;
  return union ? intersection / union : 0;
}

function getWaveEnemyLineupText(wave) {
  if (wave.incoming_enemy_text) return wave.incoming_enemy_text;
  if (Array.isArray(wave.incomingEnemies) && wave.incomingEnemies.length) {
    return wave.incomingEnemies.map(enemy => enemy.name).join('、');
  }
  return '';
}

function findOfficialRecommendationsByEnemyLineup(query, limit = 5) {
  const resolved = getResolvedTownDefenseRecommendations();
  const recommendations = resolved.flatMap(entry =>
    (entry.waves || []).map(wave => {
      const enemyLineup = getWaveEnemyLineupText(wave);
      const similarity = calculateLineupSimilarity(enemyLineup, query);
      return {
        townName: entry.town?.name || entry.town_name || entry.town_id,
        region: entry.town?.region || entry.region || 'unknown',
        notes: entry.notes || '',
        wave,
        similarity,
      };
    })
  ).filter(item => item.similarity > 0);

  recommendations.sort((a, b) => b.similarity - a.similarity);
  return recommendations.slice(0, limit);
}

function searchByEnemyLineup() {
  const input = byId('enemy-lineup-text-input');
  const query = input?.value?.trim() || state.enemyLineupDraft.trim() || formatLineup(state.enemyQueue);
  const includeCommunity = !!byId('include-community-search')?.checked;
  const container = byId('similarity-recommendations');
  if (!container) return;
  if (!query) {
    container.innerHTML = '<div class="muted">请先输入敌人阵容</div>';
    return;
  }

  const officialMatches = findOfficialRecommendationsByEnemyLineup(query, 5);
  const communityMatches = includeCommunity ? wasmArray(recommend_strategies_for_enemy(query, 8)) : [];
  const strategies = includeCommunity ? wasmArray(get_strategies()) : [];

  if (!officialMatches.length && !communityMatches.length) {
    container.innerHTML = `
      <div style="background:#171717;border:1px solid #333;border-radius:10px;padding:1rem;">
        <strong>暂无匹配策略</strong>
        <div class="muted" style="margin-top:.45rem;">没有找到匹配的官方防守方案；如果需要，也可以勾选“同时搜索社区数据”。</div>
      </div>
    `;
    return;
  }

  const officialHtml = officialMatches.length ? `
    <div style="margin-bottom:1rem;">
      <div style="font-weight:bold;color:#ffd54f;margin-bottom:.6rem;">官方防守推荐</div>
      ${officialMatches.map(item => {
        const wave = item.wave;
        const enemyText = getWaveEnemyLineupText(wave);
        const lineupText = wave.recommended_lineup_text || (wave.recommendedLineup || []).map(unit => unit.name).join('、') || '未配置';
        const techText = (wave.recommendedTechs || []).length ? wave.recommendedTechs.map(tech => tech.name).join('、') : '未配置';
        return `
          <div style="background:#171717;border:1px solid #333;border-radius:10px;padding:1rem;margin-bottom:.75rem;">
            <div style="display:flex;justify-content:space-between;gap:.5rem;align-items:center;">
              <strong>${escapeHtml(item.townName)} · ${escapeHtml(wave.label || '来袭波次')}</strong>
              <span class="muted">匹配度 ${(item.similarity * 100).toFixed(0)}%</span>
            </div>
            <div style="margin:.45rem 0;"><strong>来袭敌人：</strong>${escapeHtml(enemyText)}</div>
            <div style="margin:.45rem 0;"><strong>推荐阵容：</strong>${escapeHtml(lineupText)}</div>
            <div style="margin:.45rem 0;"><strong>推荐科技：</strong>${escapeHtml(techText)}</div>
            ${wave.required_tech_text ? `<div style="margin:.45rem 0;"><strong>必需研究：</strong>${escapeHtml(wave.required_tech_text)}</div>` : ''}
            ${wave.optional_tech_text ? `<div style="margin:.45rem 0;"><strong>可选研究：</strong>${escapeHtml(wave.optional_tech_text)}</div>` : ''}
            ${wave.tactic ? `<div class="muted"><strong>诀窍：</strong>${escapeHtml(wave.tactic)}</div>` : ''}
          </div>
        `;
      }).join('')}
    </div>
  ` : '';

  const communityHtml = includeCommunity ? `
    <div>
      <div style="font-weight:bold;color:#9fd3ff;margin-bottom:.6rem;">社区相似策略</div>
      ${communityMatches.length ? communityMatches.map(item => {
        const strategy = strategies.find(s => s.id === item.strategy_id);
        const displayTitle = strategy?.description || strategy?.title || item.strategy_id;
        return `
          <div style="background:#171717;border:1px solid #333;border-radius:10px;padding:1rem;margin-bottom:.75rem;">
            <div style="display:flex;justify-content:space-between;gap:.5rem;align-items:center;">
              <strong>${escapeHtml(displayTitle)}</strong>
              <span class="muted">相似度 ${(Number(item.similarity_score || 0) * 100).toFixed(0)}%</span>
            </div>
            <div style="margin:.45rem 0;"><strong>建议阵容：</strong>${escapeHtml(item.counter_lineup || '未填写')}</div>
            <div style="margin:.45rem 0;"><strong>敌人阵容：</strong>${escapeHtml(strategy?.target_hero || query)}</div>
            <div style="margin:.45rem 0;"><strong>科技：</strong>${escapeHtml(strategy?.counter_tech || '未填写')}</div>
            <div class="muted">${escapeHtml(strategy?.description || '')}</div>
          </div>
        `;
      }).join('') : '<div class="muted">未找到匹配的社区策略</div>'}
    </div>
  ` : '';

  container.innerHTML = `${officialHtml}${communityHtml}`;
}

function renderSearchResults() {
  const q = byId('q')?.value?.trim() || '';
  const scope = byId('search-scope')?.value || 'all';
  const container = byId('search-results');
  if (!container) return;
  if (!q) {
    container.innerHTML = '<div class="muted">请输入关键词进行检索</div>';
    return;
  }

  let results = wasmArray(search(q, 12));
  if (scope !== 'all') {
    results = results.filter(item => item.doc_type === (scope === 'community' ? 'strategy' : scope));
  }

  container.innerHTML = results.length ? results.map(item => `
    <div style="padding:.8rem;border:1px solid #333;border-radius:8px;margin-bottom:.6rem;background:#171717;">
      <div style="display:flex;justify-content:space-between;gap:.5rem;align-items:center;">
        <strong>${highlight(escapeHtml(item.title || ''), q)}</strong>
        <span class="muted">${escapeHtml(item.doc_type || '')}</span>
      </div>
      <div class="muted" style="margin-top:.4rem;">${highlight(escapeHtml(item.snippet || ''), q)}</div>
    </div>
  `).join('') : '<div class="muted">没有找到相关结果</div>';
}

function voteStrategy(id, isLike) {
  if (!id) return;
  vote(id, isLike);
  renderCommunityLineups();
  renderSearchResults();
  searchByEnemyLineup();
  updateDashboard();
}

const voteOnStrategy = voteStrategy;

function setupSearchBindings() {
  byId('enemy-lineup-text-input')?.addEventListener('input', debounce(() => {
    handleEnemyTextInput();
    searchByEnemyLineup();
  }, 150));
  byId('q')?.addEventListener('input', debounce(renderSearchResults, 150));
  byId('search-scope')?.addEventListener('change', renderSearchResults);
}

function installP2PBridge() {
  window.js_p2p_broadcast = (json) => {
    broadcastP2PEnvelope('strategy', json);
    renderCommunityLineups();
    updateDashboard();
  };
}

async function bootstrap() {
  await init();
  setupLocalP2PTransport();
  installP2PBridge();
  await loadConfig();

  state.selectedCounterUnits = [];
  state.enemyLineupDraft = '';
  state.lastHeartbeatAt = 0;
  state.p2pNode = create_p2p_node();
  syncKnownNodes();
  broadcastP2PEnvelope('history_request');
  if (state.nodeHeartBeatTimer) clearInterval(state.nodeHeartBeatTimer);
  state.nodeHeartBeatTimer = setInterval(syncKnownNodes, Math.max(2000, Math.floor(NODE_TTL / 2)));

  try {
    const official = await load_official_data();
    if (official && hasOwn(official, 'heroes')) {
      state.config = {
        ...state.config,
        heroes: getHeroes().length ? getHeroes() : official.heroes,
        buildings: getBuildings().length ? getBuildings() : official.buildings,
      };
    }
  } catch {
    // keep local config fallback
  }

  setupBattleTechPicker();
  setupEnemyUnitPicker();
  setupCounterUnitSelection(addCounterUnit);
  setupSearchBindings();
  renderEditorTips();
  renderBattleTechOptions();
  renderEnemyUnitList();
  renderEnemyEditor();
  renderCounterSelection();
  renderOfficialLineups();
  renderHeroList();
  renderCommunityLineups();
  renderSearchResults();
  updateDashboard();
}

window.__frontendModules = {
  state,
  byId,
  wasmArray,
  debounce,
  escapeHtml,
  highlight,
  nowMs,
  loadConfig,
  renderBattleTechOptions,
  setupBattleTechPicker,
  renderEnemyUnitList,
  setupEnemyUnitPicker,
  setupCounterUnitSelection,
};

Object.assign(window, {
  switchTab,
  addEnemyUnit,
  changeEnemyUnitCount,
  removeEnemyUnit,
  removeCounterUnit,
  submitBattleStrategy,
  searchByEnemyLineup,
  voteStrategy,
  voteOnStrategy,
});

bootstrap();
