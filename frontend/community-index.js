import { fetchCommunityStrategies, fetchCommunityStrategy, uploadCommunityStrategy } from './ipfs-client.js';

const INDEX_STORAGE_KEY = 'community_index_manifest_v1';
const LAST_POINTER_KEY = 'community_index_last_pointer_cid';

export function createEmptyIndex() {
  return {
    version: 1,
    updatedAt: Date.now(),
    sourceCid: '',
    items: [],
  };
}

export function normalizeIndexManifest(raw = {}) {
  return {
    version: Number(raw.version || 1),
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

export function setLastPointerCid(cid) {
  if (cid) localStorage.setItem(LAST_POINTER_KEY, cid);
  else localStorage.removeItem(LAST_POINTER_KEY);
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
    version: Math.max(base.version, incoming.version, 1),
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
      },
      ...current.items,
    ],
  };
  return saveLocalIndex(next);
}

export async function publishIndexPointer(index) {
  const manifest = normalizeIndexManifest(index);
  const cid = await uploadCommunityStrategy(manifest);
  setLastPointerCid(cid);
  const saved = saveLocalIndex({ ...manifest, sourceCid: cid });
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
  setLastPointerCid(pointerCid);
  return { index: saved, added, pointerCid };
}

export async function resolveIndexedStrategies(index) {
  const normalized = normalizeIndexManifest(index);
  const records = await fetchCommunityStrategies(normalized.items.map(item => item.cid));
  return normalized.items.map(item => {
    const matched = records.find(record => record.cid === item.cid);
    return matched ? { ...matched.data, cid: item.cid } : null;
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
