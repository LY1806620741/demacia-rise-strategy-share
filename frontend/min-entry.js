import { state, NODE_TTL } from './state.js';
import { byId, debounce, nowMs } from './utils.js';
import { loadConfig, renderBattleTechOptions, setupBattleTechPicker, renderEnemyUnitList, setupEnemyUnitPicker, setupCounterUnitSelection } from './config-ui.js';
import { renderEnemyEditor, handleEnemyTextInput, addEnemyUnit as addEnemyUnitToQueue, changeEnemyUnitCount as changeEnemyUnitCountInQueue, removeEnemyUnit as removeEnemyUnitFromQueue } from './enemy-lineup.js';
import { searchByEnemyLineup as searchEnemyRecommendations } from './enemy-search.js';
import { renderEditorTips, renderCounterSelection, updateDashboard, renderOfficialLineups, renderHeroList, renderSearchResults } from './view-renderers.js';
import { renderCommunityLineups, submitBattleStrategy as submitCommunityStrategy } from './community-strategy.js';
import { createP2PSync } from './p2p-sync.js';
import init, { create_strategy, create_p2p_node, get_strategies, p2p_receive_history_json, p2p_receive_json, recommend_strategies_for_enemy, search, vote } from '../pkg/demacia_rise.js';

const hasOwn = (obj, key) => Object.hasOwn(obj, key);

function safeRender(label, fn) {
  try {
    fn();
  } catch (error) {
    console.error(`[render-failed] ${label}`, error);
  }
}

function renderCommunity() {
  renderCommunityLineups(get_strategies, {
    onRendered: () => updateDashboard({ state, getStrategies: get_strategies }),
  });
}

function renderSearch() {
  renderSearchResults({
    searchFn: search,
    scopeValue: byId('search-scope')?.value,
    queryValue: byId('q')?.value,
    limitValue: byId('similarity-result-limit')?.value,
  });
}

const p2p = createP2PSync({
  state,
  nodeTtl: NODE_TTL,
  getStrategies: get_strategies,
  receiveJson: p2p_receive_json,
  receiveHistoryJson: p2p_receive_history_json,
  onCommunityChanged: renderCommunity,
  onSearchChanged: renderSearch,
  onDashboardChanged: () => updateDashboard({ state, getStrategies: get_strategies }),
});

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
  renderCounterSelection(state.selectedCounterUnits);
}

function removeCounterUnit(index) {
  state.selectedCounterUnits.splice(index, 1);
  renderCounterSelection(state.selectedCounterUnits);
}

function switchTab(tabId) {
  for (const tab of document.querySelectorAll('.tab-content')) tab.classList.toggle('active', tab.id === tabId);
  for (const button of document.querySelectorAll('.tab-button')) {
    const active = button.getAttribute('onclick')?.includes(`'${tabId}'`);
    button.classList.toggle('active', !!active);
  }
}

function searchByEnemyLineup() {
  searchEnemyRecommendations({ recommendStrategies: recommend_strategies_for_enemy, getStrategies: get_strategies });
}

function voteStrategy(id, isLike) {
  if (!id) return;
  vote(id, isLike);
  renderCommunity();
  renderSearch();
  searchByEnemyLineup();
  updateDashboard({ state, getStrategies: get_strategies });
}

const voteOnStrategy = voteStrategy;

function setupSearchBindings() {
  byId('enemy-lineup-text-input')?.addEventListener('input', debounce(() => {
    handleEnemyTextInput(renderEnemyEditor);
    searchByEnemyLineup();
  }, 150));
  byId('include-community-search')?.addEventListener('change', searchByEnemyLineup);
  byId('similarity-result-limit')?.addEventListener('change', () => {
    searchByEnemyLineup();
    renderSearch();
  });
  byId('q')?.addEventListener('input', debounce(renderSearch, 150));
  byId('search-scope')?.addEventListener('change', renderSearch);
}

function installP2PBridge() {
  globalThis.js_p2p_broadcast = json => {
    p2p.broadcastEnvelope('strategy', json);
    renderCommunity();
    updateDashboard({ state, getStrategies: get_strategies });
  };
}

function submitBattleStrategy() {
  submitCommunityStrategy({
    state,
    createStrategy: create_strategy,
    nowMs,
    getSelectedTechNames: () => Array.from(state.selectedBattleTechs),
    renderCommunityLineups: renderCommunity,
    searchByEnemyLineup,
    updateDashboard: () => updateDashboard({ state, getStrategies: get_strategies }),
    renderEnemyEditor,
    renderCounterSelection: () => renderCounterSelection(state.selectedCounterUnits),
    renderBattleTechOptions,
  });
}

