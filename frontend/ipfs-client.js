import { createHelia } from 'https://cdn.jsdelivr.net/npm/helia@5.5.0/+esm';
import { unixfs } from 'https://cdn.jsdelivr.net/npm/@helia/unixfs@3.0.0/+esm';
import { CID } from 'https://cdn.jsdelivr.net/npm/multiformats@13.3.1/+esm';

const PUBLISHED_CIDS_KEY = 'community_published_cids_v1';
const PINNED_CIDS_KEY = 'community_pinned_cids_v1';
const DEFAULT_IPNS_PATH_PREFIX = './ipns';
const REPLICA_BOARD_UPDATED_AT_KEY = 'community_replica_board_updated_at_v1';
const REPLICA_BOARD_CID_KEY = 'community_replica_board_cid_v1';

let heliaNode = null;
let fsApi = null;
let startupError = null;

function loadCidList(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed.map(value => String(value || '')).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveCidList(key, values) {
  const normalized = [...new Set((Array.isArray(values) ? values : []).map(value => String(value || '')).filter(Boolean))];
  localStorage.setItem(key, JSON.stringify(normalized));
  return normalized;
}

function trackPublishedCid(cid) {
  return saveCidList(PUBLISHED_CIDS_KEY, [...loadCidList(PUBLISHED_CIDS_KEY), cid]);
}

function trackPinnedCid(cid) {
  return saveCidList(PINNED_CIDS_KEY, [...loadCidList(PINNED_CIDS_KEY), cid]);
}

async function ensureHelia() {
  if (startupError) throw startupError;
  if (!heliaNode) {
    try {
      heliaNode = await createHelia();
      fsApi = unixfs(heliaNode);
    } catch (error) {
      startupError = error;
      throw error;
    }
  }
  return { helia: heliaNode, fs: fsApi };
}

export async function getIpfsNode() {
  const { helia } = await ensureHelia();
  return helia;
}

export async function uploadCommunityStrategy(strategyObj) {
  const { fs } = await ensureHelia();
  const bytes = new TextEncoder().encode(JSON.stringify(strategyObj));
  const cid = await fs.addBytes(bytes);
  const asString = cid.toString();
  trackPublishedCid(asString);
  return asString;
}

export async function fetchCommunityStrategy(cid) {
  const { fs } = await ensureHelia();
  const parsedCid = typeof cid === 'string' ? CID.parse(cid) : cid;
  const chunks = [];
  for await (const chunk of fs.cat(parsedCid)) {
    chunks.push(chunk);
  }
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(merged));
}

export async function fetchCommunityStrategies(cidList) {
  const results = [];
  for (const cid of cidList) {
    try {
      const data = await fetchCommunityStrategy(cid);
      results.push({ cid, data });
    } catch (error) {
      console.warn('failed to fetch community strategy from helia', cid, error);
    }
  }
  return results;
}

export async function pinCommunityCid(cid) {
  const parsedCid = typeof cid === 'string' ? CID.parse(cid) : cid;
  await ensureHelia();
  const asString = parsedCid.toString();
  // 浏览器 Helia 默认没有可靠的持久 pin API；这里至少记录“我愿意继续持有/复用该 CID”并用于 UI 展示与后续复取。
  trackPinnedCid(asString);
  return {
    cid: asString,
    pinned: true,
    delegated: false,
    providerHint: '浏览器会在当前节点在线时继续尝试提供与复取该内容',
  };
}

export function getPinnedCids() {
  return loadCidList(PINNED_CIDS_KEY);
}

export function getPublishedCids() {
  return loadCidList(PUBLISHED_CIDS_KEY);
}

export function addFavorite(cid) {
  const favs = new Set(JSON.parse(localStorage.getItem('community_favs') || '[]'));
  favs.add(cid);
  localStorage.setItem('community_favs', JSON.stringify([...favs]));
}

export function removeFavorite(cid) {
  const favs = new Set(JSON.parse(localStorage.getItem('community_favs') || '[]'));
  favs.delete(cid);
  localStorage.setItem('community_favs', JSON.stringify([...favs]));
}

export function getFavorites() {
  return JSON.parse(localStorage.getItem('community_favs') || '[]');
}

