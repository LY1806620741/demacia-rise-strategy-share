import {
  fetchCommunityStrategies,
  fetchCommunityStrategy,
  uploadCommunityStrategy,
  pinCommunityCid,
  getPublishedCids,
  getIpfsStatus,
  createOnlineReplicaBoard,
  uploadOnlineReplicaBoard,
  fetchOnlineReplicaBoard,
  getPinnedCids,
  fetchIpnsJson,
} from './ipfs-client.js';
import { logDebug, logWarn } from './debug.js';
import { state, DISCOVERY_RECORD_TTL_MS } from './state.js';

const INDEX_STORAGE_KEY = 'community_index_manifest_v2';
const LAST_POINTER_KEY = 'community_index_last_pointer_cid';
const KNOWN_POINTERS_KEY = 'community_index_known_pointers_v2';
const DISCOVERY_SOURCE_KEY = 'community_discovery_source_v1';
const DEFAULT_IPNS_NAME = 'community-pointer.json';

function normalizePointerCandidatesManifest(raw = {}, extra = {}) {
  const currentPointerCid = String(raw?.currentPointerCid || raw?.current_pointer_cid || '').trim();
  const fallbackPointerCids = Array.isArray(raw?.fallbackPointerCids || raw?.fallback_pointer_cids)
    ? (raw.fallbackPointerCids || raw.fallback_pointer_cids).map(value => String(value || '').trim()).filter(Boolean)
    : [];
  return {
    version: Number(raw?.version || 1),
    updatedAt: Number(raw?.updatedAt || 0),
    currentPointerCid,
    fallbackPointerCids,
    source: String(extra.source || raw?.source || 'ipns').trim(),
    error: String(extra.error || '').trim(),
  };
}

function isFreshPointerCandidatesManifest(manifest) {
  return !!manifest?.currentPointerCid && Number(manifest?.updatedAt || 0) > (Date.now() - DISCOVERY_RECORD_TTL_MS);
}

function isCommunityConnectionEnabled() {
  const configured = state?.config?.community?.community_search_enabled;
  if (configured === false) return false;
  return state?.networkConfig?.communitySearchEnabled !== false;
}

async function fetchIpnsPointerCandidatesManifest() {
  if (!isCommunityConnectionEnabled()) {
    logDebug('community-discovery', '社区连接已关闭，跳过 IPNS 公告板读取');
    return normalizePointerCandidatesManifest({}, { source: 'disabled', error: 'community connection disabled' });
  }
  const configured = state?.config?.community || {};
  const ipnsName = String(configured.default_ipns_name || DEFAULT_IPNS_NAME).trim();
  logDebug('community-discovery', '读取 IPNS 公告板', { ipnsName });
  const result = await fetchIpnsJson(ipnsName);
  if (!result.ok) {
    logWarn('community-discovery', 'IPNS 公告板读取失败', result);
    return normalizePointerCandidatesManifest({}, { source: 'ipns', error: result.error || 'ipns unavailable' });
  }
  const normalized = normalizePointerCandidatesManifest(result.data, { source: 'ipns' });
  logDebug('community-discovery', 'IPNS 公告板读取成功', normalized);
  return normalized;
}

function loadKnownPointers() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KNOWN_POINTERS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map(value => String(value || '')).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveKnownPointers(values) {
  const normalized = [...new Set((Array.isArray(values) ? values : []).map(value => String(value || '')).filter(Boolean))];
  localStorage.setItem(KNOWN_POINTERS_KEY, JSON.stringify(normalized));
  return normalized;
}

function getConfiguredDefaultPointers() {
  const configured = state?.config?.community?.default_pointer_cids;
  return Array.isArray(configured) ? configured.map(value => String(value || '')).filter(Boolean) : [];
}

export function createEmptyIndex() {
  return {
    version: 2,
    updatedAt: Date.now(),
    sourceCid: '',
    replicaBoardCid: '',
    items: [],
  };
}

export function normalizeIndexManifest(raw = {}) {
  return {
    version: Number(raw.version || 2),
    updatedAt: Number(raw.updatedAt || Date.now()),
    sourceCid: String(raw.sourceCid || ''),
    replicaBoardCid: String(raw.replicaBoardCid || ''),
    items: Array.isArray(raw.items)
      ? raw.items
          .filter(item => item?.cid)
          .map(item => ({
            cid: String(item.cid),
            addedAt: Number(item.addedAt || Date.now()),
            title: String(item.title || ''),
            target: String(item.target || ''),
            pinned: item.pinned === true,
          }))
      : [],
  };
}

export function loadLocalIndex() {
  try {
    const raw = localStorage.getItem(INDEX_STORAGE_KEY);
    return raw ? normalizeIndexManifest(JSON.parse(raw)) : createEmptyIndex();
  } catch {
    return createEmptyIndex();
  }
}

