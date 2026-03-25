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
  getLastPointerCid
} from './community-index.js';
import { renderCommunityIndexStatus } from './view-renderers.js';
import { syncLocalStrategies, get_strategies } from './community-strategy.js';
import { updateDashboard } from './view-renderers.js';
import { state } from './state.js';

export function createIndexSyncController({ renderCommunity }) {
  let communityIndex = loadLocalIndex();

  async function refreshStrategiesFromIndex(message = '') {
    const strategies = await resolveIndexedStrategies(communityIndex);
    syncLocalStrategies(strategies);
    renderCommunity();
    updateDashboard({ state, getStrategies: get_strategies });
    renderCommunityIndexStatus(communityIndex, getLastPointerCid(), message);
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

  async function publishCommunityIndexPointerAction() {
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

  function appendCreatedStrategy(created) {
    communityIndex = appendIndexItem(communityIndex, {
      cid: created.cid,
      addedAt: created.createdAt,
      title: created.title,
      target: created.target,
    });
    saveLocalIndex(communityIndex);
    return refreshStrategiesFromIndex('已写入本地索引，可继续发布索引 CID 给其他人');
  }

  function hydratePointerInput() {
    const pointerInput = byId('community-index-pointer-input');
    if (pointerInput) pointerInput.value = getLastPointerCid();
  }

  return {
    setupCommunityIndexBindings,
    refreshStrategiesFromIndex,
    syncCommunityIndexFromPointer,
    publishCommunityIndexPointer: publishCommunityIndexPointerAction,
    exportCommunityIndex,
    appendCreatedStrategy,
    hydratePointerInput,
  };
}

