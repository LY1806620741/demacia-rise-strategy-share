import { state } from './state.js';
import { loadConfig, renderBattleTechOptions, setupBattleTechPicker, renderEnemyUnitList, setupEnemyUnitPicker, setupCounterUnitSelection } from './config-ui.js';
import { renderEnemyEditor } from './enemy-lineup.js';
import { renderEditorTips, renderCounterSelection, updateDashboard, renderOfficialLineups, renderHeroList, renderIpfsStatus } from './view-renderers.js';
import { renderCommunityLineups, submitBattleStrategy as submitCommunityStrategy, get_strategies } from './community-strategy.js';
import { createSearchController } from './search-controller.js';
import { createIndexSyncController } from './index-sync-controller.js';

function safeRender(label, fn) {
  try {
    return fn();
  } catch (error) {
    console.error(`[render-failed] ${label}`, error);
    return null;
  }
}

const searchController = createSearchController({ renderEnemyEditor, renderCommunity: renderCommunity });
const indexController = createIndexSyncController({ renderCommunity: renderCommunity });

function renderCommunity() {
  renderCommunityLineups(get_strategies, {
    onRendered: () => {
      updateDashboard({ state, getStrategies: get_strategies });
      const communityCount = document.getElementById('community-strategy-count');
      if (communityCount) communityCount.textContent = String(get_strategies().length);
    },
    onPin: () => updateDashboard({ state, getStrategies: get_strategies }),
  });
}

function switchTab(tabId) {
  for (const tab of document.querySelectorAll('.tab-content')) tab.classList.toggle('active', tab.id === tabId);
  for (const button of document.querySelectorAll('.tab-button')) {
    const active = button.getAttribute('onclick')?.includes(`'${tabId}'`);
    button.classList.toggle('active', !!active);
  }
}

function submitBattleStrategy() {
  return submitCommunityStrategy({
    state,
    nowMs: searchController.nowMs,
    getSelectedTechNames: () => Array.from(state.selectedBattleTechs),
    renderCommunityLineups: renderCommunity,
    searchByEnemyLineup: searchController.searchByEnemyLineup,
    updateDashboard: () => updateDashboard({ state, getStrategies: get_strategies }),
    renderEnemyEditor,
    renderCounterSelection: () => renderCounterSelection(state.selectedCounterUnits),
    renderBattleTechOptions,
    onCreated: async created => {
      await indexController.appendCreatedStrategy(created);
      await indexController.publishCommunityIndexPointer();
      await renderIpfsStatus();
    },
  });
}

async function pinCommunityStrategy(cid) {
  await indexController.pinCommunityCid(cid);
}

(async function main() {
  await loadConfig();
  indexController.ensureLocalIndexInitialized();
  indexController.hydratePointerInput();
  safeRender('setupBattleTechPicker', () => setupBattleTechPicker());
  safeRender('setupEnemyUnitPicker', () => setupEnemyUnitPicker());
  safeRender('setupCounterUnitSelection', () => setupCounterUnitSelection(searchController.addCounterUnit));
  safeRender('setupSearchBindings', () => searchController.setupSearchBindings());
  safeRender('setupCommunityIndexBindings', () => indexController.setupCommunityIndexBindings());
  safeRender('renderEditorTips', () => renderEditorTips());
  safeRender('renderBattleTechOptions', () => renderBattleTechOptions());
  safeRender('renderEnemyUnitList', () => renderEnemyUnitList());
  safeRender('renderEnemyEditor', () => renderEnemyEditor());
  safeRender('renderCounterSelection', () => renderCounterSelection(state.selectedCounterUnits));
  safeRender('renderOfficialLineups', () => renderOfficialLineups());
  safeRender('renderHeroList', () => renderHeroList());
  safeRender('renderSearchResults', () => searchController.renderSearch());
  updateDashboard({ state, getStrategies: get_strategies });
  await safeRender('renderIpfsStatus', () => renderIpfsStatus());
  await indexController.bootstrapCommunityNetwork();
  await indexController.refreshStrategiesFromIndex('页面已加载，已检查 IPFS 连接与社区发现状态');
})();

globalThis.__frontendModules = { state, loadConfig, renderBattleTechOptions, renderEnemyUnitList };
Object.assign(globalThis, {
  switchTab,
  addEnemyUnit: searchController.addEnemyUnit,
  changeEnemyUnitCount: searchController.changeEnemyUnitCount,
  removeEnemyUnit: searchController.removeEnemyUnit,
  removeCounterUnit: searchController.removeCounterUnit,
  submitBattleStrategy,
  searchByEnemyLineup: searchController.searchByEnemyLineup,
  voteStrategy: searchController.voteStrategy,
  voteOnStrategy: searchController.voteStrategy,
  syncCommunityIndexFromPointer: indexController.syncCommunityIndexFromPointer,
  publishCommunityIndexPointer: indexController.publishCommunityIndexPointer,
  exportCommunityIndex: indexController.exportCommunityIndex,
  pinCommunityStrategy,
});
