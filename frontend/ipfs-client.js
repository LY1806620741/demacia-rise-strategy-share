import { createHelia } from 'https://cdn.jsdelivr.net/npm/helia@5.5.0/+esm';
import { unixfs } from 'https://cdn.jsdelivr.net/npm/@helia/unixfs@3.0.0/+esm';
import { CID } from 'https://cdn.jsdelivr.net/npm/multiformats@13.3.1/+esm';

let heliaNode = null;
let fsApi = null;

async function ensureHelia() {
  if (!heliaNode) {
    heliaNode = await createHelia();
    fsApi = unixfs(heliaNode);
  }
  return { helia: heliaNode, fs: fsApi };
}

export async function getIpfsNode() {
  const { helia } = await ensureHelia();
  return helia;
}

// 上传社区策略，返回 CID
export async function uploadCommunityStrategy(strategyObj) {
  const { fs } = await ensureHelia();
  const bytes = new TextEncoder().encode(JSON.stringify(strategyObj));
  const cid = await fs.addBytes(bytes);
  return cid.toString()
}

// 拉取指定 CID 的社区策略
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
  return JSON.parse(new TextDecoder().decode(merged))
}

// 批量拉取 CID 列表
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

// 本地收藏（IndexedDB/LocalStorage 可选实现）
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

// 搜索本地已拉取的社区策略
export function searchStrategies(strategies, keyword) {
  const kw = String(keyword || '').trim().toLowerCase();
  return (Array.isArray(strategies) ? strategies : []).filter(item => {
    const data = item?.data ?? item;
    return Object.values(data || {}).some(v => typeof v === 'string' && v.toLowerCase().includes(kw));
  });
}

// 检查IPFS连接状态
export async function getIpfsStatus() {
  const { helia } = await ensureHelia();
  const peerId = helia?.libp2p?.peerId?.toString?.() || 'unknown-peer';
  const multiaddrs = helia?.libp2p?.getMultiaddrs?.()?.map(addr => addr.toString()) || [];
  return {
    id: peerId,
    agentVersion: 'Helia',
    protocolVersion: 'helia',
    addresses: multiaddrs,
  };
}