export function saveLocalIndex(index) {
  const normalized = normalizeIndexManifest(index);
  localStorage.setItem(INDEX_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function getLastPointerCid() {
  return localStorage.getItem(LAST_POINTER_KEY) || '';
}

export async function setLastPointerCid(cid) {
  if (cid) {
    localStorage.setItem(LAST_POINTER_KEY, cid);
    saveKnownPointers([cid, ...loadKnownPointers(), ...getPublishedCids()]);
  } else {
    localStorage.removeItem(LAST_POINTER_KEY);
  }
}

export async function discoverCommunityPointers() {
  if (!isCommunityConnectionEnabled()) {
    const localPointers = [...new Set([
      getLastPointerCid(),
      ...getPublishedCids(),
      ...getConfiguredDefaultPointers(),
      ...loadKnownPointers(),
    ].filter(Boolean))];
    const disabledResult = {
      source: 'disabled',
      pointerCid: '',
      knownPointers: localPointers,
      ipnsManifest: normalizePointerCandidatesManifest({}, { source: 'disabled', error: 'community connection disabled' }),
      hasNetworkEntry: localPointers.length > 0,
    };
    logDebug('community-discovery', '社区连接关闭后的本地候选入口结果', disabledResult);
    return disabledResult;
  }
  const ipnsManifest = await fetchIpnsPointerCandidatesManifest();
  const pointers = [...new Set([
    isFreshPointerCandidatesManifest(ipnsManifest) ? ipnsManifest.currentPointerCid : '',
    ...ipnsManifest.fallbackPointerCids,
    getLastPointerCid(),
    ...getPublishedCids(),
    ...getConfiguredDefaultPointers(),
    ...loadKnownPointers(),
  ].filter(Boolean))];
  const source = isFreshPointerCandidatesManifest(ipnsManifest)
    ? 'ipns'
    : (pointers.length ? (localStorage.getItem(DISCOVERY_SOURCE_KEY) || 'local') : 'empty');
  const result = {
    source,
    pointerCid: isFreshPointerCandidatesManifest(ipnsManifest) ? ipnsManifest.currentPointerCid : '',
    knownPointers: pointers,
    ipnsManifest,
    hasNetworkEntry: pointers.length > 0,
  };
  logDebug('community-discovery', '候选入口合并结果', result);
  return result;
}

export async function ensureDiscoveryRegistration(pointerCid = '') {
  const discovery = await discoverCommunityPointers();
  const effectivePointerCid = String(pointerCid || getLastPointerCid() || getPublishedCids()[0] || '').trim();
  logDebug('community-discovery', '尝试建立本地候选入口', {
    hasNetworkEntry: discovery.hasNetworkEntry,
    pointerCid: effectivePointerCid,
    source: discovery.source,
    knownPointerCount: discovery.knownPointers.length,
  });
  if (discovery.hasNetworkEntry || !effectivePointerCid) {
    const skipped = { ok: false, skipped: true, reason: discovery.hasNetworkEntry ? 'network-entry-exists' : 'missing-pointer', discovery };
    logDebug('community-discovery', '跳过建立本地候选入口', skipped);
    return skipped;
  }
  saveKnownPointers([effectivePointerCid, ...loadKnownPointers()]);
  localStorage.setItem(DISCOVERY_SOURCE_KEY, 'ipns-local-seed');
  state.communitySync.discoverySource = 'ipns';
  state.communitySync.lastMessage = '未发现 IPNS 社区入口，已使用本地 pointer 作为候选入口';
  const result = { ok: true, localOnly: true, pointerCid: effectivePointerCid, discovery: await discoverCommunityPointers() };
  logDebug('community-discovery', '本地候选入口建立完成', result);
  return result;
}

export async function getKnownPointerCids() {
  const discovery = await discoverCommunityPointers();
  state.communitySync.discoverySource = discovery.source;
  state.communitySync.knownPointerCount = discovery.knownPointers.length;
  return discovery.knownPointers;
}

export function mergeIndexManifest(baseIndex, incomingIndex) {
  const base = normalizeIndexManifest(baseIndex);
  const incoming = normalizeIndexManifest(incomingIndex);
  const map = new Map(base.items.map(item => [item.cid, item]));
  let added = 0;
  for (const item of incoming.items) {
    if (!map.has(item.cid)) {
      map.set(item.cid, item);
      added += 1;
    }
  }
  const merged = {
    version: Math.max(base.version, incoming.version, 2),
    updatedAt: Date.now(),
    sourceCid: incoming.sourceCid || base.sourceCid || '',
    replicaBoardCid: incoming.replicaBoardCid || base.replicaBoardCid || '',
    items: [...map.values()].sort((a, b) => b.addedAt - a.addedAt),
  };
  return { index: merged, added };
}

export function appendIndexItem(index, item) {
  const current = normalizeIndexManifest(index);
  if (!item?.cid || current.items.some(entry => entry.cid === item.cid)) return current;
  const next = {
    ...current,
    updatedAt: Date.now(),
    items: [
      {
        cid: String(item.cid),
        addedAt: Number(item.addedAt || Date.now()),
        title: String(item.title || ''),
        target: String(item.target || ''),
        pinned: item.pinned === true,
      },
      ...current.items,
    ],
  };
  return saveLocalIndex(next);
}

export async function pinIndexedCid(cid) {
  const result = await pinCommunityCid(cid);
  const index = loadLocalIndex();
  const next = {
    ...index,
    items: index.items.map(item => item.cid === cid ? { ...item, pinned: true } : item),
  };
  saveLocalIndex(next);
  return result;
}

export async function publishIndexPointer(index) {
  const manifest = normalizeIndexManifest(index);
  const ipfsStatus = await getIpfsStatus();
  const replicaBoard = createOnlineReplicaBoard({
    peerId: ipfsStatus.id,
    cids: [...new Set([...getPublishedCids(), ...getPinnedCids(), ...manifest.items.map(item => item.cid)])],
    updatedAt: Date.now(),
  });
  const replicaBoardCid = await uploadOnlineReplicaBoard(replicaBoard);
  const cid = await uploadCommunityStrategy({ ...manifest, replicaBoardCid });
  await setLastPointerCid(cid);
  const saved = saveLocalIndex({ ...manifest, sourceCid: cid, replicaBoardCid });
  saveKnownPointers([cid, ...loadKnownPointers(), ...getPublishedCids()]);
  await ensureDiscoveryRegistration(cid);
  return { cid, index: saved };
}

export async function fetchIndexManifest(pointerCid) {
  const manifest = await fetchCommunityStrategy(pointerCid);
  return normalizeIndexManifest({ ...manifest, sourceCid: pointerCid });
}

export async function importIndexFromPointer(pointerCid) {
  const remote = await fetchIndexManifest(pointerCid);
  const local = loadLocalIndex();
  const { index, added } = mergeIndexManifest(local, remote);
  const saved = saveLocalIndex(index);
  await setLastPointerCid(pointerCid);
  saveKnownPointers([pointerCid, ...loadKnownPointers()]);
  return { index: saved, added, pointerCid };
}

export async function refreshFromKnownPointers() {
  let local = loadLocalIndex();
  let totalAdded = 0;
  const knownPointers = await getKnownPointerCids();
  for (const pointerCid of knownPointers) {
    try {
      const remote = await fetchIndexManifest(pointerCid);
      const merged = mergeIndexManifest(local, remote);
      local = merged.index;
      totalAdded += merged.added;
    } catch (error) {
      console.warn('failed to refresh pointer', pointerCid, error);
    }
  }
  return { index: saveLocalIndex(local), added: totalAdded, knownPointers };
}

export async function resolveIndexedStrategies(index) {
  const normalized = normalizeIndexManifest(index);
  const records = await fetchCommunityStrategies(normalized.items.map(item => item.cid));
  return normalized.items.map(item => {
    const matched = records.find(record => record.cid === item.cid);
    return matched ? { ...matched.data, cid: item.cid, pinned: item.pinned === true } : null;
  }).filter(Boolean);
}

export function exportIndexText(index) {
  return JSON.stringify(normalizeIndexManifest(index), null, 2);
}

export function importIndexText(text) {
  const parsed = normalizeIndexManifest(JSON.parse(text));
  const local = loadLocalIndex();
  const { index, added } = mergeIndexManifest(local, parsed);
  return { index: saveLocalIndex(index), added };
}

export function getIndexedCids(index = loadLocalIndex()) {
  return normalizeIndexManifest(index).items.map(item => item.cid);
}

export async function aggregateOnlineReplicaClaims(index) {
  const normalized = normalizeIndexManifest(index);
  const claims = [];
  const boardCids = normalized.replicaBoardCid ? [normalized.replicaBoardCid] : [];
  for (const boardCid of boardCids) {
    try {
      const board = await fetchOnlineReplicaBoard(boardCid);
      claims.push(...board.claims);
      logDebug('community-replica', '在线副本声明板读取成功', { boardCid, claimCount: board.claims.length });
    } catch (error) {
      logWarn('community-replica', '在线副本声明板读取失败', { boardCid, error: error?.message || String(error) });
    }
  }
  return claims;
}

export async function aggregateOnlineReplicaClaimsForPointers(pointerCids = []) {
  const claims = [];
  const visitedBoards = new Set();
  const normalizedPointers = [...new Set((Array.isArray(pointerCids) ? pointerCids : []).map(value => String(value || '').trim()).filter(Boolean))];
  logDebug('community-replica', '开始聚合在线副本声明', { pointerCount: normalizedPointers.length, pointers: normalizedPointers });
  for (const pointerCid of normalizedPointers) {
    try {
      const manifest = await fetchIndexManifest(pointerCid);
      const boardCid = String(manifest?.replicaBoardCid || '').trim();
      if (!boardCid || visitedBoards.has(boardCid)) continue;
      visitedBoards.add(boardCid);
      const board = await fetchOnlineReplicaBoard(boardCid);
      claims.push(...board.claims);
      logDebug('community-replica', 'pointer 在线副本声明聚合成功', { pointerCid, boardCid, claimCount: board.claims.length });
    } catch (error) {
      logWarn('community-replica', 'pointer 在线副本声明聚合失败', { pointerCid, error: error?.message || String(error) });
    }
  }
  logDebug('community-replica', '在线副本声明聚合完成', { totalClaims: claims.length });
  return claims;
}
