import { state, NODE_TTL } from './state.js';
import { byId, wasmArray, debounce, escapeHtml, highlight, nowMs } from './utils.js';
import { loadConfig, renderBattleTechOptions, setupBattleTechPicker, renderEnemyUnitList, setupEnemyUnitPicker, setupCounterUnitSelection } from './config-ui.js';
import { getBuildings, getHeroes, getOfficialLineups, getResolvedTownDefenseRecommendations } from './data.js';
import { formatLineup, renderEnemyEditor, handleEnemyTextInput, addEnemyUnit as addEnemyUnitToQueue, changeEnemyUnitCount as changeEnemyUnitCountInQueue, removeEnemyUnit as removeEnemyUnitFromQueue } from './enemy-lineup.js';
import { searchByEnemyLineup as searchEnemyRecommendations } from './enemy-search.js';
import init, { create_strategy, create_p2p_node, get_strategies, load_official_data, p2p_receive_history_json, p2p_receive_json, recommend_strategies_for_enemy, search, vote } from '../pkg/demacia_rise.js';

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const P2P_CHANNEL_NAME = 'demacia-rise-p2p';
const P2P_STORAGE_KEY = '__demacia_rise_p2p_bus__';
const MAX_SEEN_P2P_MESSAGES = 200;

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
  const hasLocalTransport = !!state.p2pChannel || state.p2pNode;

  if (stateLabel) stateLabel.textContent = hasLocalTransport ? (activeNodeCount > 1 ? '已连接' : '在线') : '离线';
  if (light) light.className = `status-light ${hasLocalTransport ? 'online' : 'offline'}`;
  if (nodeCount) nodeCount.textContent = String(activeNodeCount);
  if (communityCount) communityCount.textContent = String(strategies.length);
  if (localCount) localCount.textContent = String(strategies.length);
  if (heroCount) heroCount.textContent = String(getHeroes().length);
  if (buildingCount) buildingCount.textContent = String(getBuildings().length);
}

function safeRender(label, fn) {
  try {
    fn();
  } catch (error) {
    console.error(`[render-failed] ${label}`, error);
  }
}

function renderOfficialLineups() {
  const container = byId('official-recommendations-container');
  if (!container) return;
  const townRecommendations = getResolvedTownDefenseRecommendations();
  const fallbackCompositions = getOfficialLineups();

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

  container.innerHTML = fallbackCompositions.length
    ? fallbackCompositions.map(comp => `<div style="background:#171717;border:1px solid #333;border-radius:10px;padding:1rem;">${escapeHtml(comp.name)}</div>`).join('')
    : '<div class="muted">暂无官方阵容数据</div>';
}

function renderHeroList() {
  const list = byId('hero-list');
  if (!list) return;
  const heroes = getHeroes();
  list.innerHTML = heroes.length
    ? heroes.map(hero => `<div style="background:#1b1b1b;border:1px solid #333;border-radius:8px;padding:.8rem;margin-bottom:.6rem;"><strong>${escapeHtml(hero.name)}</strong><div class="muted">${escapeHtml(hero.id)} · ${escapeHtml(hero.type || '')}</div><div style="margin-top:.25rem;">${escapeHtml(hero.description || '')}</div></div>`).join('')
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
    ? strategies.slice().reverse().map(strategy => `
      <div style="background:#171717;border:1px solid #333;border-radius:10px;padding:1rem;margin-bottom:.8rem;">
        <div style="display:flex;justify-content:space-between;gap:.5rem;align-items:center;"><strong>${escapeHtml(strategy.description || strategy.title || '未命名策略')}</strong><span class="muted">评分 ${Number(strategy.score || 0).toFixed(1)}</span></div>
        <div style="margin:.45rem 0;"><strong>敌人阵容：</strong>${escapeHtml(strategy.target_hero || '未填写')}</div>
        <div style="margin:.45rem 0;"><strong>应对阵容：</strong>${escapeHtml(strategy.counter_lineup || '未填写')}</div>
        <div style="margin:.45rem 0;"><strong>科技：</strong>${escapeHtml(strategy.counter_tech || '未填写')}</div>
      </div>
    `).join('')
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
  const envelope = { type, payload, sourceNodeId: state.nodeId, transport: state.p2pChannel ? 'broadcast-channel' : 'storage-event', messageId: `${state.nodeId}:${type}:${nowMs()}:${Math.random().toString(36).slice(2, 8)}`, sentAt: nowMs(), ...extra };
  rememberP2PMessage(envelope.messageId);
  if (state.p2pChannel) state.p2pChannel.postMessage(envelope);
  try {
    localStorage.setItem(P2P_STORAGE_KEY, JSON.stringify(envelope));
    localStorage.removeItem(P2P_STORAGE_KEY);
  } catch {}
  return envelope;
}