function syncBootstrapStatusFromNode() {
  if (!state.p2pNode?.try_bootstrap) return;
  try {
    const payload = JSON.stringify(state.networkConfig.bootstrapSources.map(source => ({
      id: source.id,
      name: source.name,
      type: source.type,
      enabled: source.enabled,
      supports_wasm: source.supportsWasm,
      prefer_ipv6: source.preferIpv6,
      dnsaddr: source.dnsaddr,
      note: source.note,
    })));
    const statuses = state.p2pNode.try_bootstrap(payload);
    if (Array.isArray(statuses)) state.bootstrapStatus = statuses;
    else if (state.p2pNode.bootstrap_status) state.bootstrapStatus = state.p2pNode.bootstrap_status() || state.bootstrapStatus;
  } catch (error) {
    console.warn('bootstrap validation failed', error);
  }
}

function syncNetworkRuntimeFromNode() {
  if (!state.p2pNode?.network_state) return;
  try {
    const runtime = state.p2pNode.network_state();
    if (!runtime || typeof runtime !== 'object') return;
    state.networkRuntime = {
      peerId: runtime.peer_id || state.networkRuntime.peerId,
      swarmReady: !!runtime.swarm_ready,
      connectedPeers: Array.isArray(runtime.connected_peers) ? runtime.connected_peers : [],
      lastEvent: runtime.last_event || '',
      lastError: runtime.last_error || '',
    };
  } catch (error) {
    console.warn('network state sync failed', error);
  }
}

function initRemoteNetworkSkeleton() {
  if (!state.p2pNode?.init_swarm) return;
  try {
    const runtime = state.p2pNode.init_swarm();
    if (runtime && typeof runtime === 'object') {
      state.networkRuntime = {
        peerId: runtime.peer_id || state.networkRuntime.peerId,
        swarmReady: !!runtime.swarm_ready,
        connectedPeers: Array.isArray(runtime.connected_peers) ? runtime.connected_peers : [],
        lastEvent: runtime.last_event || '',
        lastError: runtime.last_error || '',
      };
    }
  } catch (error) {
    console.warn('remote network skeleton init failed', error);
  }
}

async function bootstrap() {
  await init();
  p2p.setupLocalTransport();
  installP2PBridge();
  await loadConfig();
  const communityToggle = byId('include-community-search');
  if (communityToggle) communityToggle.checked = state.networkConfig.communitySearchEnabled;
  const resultLimit = byId('similarity-result-limit');
  if (resultLimit && state.networkConfig.defaultMaxResults) {
    resultLimit.value = String(state.networkConfig.defaultMaxResults);
  }
  state.selectedCounterUnits = [];
  state.enemyLineupDraft = '';
  state.lastHeartbeatAt = 0;
  state.p2pNode = create_p2p_node();
  initRemoteNetworkSkeleton();
  syncBootstrapStatusFromNode();
  syncNetworkRuntimeFromNode();
  p2p.syncKnownNodes();
  p2p.broadcastEnvelope('history_request');
  if (state.nodeHeartBeatTimer) clearInterval(state.nodeHeartBeatTimer);
  state.nodeHeartBeatTimer = setInterval(p2p.syncKnownNodes, Math.max(2000, Math.floor(NODE_TTL / 2)));
  safeRender('setupBattleTechPicker', () => setupBattleTechPicker());
  safeRender('setupEnemyUnitPicker', () => setupEnemyUnitPicker());
  safeRender('setupCounterUnitSelection', () => setupCounterUnitSelection(addCounterUnit));
  safeRender('setupSearchBindings', () => setupSearchBindings());
  safeRender('renderEditorTips', () => renderEditorTips());
  safeRender('renderBattleTechOptions', () => renderBattleTechOptions());
  safeRender('renderEnemyUnitList', () => renderEnemyUnitList());
  safeRender('renderEnemyEditor', () => renderEnemyEditor());
  safeRender('renderCounterSelection', () => renderCounterSelection(state.selectedCounterUnits));
  safeRender('renderOfficialLineups', () => renderOfficialLineups());
  safeRender('renderHeroList', () => renderHeroList());
  safeRender('renderCommunityLineups', () => renderCommunity());
  safeRender('renderSearchResults', () => renderSearch());
  updateDashboard({ state, getStrategies: get_strategies });
}

globalThis.__frontendModules = { state, byId, debounce, nowMs, loadConfig, renderBattleTechOptions, setupBattleTechPicker, renderEnemyUnitList, setupEnemyUnitPicker, setupCounterUnitSelection, syncBootstrapStatusFromNode, syncNetworkRuntimeFromNode, initRemoteNetworkSkeleton };

Object.assign(globalThis, { switchTab, addEnemyUnit, changeEnemyUnitCount, removeEnemyUnit, removeCounterUnit, submitBattleStrategy, searchByEnemyLineup, voteStrategy, voteOnStrategy });

await bootstrap();
