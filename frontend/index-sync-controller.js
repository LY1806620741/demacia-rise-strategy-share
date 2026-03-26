import { byId } from './utils.js';
import {
  loadLocalIndex,
  saveLocalIndex,
  appendIndexItem,
  publishIndexPointer,
  importIndexFromPointer,
  exportIndexText,
  importIndexText,
  resolveIndexedStrategies,
  getLastPointerCid,
  pinIndexedCid,
  refreshFromKnownPointers,
  getKnownPointerCids,
  fetchPointerBoard,
} from './community-index.js';
import { renderCommunityIndexStatus, renderIpfsStatus, updateDashboard } from './view-renderers.js';
import { syncLocalStrategies, get_strategies } from './community-strategy.js';
import { state } from './state.js';

export function createIndexSyncController({ renderCommunity }) {
  let communityIndex = loadLocalIndex();

  function ensureLocalIndexInitialized() {
    communityIndex = saveLocalIndex(communityIndex);
    return communityIndex;
  }

  async function refreshStrategiesFromIndex(message = '') {
    ensureLocalIndexInitialized();
    const knownPointers = await getKnownPointerCids();
    try {
      const strategies = await resolveIndexedStrategies(communityIndex);
      syncLocalStrategies(strategies);
      renderCommunity();
      updateDashboard({ state, getStrategies: get_strategies });
      renderCommunityIndexStatus(communityIndex, getLastPointerCid(), message, knownPointers);
      await renderIpfsStatus();
    } catch (error) {
      console.error('failed to resolve indexed strategies', error);
      syncLocalStrategies([]);
      renderCommunity();
      updateDashboard({ state, getStrategies: get_strategies });
      renderCommunityIndexStatus(communityIndex, getLastPointerCid(), message || '本地索引已初始化，但远端社区数据暂不可读', knownPointers);
      await renderIpfsStatus();
    }
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
      renderCommunityIndexStatus(communityIndex, getLastPointerCid(), '请先输入指针 CID', await getKnownPointerCids());
      return;
    }
    try {
      const result = await importIndexFromPointer(pointerCid);
      communityIndex = result.index;
      state.communitySync.lastImportedPointerCid = pointerCid;
      state.communitySync.lastMessage = `已从共享指针同步，新增 ${result.added} 条`;
      await refreshStrategiesFromIndex(state.communitySync.lastMessage);
    } catch (error) {
      console.error('failed to sync community index from pointer', error);
      renderCommunityIndexStatus(communityIndex, getLastPointerCid(), '同步失败：指针无效或远端索引不可读', await getKnownPointerCids());
    }
  }

  async function refreshCommunityFromKnownPointers() {
    const board = await fetchPointerBoard();
    const result = await refreshFromKnownPointers();
    communityIndex = result.index;
    const boardMessage = board.currentPointerCid
      ? (board.sourceType === 'ipns'
          ? `已通过 IPNS 加载最新 pointer：${board.currentPointerCid.slice(0, 16)}…`
          : `已通过静态公告板加载最新 pointer：${board.currentPointerCid.slice(0, 16)}…`)
      : 'IPNS / 公告板均未配置 pointer，已回退到本地/配置入口';
    state.communitySync.lastMessage = result.added
      ? `${boardMessage}，并新增 ${result.added} 条社区内容`
      : `${boardMessage}，暂无新增`;
    await refreshStrategiesFromIndex(state.communitySync.lastMessage);
  }

  async function publishCommunityIndexPointerAction() {
    try {
      const result = await publishIndexPointer(communityIndex);
      communityIndex = result.index;
      state.communitySync.lastPublishedPointerCid = result.cid;
      state.communitySync.lastMessage = '本地索引已发布；如需固定最新地址，请更新 IPNS 指向，或回退使用公告板 /community-pointer.json';
      const input = byId('community-index-pointer-input');
      if (input) input.value = result.cid;
      await refreshStrategiesFromIndex(state.communitySync.lastMessage);
    } catch (error) {
      console.error('failed to publish community index pointer', error);
      renderCommunityIndexStatus(communityIndex, getLastPointerCid(), '发布索引失败', await getKnownPointerCids());
    }
  }

  async function pinCommunityCidAction(cid) {
    try {
      const result = await pinIndexedCid(cid);
      state.communitySync.lastMessage = `已标记并固定 ${result.cid}`;
      communityIndex = saveLocalIndex(loadLocalIndex());
      await refreshStrategiesFromIndex(state.communitySync.lastMessage);
    } catch (error) {
      console.error('failed to pin community cid', error);
      renderCommunityIndexStatus(communityIndex, getLastPointerCid(), '固定失败', await getKnownPointerCids());
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
    getKnownPointerCids().then(known => {
      renderCommunityIndexStatus(communityIndex, getLastPointerCid(), '已导出本地索引', known);
    });
  }

  function appendCreatedStrategy(created) {
    communityIndex = appendIndexItem(communityIndex, {
      cid: created.cid,
      addedAt: created.createdAt,
      title: created.title,
      target: created.target,
    });
    saveLocalIndex(communityIndex);
    return refreshStrategiesFromIndex('已写入本地索引，可继续发布共享指针给其他人');
  }

  function hydratePointerInput() {
    ensureLocalIndexInitialized();
    const pointerInput = byId('community-index-pointer-input');
    if (pointerInput) pointerInput.value = getLastPointerCid();
  }

  return {
    setupCommunityIndexBindings,
    refreshStrategiesFromIndex,
    syncCommunityIndexFromPointer,
    refreshCommunityFromKnownPointers,
    publishCommunityIndexPointer: publishCommunityIndexPointerAction,
    exportCommunityIndex,
    appendCreatedStrategy,
    hydratePointerInput,
    pinCommunityCid: pinCommunityCidAction,
    ensureLocalIndexInitialized,
  };
}