function setupLocalP2PTransport() {
  if ('BroadcastChannel' in window) {
    state.p2pChannel = new BroadcastChannel(P2P_CHANNEL_NAME);
    state.p2pChannel.onmessage = event => handleP2PEnvelope(event.data);
  }
  window.addEventListener('storage', event => {
    if (event.key !== P2P_STORAGE_KEY || !event.newValue) return;
    try { handleP2PEnvelope(JSON.parse(event.newValue)); } catch {}
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
  state.knownNodes.set(state.nodeId, { lastSeen: nowMs(), transport: state.p2pChannel ? 'broadcast-channel' : 'storage-event', self: true });
  if (!state.lastHeartbeatAt || nowMs() - state.lastHeartbeatAt >= Math.max(1500, Math.floor(NODE_TTL / 3))) {
    state.lastHeartbeatAt = nowMs();
    broadcastP2PEnvelope('heartbeat');
  }
  updateDashboard();
}

function addEnemyUnit(id) {
  addEnemyUnitToQueue(id, () => searchByEnemyLineup());
}

function changeEnemyUnitCount(id, delta) {
  changeEnemyUnitCountInQueue(id, delta, () => searchByEnemyLineup());
}

function removeEnemyUnit(id) {
  removeEnemyUnitFromQueue(id, () => searchByEnemyLineup());
}

function addCounterUnit(payload) {
  let unit;
  try { unit = typeof payload === 'string' ? JSON.parse(payload) : payload; } catch { return; }
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
  const descInput = byId('battle-strategy-desc');
  if (descInput) descInput.value = '';
  state.enemyQueue = [];
  state.enemyLineupDraft = '';
  state.selectedCounterUnits = [];
  state.selectedBattleTechs.clear();
  renderEnemyEditor();
  renderCounterSelection();
  renderBattleTechOptions();
}

function searchByEnemyLineup() {
  searchEnemyRecommendations({ recommendStrategies: recommend_strategies_for_enemy, getStrategies: get_strategies });
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
  if (scope !== 'all') results = results.filter(item => item.doc_type === (scope === 'community' ? 'strategy' : scope));
  container.innerHTML = results.length ? results.map(item => `<div style="padding:.8rem;border:1px solid #333;border-radius:8px;margin-bottom:.6rem;background:#171717;"><div style="display:flex;justify-content:space-between;gap:.5rem;align-items:center;"><strong>${highlight(escapeHtml(item.title || ''), q)}</strong><span class="muted">${escapeHtml(item.doc_type || '')}</span></div><div class="muted" style="margin-top:.4rem;">${highlight(escapeHtml(item.snippet || ''), q)}</div></div>`).join('') : '<div class="muted">没有找到相关结果</div>';
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
    handleEnemyTextInput(renderEnemyEditor);
    searchByEnemyLineup();
  }, 150));
  byId('q')?.addEventListener('input', debounce(renderSearchResults, 150));
  byId('search-scope')?.addEventListener('change', renderSearchResults);
}

function installP2PBridge() {
  window.js_p2p_broadcast = json => {
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
      state.config = { ...state.config, heroes: getHeroes().length ? getHeroes() : official.heroes, buildings: getBuildings().length ? getBuildings() : official.buildings };
    }
  } catch (error) {
    console.warn('load_official_data failed, using local config fallback', error);
  }
  safeRender('setupBattleTechPicker', () => setupBattleTechPicker());
  safeRender('setupEnemyUnitPicker', () => setupEnemyUnitPicker());
  safeRender('setupCounterUnitSelection', () => setupCounterUnitSelection(addCounterUnit));
  safeRender('setupSearchBindings', () => setupSearchBindings());
  safeRender('renderEditorTips', () => renderEditorTips());
  safeRender('renderBattleTechOptions', () => renderBattleTechOptions());
  safeRender('renderEnemyUnitList', () => renderEnemyUnitList());
  safeRender('renderEnemyEditor', () => renderEnemyEditor());
  safeRender('renderCounterSelection', () => renderCounterSelection());
  safeRender('renderOfficialLineups', () => renderOfficialLineups());
  safeRender('renderHeroList', () => renderHeroList());
  safeRender('renderCommunityLineups', () => renderCommunityLineups());
  safeRender('renderSearchResults', () => renderSearchResults());
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
