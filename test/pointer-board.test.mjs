import assert from 'node:assert/strict';

const DISCOVERY_RECORD_TTL_MS = 1000 * 60 * 10;

function normalizePointerCandidatesManifest(raw = {}, extra = {}) {
  return {
    version: Number(raw?.version || 1),
    currentPointerCid: String(raw?.currentPointerCid || raw?.current_pointer_cid || '').trim(),
    fallbackPointerCids: Array.isArray(raw?.fallbackPointerCids || raw?.fallback_pointer_cids)
      ? (raw.fallbackPointerCids || raw.fallback_pointer_cids).map(String).filter(Boolean)
      : [],
    updatedAt: Number(raw?.updatedAt || 0),
    source: String(extra.source || raw?.source || 'ipns').trim(),
    error: String(extra.error || '').trim(),
  };
}

function isFreshPointerCandidatesManifest(manifest) {
  return !!manifest?.currentPointerCid && Number(manifest?.updatedAt || 0) > (Date.now() - DISCOVERY_RECORD_TTL_MS);
}

function getKnownPointerCids(ipnsManifest, localPointers = [], publishedPointers = [], configuredPointers = []) {
  return [...new Set([
    isFreshPointerCandidatesManifest(ipnsManifest) ? ipnsManifest.currentPointerCid : '',
    ...(Array.isArray(ipnsManifest?.fallbackPointerCids) ? ipnsManifest.fallbackPointerCids : []),
    ...localPointers.map(String),
    ...publishedPointers.map(String),
    ...configuredPointers.map(String),
  ].filter(Boolean))];
}

const ipnsManifest = normalizePointerCandidatesManifest({
  version: 1,
  current_pointer_cid: 'bafy-ipns-current',
  fallback_pointer_cids: ['bafy-ipns-old'],
  updatedAt: Date.now(),
  source: 'ipns-board',
}, { source: 'ipns' });

assert.equal(ipnsManifest.source, 'ipns', '应记录当前发现来源为 IPNS');
assert.equal(ipnsManifest.currentPointerCid, 'bafy-ipns-current', 'IPNS 清单应能提供当前 pointer');
assert.equal(isFreshPointerCandidatesManifest(ipnsManifest), true, '未过期的 IPNS pointer 清单应被视为有效发现入口');
assert.deepEqual(
  getKnownPointerCids(ipnsManifest, ['bafy-local'], ['bafy-published'], ['bafy-config', 'bafy-local']),
  ['bafy-ipns-current', 'bafy-ipns-old', 'bafy-local', 'bafy-published', 'bafy-config'],
  'IPNS 当前入口、fallback、本地入口、已发布入口和配置入口应合并去重'
);

const staleManifest = normalizePointerCandidatesManifest({ current_pointer_cid: 'bafy-stale', updatedAt: Date.now() - DISCOVERY_RECORD_TTL_MS - 1 });
assert.equal(isFreshPointerCandidatesManifest(staleManifest), false, '过期 IPNS pointer 清单不应继续作为当前网络入口');

console.log('ipns pointer candidates contract: ok');
