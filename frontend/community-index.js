import { fetchCommunityStrategies, fetchCommunityStrategy, uploadCommunityStrategy, pinCommunityCid } from './ipfs-client.js';
import { state } from './state.js';

const INDEX_STORAGE_KEY = 'community_index_manifest_v2';
const LAST_POINTER_KEY = 'community_index_last_pointer_cid';
const KNOWN_POINTERS_KEY = 'community_index_known_pointers_v1';

export function createEmptyIndex() {
  return {
    version: 2,
    updatedAt: Date.now(),
    sourceCid: '',
    items: [],
  };
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

export function getKnownPointerCids() {
  return [...new Set([...getConfiguredDefaultPointers(), ...loadKnownPointers()])];
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

export function setLastPointerCid(cid) {
  if (cid) {
    localStorage.setItem(LAST_POINTER_KEY, cid);
    saveKnownPointers([cid, ...getKnownPointerCids()]);
  } else {
    localStorage.removeItem(LAST_POINTER_KEY);
  }
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

export async function refreshFromKnownPointers() {
  let local = loadLocalIndex();
  let totalAdded = 0;
  for (const pointerCid of getKnownPointerCids()) {
    try {
      const remote = await fetchIndexManifest(pointerCid);
      const merged = mergeIndexManifest(local, remote);
      local = merged.index;
      totalAdded += merged.added;
    } catch (error) {
      console.warn('failed to refresh pointer', pointerCid, error);
    }
  }
  return { index: saveLocalIndex(local), added: totalAdded };
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
