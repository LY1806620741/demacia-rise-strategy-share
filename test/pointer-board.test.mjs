import assert from 'node:assert/strict';

const DISCOVERY_RECORD_TTL_MS = 1000 * 60 * 10;

function normalizeDiscoveryRecord(raw = {}, extra = {}) {
  return {
    version: Number(raw?.version || 1),
    pointerCid: String(raw?.pointerCid || '').trim(),
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

function getKnownPointerCids(redisRecord, localPointers = [], publishedPointers = [], configuredPointers = []) {
  return [...new Set([
    isFreshDiscoveryRecord(redisRecord) ? redisRecord.pointerCid : '',
    ...localPointers.map(String),
    ...publishedPointers.map(String),
    ...configuredPointers.map(String),
  ].filter(Boolean))];
}

const redisRecord = normalizeDiscoveryRecord({
  version: 1,
  pointerCid: 'bafy-redis-current',
  updatedAt: Date.now(),
  peerId: 'peer-a',
  providerStatus: '可作为社区数据提供者',
  source: 'redis-bootstrap',
}, { source: 'redis' });

assert.equal(redisRecord.source, 'redis', '应记录当前发现来源为 Redis');
assert.equal(redisRecord.pointerCid, 'bafy-redis-current', 'Redis 记录应能提供最新 pointer');
assert.equal(isFreshDiscoveryRecord(redisRecord), true, '未过期的 Redis 入口应被视为有效发现记录');
assert.deepEqual(
  getKnownPointerCids(redisRecord, ['bafy-local'], ['bafy-published'], ['bafy-config', 'bafy-local']),
  ['bafy-redis-current', 'bafy-local', 'bafy-published', 'bafy-config'],
  'Redis 入口、本地入口、已发布入口和配置入口应合并去重'
);

const staleRecord = normalizeDiscoveryRecord({ pointerCid: 'bafy-stale', updatedAt: Date.now() - DISCOVERY_RECORD_TTL_MS - 1 });
assert.equal(isFreshDiscoveryRecord(staleRecord), false, '过期 Redis 入口不应继续作为当前网络入口');

console.log('redis discovery contract: ok');
