import { state, NODE_TTL } from './state.js';
import { byId, debounce, nowMs } from './utils.js';
import { loadConfig, renderBattleTechOptions, setupBattleTechPicker, renderEnemyUnitList, setupEnemyUnitPicker, setupCounterUnitSelection } from './config-ui.js';
import { formatLineup, renderEnemyEditor, handleEnemyTextInput, addEnemyUnit as addEnemyUnitToQueue, changeEnemyUnitCount as changeEnemyUnitCountInQueue, removeEnemyUnit as removeEnemyUnitFromQueue } from './enemy-lineup.js';
import { searchByEnemyLineup as searchEnemyRecommendations } from './enemy-search.js';
import { renderEditorTips, renderCounterSelection, updateDashboard, renderOfficialLineups, renderHeroList, renderSearchResults } from './view-renderers.js';
import { renderCommunityLineups, submitBattleStrategy as submitCommunityStrategy } from './community-strategy.js';
import { createP2PSync } from './p2p-sync.js';
import init, { create_strategy, create_p2p_node, get_strategies, load_official_data, p2p_receive_history_json, p2p_receive_json, recommend_strategies_for_enemy, search, vote } from '../pkg/demacia_rise.js';

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

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
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.toggle('active', tab.id === tabId));
  document.querySelectorAll('.tab-button').forEach(button => {
    const active = button.getAttribute('onclick')?.includes(`'${tabId}'`);
    button.classList.toggle('active', !!active);
  });
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
  window.js_p2p_broadcast = json => {
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

async function bootstrap() {
  await init();
  p2p.setupLocalTransport();
  installP2PBridge();
  await loadConfig();
  state.selectedCounterUnits = [];
  state.enemyLineupDraft = '';
  state.lastHeartbeatAt = 0;
  state.p2pNode = create_p2p_node();
  p2p.syncKnownNodes();
  p2p.broadcastEnvelope('history_request');
  if (state.nodeHeartBeatTimer) clearInterval(state.nodeHeartBeatTimer);
  state.nodeHeartBeatTimer = setInterval(p2p.syncKnownNodes, Math.max(2000, Math.floor(NODE_TTL / 2)));
  try {
    const official = await load_official_data();
    if (official && hasOwn(official, 'heroes')) {
      state.config = { ...state.config, heroes: state.config?.heroes?.length ? state.config.heroes : official.heroes, buildings: state.config?.buildings?.length ? state.config.buildings : official.buildings };
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
  safeRender('renderCounterSelection', () => renderCounterSelection(state.selectedCounterUnits));
  safeRender('renderOfficialLineups', () => renderOfficialLineups());
  safeRender('renderHeroList', () => renderHeroList());
  safeRender('renderCommunityLineups', () => renderCommunity());
  safeRender('renderSearchResults', () => renderSearch());
  updateDashboard({ state, getStrategies: get_strategies });
}

window.__frontendModules = { state, byId, debounce, nowMs, loadConfig, renderBattleTechOptions, setupBattleTechPicker, renderEnemyUnitList, setupEnemyUnitPicker, setupCounterUnitSelection };

Object.assign(window, { switchTab, addEnemyUnit, changeEnemyUnitCount, removeEnemyUnit, removeCounterUnit, submitBattleStrategy, searchByEnemyLineup, voteStrategy, voteOnStrategy });

bootstrap();
