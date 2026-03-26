import { fetchCommunityStrategies, fetchCommunityStrategy, uploadCommunityStrategy, pinCommunityCid, getPublishedCids, getIpfsStatus } from './ipfs-client.js';
import { state, DISCOVERY_RECORD_TTL_MS } from './state.js';

const INDEX_STORAGE_KEY = 'community_index_manifest_v2';
const LAST_POINTER_KEY = 'community_index_last_pointer_cid';
const KNOWN_POINTERS_KEY = 'community_index_known_pointers_v2';
const DISCOVERY_SOURCE_KEY = 'community_discovery_source_v1';
const REDIS_DISCOVERY_KEY = 'community:latest-pointer-record';

function getRedisConfig() {
  const redis = state?.config?.community?.upstash_redis || {};
  return {
    url: String(redis.url || '').trim(),
    token: String(redis.token || '').trim(),
    writeToken: String(redis.write_token || redis.writeToken || redis.token || '').trim(),
    key: String(redis.key || REDIS_DISCOVERY_KEY).trim() || REDIS_DISCOVERY_KEY,
  };
}

function withAuth(headers = {}, mode = 'read') {
  const redis = getRedisConfig();
  const token = mode === 'write' ? redis.writeToken : redis.token;
  return token ? { ...headers, Authorization: `Bearer ${token}` } : headers;
}

function createDiscoveryRecord(pointerCid, extra = {}) {
  return {
    version: 1,
    pointerCid: String(pointerCid || '').trim(),
    updatedAt: Date.now(),
    peerId: String(extra.peerId || state?.ipfs?.peerId || '').trim(),
    providerStatus: String(extra.providerStatus || state?.ipfs?.providerStatus || '').trim(),
    source: String(extra.source || 'redis-fallback').trim(),
  };
}

function normalizeDiscoveryRecord(raw = {}, extra = {}) {
  return {
    version: Number(raw?.version || 1),
    pointerCid: String(raw?.pointerCid || raw?.current_pointer_cid || '').trim(),
    updatedAt: Number(raw?.updatedAt || 0),
    peerId: String(raw?.peerId || '').trim(),
    providerStatus: String(raw?.providerStatus || '').trim(),
    source: String(extra.source || raw?.source || 'unknown').trim(),
    error: String(extra.error || '').trim(),
  };
}

function isFreshDiscoveryRecord(record) {
  return !!record?.pointerCid && Number(record?.updatedAt || 0) > (Date.now() - DISCOVERY_RECORD_TTL_MS);
}

export async function fetchRedisDiscoveryRecord() {
  const redis = getRedisConfig();
  if (!redis.url) {
    return normalizeDiscoveryRecord({}, { source: 'redis', error: 'missing redis url' });
  }
  try {
    const response = await fetch(`${redis.url}/get/${encodeURIComponent(redis.key)}`, {
      headers: withAuth({}, 'read'),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`redis http ${response.status}`);
    const payload = await response.json();
    if (!payload?.result) return normalizeDiscoveryRecord({}, { source: 'redis', error: 'empty redis record' });
    const parsed = typeof payload.result === 'string' ? JSON.parse(payload.result) : payload.result;
    return normalizeDiscoveryRecord(parsed, { source: 'redis' });
  } catch (error) {
    return normalizeDiscoveryRecord({}, { source: 'redis', error: error?.message || 'failed to fetch redis record' });
  }
}

export async function publishRedisDiscoveryRecord(pointerCid, extra = {}) {
  const normalizedCid = String(pointerCid || '').trim();
  if (!normalizedCid) return { ok: false, error: 'missing pointer cid' };
  const redis = getRedisConfig();
  if (!redis.url) return { ok: false, error: 'missing redis url' };
  if (!redis.writeToken) return { ok: false, error: 'missing redis write token' };
  const record = createDiscoveryRecord(normalizedCid, extra);
  try {
    const response = await fetch(`${redis.url}/set/${encodeURIComponent(redis.key)}`, {
      method: 'POST',
      headers: withAuth({ 'Content-Type': 'application/json' }, 'write'),
      body: JSON.stringify({ value: JSON.stringify(record) }),
    });
    if (!response.ok) throw new Error(`redis set http ${response.status}`);
    localStorage.setItem(DISCOVERY_SOURCE_KEY, 'redis');
    return { ok: true, record };
  } catch (error) {
    return { ok: false, error: error?.message || 'failed to publish redis record', record };
  }
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
    items: [],
  };
}

export function normalizeIndexManifest(raw = {}) {
  return {
    version: Number(raw.version || 2),
    updatedAt: Number(raw.updatedAt || Date.now()),
    sourceCid: String(raw.sourceCid || ''),
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
  const redisRecord = await fetchRedisDiscoveryRecord();
  const pointers = [...new Set([
    isFreshDiscoveryRecord(redisRecord) ? redisRecord.pointerCid : '',
    getLastPointerCid(),
    ...getPublishedCids(),
    ...getConfiguredDefaultPointers(),
    ...loadKnownPointers(),
  ].filter(Boolean))];

  const source = isFreshDiscoveryRecord(redisRecord)
    ? 'redis'
    : (pointers.length ? (localStorage.getItem(DISCOVERY_SOURCE_KEY) || 'local') : 'empty');

  return {
    source,
    pointerCid: isFreshDiscoveryRecord(redisRecord) ? redisRecord.pointerCid : '',
    knownPointers: pointers,
    redisRecord,
    hasNetworkEntry: pointers.length > 0,
  };
}

export async function ensureDiscoveryRegistration(pointerCid = '') {
  const discovery = await discoverCommunityPointers();
  const effectivePointerCid = String(pointerCid || getLastPointerCid() || getPublishedCids()[0] || '').trim();
  if (discovery.hasNetworkEntry || !effectivePointerCid) {
    return { ok: false, skipped: true, reason: discovery.hasNetworkEntry ? 'network-entry-exists' : 'missing-pointer', discovery };
  }
  const ipfsStatus = await getIpfsStatus();
  const result = await publishRedisDiscoveryRecord(effectivePointerCid, {
    peerId: ipfsStatus.id,
    providerStatus: ipfsStatus.providerStatus,
    source: 'redis-bootstrap',
  });
  if (result.ok) {
    saveKnownPointers([effectivePointerCid, ...loadKnownPointers()]);
    state.communitySync.redisRegistered = true;
    state.communitySync.discoverySource = 'redis';
    state.communitySync.lastMessage = '当前未发现在线社区入口，已自动写入 Redis 作为首个入口';
  }
  return { ...result, discovery: await discoverCommunityPointers() };
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
  const cid = await uploadCommunityStrategy(manifest);
  await setLastPointerCid(cid);
  const saved = saveLocalIndex({ ...manifest, sourceCid: cid });
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
