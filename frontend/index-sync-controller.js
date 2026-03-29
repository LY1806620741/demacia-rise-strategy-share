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
  discoverCommunityPointers,
  ensureDiscoveryRegistration,
  aggregateOnlineReplicaClaimsForPointers,
} from './community-index.js';
import { renderCommunityIndexStatus, renderIpfsStatus, updateDashboard } from './view-renderers.js';
import { syncLocalStrategies, get_strategies } from './community-strategy.js';
import { state } from './state.js';
import { getPinnedCids, getLastReplicaBoardUpdatedAt, getPublishedCids } from './ipfs-client.js';

const ONLINE_REPLICA_HEARTBEAT_MS = 1000 * 60 * 3;

function shouldRefreshReplicaBoard(now = Date.now()) {
  const lastUpdatedAt = getLastReplicaBoardUpdatedAt();
  return !lastUpdatedAt || now - lastUpdatedAt >= ONLINE_REPLICA_HEARTBEAT_MS;
}

export function createIndexSyncController({ renderCommunity }) {
  let communityIndex = loadLocalIndex();
  let heartbeatTimer = null;

  async function shouldAttemptAutoWrite(now = Date.now()) {
    const discovery = await discoverCommunityPointers();
    const hasReplicas = getPublishedCids().length > 0 || getPinnedCids().length > 0 || communityIndex.items.length > 0;
    const ipfsReady = state.ipfs.ready === true;
    const canProvide = state.ipfs.canProvide === true || getPublishedCids().length > 0;
    const heartbeatDue = shouldRefreshReplicaBoard(now);

    if (!hasReplicas) return { ok: false, reason: '没有可提供的社区内容' };
    if (discovery.hasNetworkEntry) return { ok: false, reason: '已发现 IPNS 社区入口，无需创建本地候选入口' };
    if (!ipfsReady) return { ok: false, reason: 'IPFS 未就绪' };
    if (!canProvide) return { ok: false, reason: '当前节点尚不可提供社区数据' };
    if (!heartbeatDue) return { ok: false, reason: '心跳时间未到，暂不刷新' };
    return { ok: true, reason: '满足本地候选入口刷新条件' };
  }

  async function refreshOnlineReplicaHeartbeat() {
    const decision = await shouldAttemptAutoWrite();
    state.communitySync.autoWriteReason = decision.reason;
    if (!decision.ok) return;
    try {
      const result = await publishIndexPointer(communityIndex);
      communityIndex = result.index;
      state.communitySync.lastPublishedPointerCid = result.cid;
      state.communitySync.lastMessage = '已自动刷新在线副本声明';
      state.communitySync.autoWriteReason = '自动刷新在线副本声明成功';
      await refreshStrategiesFromIndex(state.communitySync.lastMessage);
    } catch (error) {
      state.communitySync.autoWriteReason = `自动刷新失败：${error?.message || '未知错误'}`;
      console.warn('failed to refresh online replica heartbeat', error);
    }
  }

  function startOnlineReplicaHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      refreshOnlineReplicaHeartbeat().catch(error => console.warn('heartbeat tick failed', error));
    }, ONLINE_REPLICA_HEARTBEAT_MS);
  }

  async function syncCommunityPinSummary(index = communityIndex, knownPointers = []) {
    const items = Array.isArray(index?.items) ? index.items : [];
    const localPinned = new Set(getPinnedCids());
    const claims = await aggregateOnlineReplicaClaimsForPointers(knownPointers);
    const seenClaims = new Set();
    const pinCounts = {};

    for (const claim of claims) {
      const cid = String(claim?.cid || '').trim();
      const peerId = String(claim?.peerId || '').trim();
      if (!cid || !peerId) continue;
      const key = `${cid}::${peerId}`;
      if (seenClaims.has(key)) continue;
      seenClaims.add(key);
      pinCounts[cid] = Number(pinCounts[cid] || 0) + 1;
    }

    for (const item of items) {
      if (!item?.cid) continue;
      if (item.pinned === true) pinCounts[item.cid] = Math.max(Number(pinCounts[item.cid] || 0), 1);
      if (localPinned.has(item.cid)) pinCounts[item.cid] = Math.max(Number(pinCounts[item.cid] || 0), 1);
    }

    state.communityPins = {
      pinCounts,
      totalReplicas: Object.values(pinCounts).reduce((sum, value) => sum + Number(value || 0), 0),
      replicatedStrategyCount: Object.keys(pinCounts).length,
      updatedAt: Date.now(),
    };
  }

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
      await syncCommunityPinSummary(communityIndex, knownPointers);
      renderCommunity();
      updateDashboard({ state, getStrategies: get_strategies });
      renderCommunityIndexStatus(communityIndex, getLastPointerCid(), message, knownPointers);
      await renderIpfsStatus();
    } catch (error) {
      console.error('failed to resolve indexed strategies', error);
      syncLocalStrategies([]);
      await syncCommunityPinSummary(communityIndex, knownPointers);
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
      renderCommunityIndexStatus(communityIndex, getLastPointerCid(), '请先输入共享 pointer CID', await getKnownPointerCids());
      return;
    }
    try {
      const result = await importIndexFromPointer(pointerCid);
      communityIndex = result.index;
      state.communitySync.lastImportedPointerCid = pointerCid;
      state.communitySync.lastMessage = `已从共享入口同步，新增 ${result.added} 条`;
      await refreshStrategiesFromIndex(state.communitySync.lastMessage);
    } catch (error) {
      console.error('failed to sync community index from pointer', error);
      renderCommunityIndexStatus(communityIndex, getLastPointerCid(), '同步失败：pointer 无效或远端索引不可读', await getKnownPointerCids());
    }
  }

  async function refreshCommunityFromKnownPointers() {
    const discovery = await discoverCommunityPointers();
    const result = await refreshFromKnownPointers();
    communityIndex = result.index;
    await syncCommunityPinSummary(communityIndex, result.knownPointers || []);

    let baseMessage = '暂未发现社区入口，可先发布本地候选入口';
    if (discovery.pointerCid) {
      baseMessage = `已通过 IPNS 发现共享入口：${discovery.pointerCid.slice(0, 16)}…`;
    } else if (discovery.knownPointers.length) {
      baseMessage = '已通过本地/IPNS 候选入口检查社区共享索引';
    }

    state.communitySync.lastMessage = result.added
      ? `${baseMessage}，并新增 ${result.added} 条社区内容`
      : `${baseMessage}，暂无新增`;
    state.communitySync.discoverySource = discovery.source;
    state.communitySync.knownPointerCount = discovery.knownPointers.length;
    await refreshStrategiesFromIndex(state.communitySync.lastMessage);
  }

  async function bootstrapCommunityNetwork() {
    const discovery = await discoverCommunityPointers();
    state.communitySync.discoverySource = discovery.source;
    state.communitySync.knownPointerCount = discovery.knownPointers.length;

    const ipfsReady = state.ipfs.ready === true;
    const canProvide = state.ipfs.canProvide === true || getPublishedCids().length > 0;

    if (!discovery.hasNetworkEntry && ipfsReady && canProvide) {
      const registration = await ensureDiscoveryRegistration();
      if (registration.ok) {
        state.communitySync.lastMessage = '未发现 IPNS 社区入口，已建立本地候选入口';
        state.communitySync.autoWriteReason = '本地候选入口已准备，可用于共享';
      } else if (registration.skipped === true) {
        state.communitySync.autoWriteReason = `跳过本地候选入口：${registration.reason || '条件不满足'}`;
      } else {
        state.communitySync.lastMessage = '未发现 IPNS 社区入口，且本地候选入口准备失败';
        state.communitySync.autoWriteReason = `本地候选入口失败：${registration.error || '未知错误'}`;
      }
    } else if (discovery.hasNetworkEntry) {
      state.communitySync.autoWriteReason = '已存在社区网络入口';
    } else if (ipfsReady !== true) {
      state.communitySync.autoWriteReason = 'IPFS 未就绪';
    } else {
      state.communitySync.autoWriteReason = '当前节点暂无可提供内容';
    }

    await refreshCommunityFromKnownPointers();
    startOnlineReplicaHeartbeat();
  }

  async function publishCommunityIndexPointerAction() {
    try {
      const result = await publishIndexPointer(communityIndex);
      communityIndex = result.index;
      state.communitySync.lastPublishedPointerCid = result.cid;
      state.communitySync.lastMessage = '本地索引已发布，并更新本地候选入口';
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
    return refreshStrategiesFromIndex('已写入本地索引，可继续共享给其他节点');
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
    bootstrapCommunityNetwork,
    publishCommunityIndexPointer: publishCommunityIndexPointerAction,
    exportCommunityIndex,
    appendCreatedStrategy,
    hydratePointerInput,
    pinCommunityCid: pinCommunityCidAction,
    ensureLocalIndexInitialized,
    refreshOnlineReplicaHeartbeat,
  };
}
