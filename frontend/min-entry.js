import { state, NODE_TTL } from './state.js';
import { byId, debounce, nowMs } from './utils.js';
import { loadConfig, renderBattleTechOptions, setupBattleTechPicker, renderEnemyUnitList, setupEnemyUnitPicker, setupCounterUnitSelection } from './config-ui.js';
import { renderEnemyEditor, handleEnemyTextInput, addEnemyUnit as addEnemyUnitToQueue, changeEnemyUnitCount as changeEnemyUnitCountInQueue, removeEnemyUnit as removeEnemyUnitFromQueue } from './enemy-lineup.js';
import { searchByEnemyLineup as searchEnemyRecommendations } from './enemy-search.js';
import { renderEditorTips, renderCounterSelection, updateDashboard, renderOfficialLineups, renderHeroList, renderSearchResults, renderIpfsStatus } from './view-renderers.js';
import {
  renderCommunityLineups,
  submitBattleStrategy as submitCommunityStrategy,
  get_strategies,
  create_strategy,
  recommend_strategies_for_enemy,
  vote
} from './community-strategy.js';
import {
  uploadCommunityStrategy,
  fetchCommunityStrategy,
  fetchCommunityStrategies,
  addFavorite,
  removeFavorite,
  getFavorites,
  searchStrategies
} from './ipfs-client.js';

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
    onRendered: () => {
      updateDashboard({ state, getStrategies: get_strategies });
      // 强制刷新社区策略数
      const communityCount = document.getElementById('community-strategy-count');
      if (communityCount) communityCount.textContent = String(get_strategies().length);
    },
  });
}

function renderSearch() {
  renderSearchResults({
    searchFn: searchCommunity, // 用本地实现的搜索函数
    scopeValue: byId('search-scope')?.value,
    queryValue: byId('q')?.value,
    limitValue: byId('similarity-result-limit')?.value,
  });
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

// 拉取社区策略
async function loadCommunityStrategies(cidList) {
  return await fetchCommunityStrategies(cidList);
}
// 收藏/取消收藏
function favoriteStrategy(cid) { addFavorite(cid); }
function unfavoriteStrategy(cid) { removeFavorite(cid); }
function getFavoriteStrategies() { return getFavorites(); }
// 搜索社区策略
function searchCommunity(keyword, strategies) {
  return searchStrategies(strategies, keyword);
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

function init() {
  // 移除所有与p2pNode、p2p、broadcastEnvelope、swarm相关的代码和调用
}

// 直接用前端初始化流程
(async function main() {
  if (!state.selectedCounterUnits) state.selectedCounterUnits = [];
  await loadConfig();
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
  safeRender('renderIpfsStatus', () => renderIpfsStatus());
})();

globalThis.__frontendModules = { state, byId, debounce, nowMs, loadConfig, renderBattleTechOptions, setupBattleTechPicker, renderEnemyUnitList, setupEnemyUnitPicker, setupCounterUnitSelection };

Object.assign(globalThis, { switchTab, addEnemyUnit, changeEnemyUnitCount, removeEnemyUnit, removeCounterUnit, submitBattleStrategy, searchByEnemyLineup, voteStrategy, voteOnStrategy });
