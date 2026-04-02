import { state } from './state.js';
import { byId, debounce, nowMs } from './utils.js';
import { handleEnemyTextInput, addEnemyUnit as addEnemyUnitToQueue, changeEnemyUnitCount as changeEnemyUnitCountInQueue, removeEnemyUnit as removeEnemyUnitFromQueue } from './enemy-lineup.js';
import { searchByEnemyLineup as renderEnemyRecommendations } from './enemy-search.js';
import { renderSearchResults, renderCounterSelection, updateDashboard } from './view-renderers.js';
import { get_strategies, recommend_strategies_for_enemy, vote, searchCommunity } from './community-strategy.js';

export function createSearchController({ renderEnemyEditor, renderCommunity }) {
  async function searchByEnemyLineup() {
    try {
      await renderEnemyRecommendations({ recommendStrategies: recommend_strategies_for_enemy, getStrategies: get_strategies });
    } catch (error) {
      console.error('[search-controller] enemy lineup search failed', error);
    }
  }

  function renderSearch() {
    renderSearchResults({
      searchFn: (keyword) => searchCommunity(keyword, get_strategies()),
      scopeValue: byId('search-scope')?.value,
      queryValue: byId('q')?.value,
      limitValue: byId('similarity-result-limit')?.value,
    });
  }

  function addEnemyUnit(id) {
    addEnemyUnitToQueue(id, () => { void searchByEnemyLineup(); });
  }

  function changeEnemyUnitCount(id, delta) {
    changeEnemyUnitCountInQueue(id, delta, () => { void searchByEnemyLineup(); });
  }

  function removeEnemyUnit(id) {
    removeEnemyUnitFromQueue(id, () => { void searchByEnemyLineup(); });
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

  function voteStrategy(id, isLike) {
    if (!id) return;
    vote(id, isLike);
    renderCommunity();
    renderSearch();
    void searchByEnemyLineup();
    updateDashboard({ state, getStrategies: get_strategies });
  }

  function setupSearchBindings() {
    byId('enemy-lineup-text-input')?.addEventListener('input', debounce(() => {
      handleEnemyTextInput(renderEnemyEditor);
      void searchByEnemyLineup();
    }, 150));
    byId('battle-strategy-desc')?.addEventListener('input', event => {
      state.strategyNotes = event.target?.value || '';
    });
    byId('include-community-search')?.addEventListener('change', () => { void searchByEnemyLineup(); });
    byId('similarity-result-limit')?.addEventListener('change', () => {
      void searchByEnemyLineup();
      renderSearch();
    });
    byId('q')?.addEventListener('input', debounce(renderSearch, 150));
    byId('search-scope')?.addEventListener('change', renderSearch);
  }

  return {
    nowMs,
    renderSearch,
    searchByEnemyLineup,
    addEnemyUnit,
    changeEnemyUnitCount,
    removeEnemyUnit,
    addCounterUnit,
    removeCounterUnit,
    voteStrategy,
    setupSearchBindings,
  };
}