export function searchStrategies(strategies, keyword) {
  const kw = String(keyword || '').trim().toLowerCase();
  return (Array.isArray(strategies) ? strategies : []).filter(item => {
    const data = item?.data ?? item;
    return Object.values(data || {}).some(v => typeof v === 'string' && v.toLowerCase().includes(kw));
  });
}

export async function getIpfsStatus() {
  try {
    const { helia } = await ensureHelia();
    const peerId = helia?.libp2p?.peerId?.toString?.() || 'unknown-peer';
    const multiaddrs = helia?.libp2p?.getMultiaddrs?.()?.map(addr => addr.toString()) || [];
    const publishedCids = getPublishedCids();
    const pinnedCids = getPinnedCids();
    return {
      ready: true,
      id: peerId,
      agentVersion: 'Helia',
      protocolVersion: 'helia',
      addresses: multiaddrs,
      addressCount: multiaddrs.length,
      canProvide: multiaddrs.length > 0 || publishedCids.length > 0,
      canPin: true,
      publishedCids,
      pinnedCids,
      lastPublishedCid: publishedCids[0] || '',
      lastPinnedCid: pinnedCids[0] || '',
      providerStatus: publishedCids.length ? '可作为社区数据提供者' : '已连接，可发布后提供社区数据',
      lastError: '',
    };
  } catch (error) {
    return {
      ready: false,
      id: 'unavailable',
      agentVersion: 'Helia',
      protocolVersion: 'helia',
      addresses: [],
      addressCount: 0,
      canProvide: false,
      canPin: false,
      publishedCids: getPublishedCids(),
      pinnedCids: getPinnedCids(),
      lastPublishedCid: getPublishedCids()[0] || '',
      lastPinnedCid: getPinnedCids()[0] || '',
      providerStatus: 'IPFS 未连接',
      lastError: error?.message || 'IPFS 初始化失败',
    };
  }
}

export async function fetchIpnsJson(ipnsName) {
  const normalized = String(ipnsName || '').trim();
  if (!normalized) {
    return { ok: false, error: 'missing ipns name', path: '' };
  }
  const path = `${DEFAULT_IPNS_PATH_PREFIX}/${normalized}`;
  try {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`ipns http ${response.status}`);
    const data = await response.json();
    return { ok: true, path, data };
  } catch (error) {
    return { ok: false, path, error: error?.message || 'failed to fetch ipns json' };
  }
}

export async function uploadJsonDocument(document) {
  const { fs } = await ensureHelia();
  const bytes = new TextEncoder().encode(JSON.stringify(document));
  const cid = await fs.addBytes(bytes);
  return cid.toString();
}

export function createOnlineReplicaBoard({ peerId = '', cids = [], updatedAt = Date.now() } = {}) {
  return {
    version: 1,
    peerId: String(peerId || '').trim(),
    updatedAt: Number(updatedAt || Date.now()),
    claims: [...new Set((Array.isArray(cids) ? cids : []).map(value => String(value || '').trim()).filter(Boolean))]
      .map(cid => ({ cid, peerId: String(peerId || '').trim(), updatedAt: Number(updatedAt || Date.now()) })),
  };
}

export function getLastReplicaBoardUpdatedAt() {
  return Number(localStorage.getItem(REPLICA_BOARD_UPDATED_AT_KEY) || 0);
}

export function getLastReplicaBoardCid() {
  return String(localStorage.getItem(REPLICA_BOARD_CID_KEY) || '').trim();
}

export async function uploadOnlineReplicaBoard(board) {
  const cid = await uploadJsonDocument(board);
  localStorage.setItem(REPLICA_BOARD_UPDATED_AT_KEY, String(Date.now()));
  localStorage.setItem(REPLICA_BOARD_CID_KEY, cid);
  return cid;
}

export async function fetchJsonDocument(cid) {
  return fetchCommunityStrategy(cid);
}

export async function fetchOnlineReplicaBoard(cid) {
  const raw = await fetchJsonDocument(cid);
  return {
    version: Number(raw?.version || 1),
    peerId: String(raw?.peerId || '').trim(),
    updatedAt: Number(raw?.updatedAt || 0),
    claims: Array.isArray(raw?.claims)
      ? raw.claims
          .filter(item => item?.cid && item?.peerId)
          .map(item => ({
            cid: String(item.cid).trim(),
            peerId: String(item.peerId).trim(),
            updatedAt: Number(item.updatedAt || raw?.updatedAt || 0),
          }))
      : [],
  };
}
