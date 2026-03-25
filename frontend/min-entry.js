import { state, NODE_TTL } from './state.js';
import { byId, debounce, nowMs } from './utils.js';
import { loadConfig, renderBattleTechOptions, setupBattleTechPicker, renderEnemyUnitList, setupEnemyUnitPicker, setupCounterUnitSelection } from './config-ui.js';
import { renderEnemyEditor, handleEnemyTextInput, addEnemyUnit as addEnemyUnitToQueue, changeEnemyUnitCount as changeEnemyUnitCountInQueue, removeEnemyUnit as removeEnemyUnitFromQueue } from './enemy-lineup.js';
import { searchByEnemyLineup as searchEnemyRecommendations } from './enemy-search.js';
import { renderEditorTips, renderCounterSelection, updateDashboard, renderOfficialLineups, renderHeroList, renderSearchResults, renderIpfsStatus, renderCommunityIndexStatus } from './view-renderers.js';
import {
  renderCommunityLineups,
  submitBattleStrategy as submitCommunityStrategy,
  get_strategies,
  create_strategy,
  recommend_strategies_for_enemy,
  vote,
  syncLocalStrategies
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
import {
  loadLocalIndex,
  saveLocalIndex,
  appendIndexItem,
  publishIndexPointer,
  importIndexFromPointer,
  exportIndexText,
  importIndexText,
  resolveIndexedStrategies,
  getLastPointerCid
} from './community-index.js';

const hasOwn = (obj, key) => Object.hasOwn(obj, key);
let communityIndex = loadLocalIndex();

function safeRender(label, fn) {
  try {
    fn();
  } catch (error) {
    console.error(`[render-failed] ${label}`, error);
  }
}

async function refreshStrategiesFromIndex(message = '') {
  const strategies = await resolveIndexedStrategies(communityIndex);
  syncLocalStrategies(strategies);
  renderCommunity();
  renderCommunityIndexStatus(communityIndex, getLastPointerCid(), message);
}

function renderCommunity() {
  renderCommunityLineups(get_strategies, {
    onRendered: () => {
      updateDashboard({ state, getStrategies: get_strategies });
      const communityCount = document.getElementById('community-strategy-count');
      if (communityCount) communityCount.textContent = String(get_strategies().length);
    },
  });
}

function renderSearch() {
  renderSearchResults({
    searchFn: searchCommunity,
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

function setupCommunityIndexBindings() {
  byId('community-index-import-input')?.addEventListener('change', async event => {
    const file = event.target?.files?.[0];
    if (!file) return;
    const text = await file.text();
    const result = importIndexText(text);
    communityIndex = result.index;
    await refreshStrategiesFromIndex(`已导入索引，新增 ${result.added} 条`);
    event.target.value = '';
  });
}

async function syncCommunityIndexFromPointer() {
  const pointerCid = byId('community-index-pointer-input')?.value?.trim();
  if (!pointerCid) {
    renderCommunityIndexStatus(communityIndex, getLastPointerCid(), '请先输入指针 CID');
    return;
  }
  try {
    const result = await importIndexFromPointer(pointerCid);
    communityIndex = result.index;
    await refreshStrategiesFromIndex(`已从公告板同步，新增 ${result.added} 条`);
  } catch (error) {
    console.error('failed to sync community index from pointer', error);
    renderCommunityIndexStatus(communityIndex, getLastPointerCid(), '同步失败：指针无效或远端索引不可读');
  }
}

async function publishCommunityIndexPointer() {
  try {
    const result = await publishIndexPointer(communityIndex);
    communityIndex = result.index;
    const input = byId('community-index-pointer-input');
    if (input) input.value = result.cid;
    renderCommunityIndexStatus(communityIndex, result.cid, '本地索引已发布到公告板 CID');
  } catch (error) {
    console.error('failed to publish community index pointer', error);
    renderCommunityIndexStatus(communityIndex, getLastPointerCid(), '发布索引失败');
  }
}

function exportCommunityIndex() {
  const blob = new Blob([exportIndexText(communityIndex)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'community_index.json';
  link.click();
  URL.revokeObjectURL(url);
  renderCommunityIndexStatus(communityIndex, getLastPointerCid(), '已导出本地索引');
}

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
    onCreated: async created => {
      communityIndex = appendIndexItem(communityIndex, {
        cid: created.cid,
        addedAt: created.createdAt,
        title: created.title,
        target: created.target,
      });
      saveLocalIndex(communityIndex);
      await refreshStrategiesFromIndex('已写入本地索引，可继续发布索引 CID 给其他人');
    },
  });
}

(async function main() {
  if (!state.selectedCounterUnits) state.selectedCounterUnits = [];
  await loadConfig();
  const pointerInput = byId('community-index-pointer-input');
  if (pointerInput) pointerInput.value = getLastPointerCid();
  safeRender('setupBattleTechPicker', () => setupBattleTechPicker());
  safeRender('setupEnemyUnitPicker', () => setupEnemyUnitPicker());
  safeRender('setupCounterUnitSelection', () => setupCounterUnitSelection(addCounterUnit));
  safeRender('setupSearchBindings', () => setupSearchBindings());
  safeRender('setupCommunityIndexBindings', () => setupCommunityIndexBindings());
  safeRender('renderEditorTips', () => renderEditorTips());
  safeRender('renderBattleTechOptions', () => renderBattleTechOptions());
  safeRender('renderEnemyUnitList', () => renderEnemyUnitList());
  safeRender('renderEnemyEditor', () => renderEnemyEditor());
  safeRender('renderCounterSelection', () => renderCounterSelection(state.selectedCounterUnits));
  safeRender('renderOfficialLineups', () => renderOfficialLineups());
  safeRender('renderHeroList', () => renderHeroList());
  safeRender('renderSearchResults', () => renderSearch());
  updateDashboard({ state, getStrategies: get_strategies });
  safeRender('renderIpfsStatus', () => renderIpfsStatus());
  await refreshStrategiesFromIndex('本地索引已加载');
})();

globalThis.__frontendModules = { state, byId, debounce, nowMs, loadConfig, renderBattleTechOptions, setupBattleTechPicker, renderEnemyUnitList, setupEnemyUnitPicker, setupCounterUnitSelection };
Object.assign(globalThis, {
  switchTab,
  addEnemyUnit,
  changeEnemyUnitCount,
  removeEnemyUnit,
  removeCounterUnit,
  submitBattleStrategy,
  searchByEnemyLineup,
  voteStrategy,
  voteOnStrategy,
  syncCommunityIndexFromPointer,
  publishCommunityIndexPointer,
  exportCommunityIndex,
});
