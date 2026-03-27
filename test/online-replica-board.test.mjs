import assert from 'node:assert/strict';

function createReplicaClaim({ cid, peerId, updatedAt = Date.now() }) {
  return { cid: String(cid || '').trim(), peerId: String(peerId || '').trim(), updatedAt: Number(updatedAt || 0) };
}

function aggregateReplicaClaims(claims = [], now = Date.now(), ttlMs = 1000 * 60 * 10) {
  const fresh = claims
    .map(createReplicaClaim)
    .filter(item => item.cid && item.peerId && item.updatedAt > now - ttlMs);
  const seen = new Set();
  const replicaCounts = {};
  for (const claim of fresh) {
    const key = `${claim.cid}::${claim.peerId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    replicaCounts[claim.cid] = Number(replicaCounts[claim.cid] || 0) + 1;
  }
  return {
    replicaCounts,
    totalReplicas: Object.values(replicaCounts).reduce((sum, value) => sum + Number(value || 0), 0),
    replicatedStrategyCount: Object.keys(replicaCounts).length,
  };
}

const now = Date.now();
const summary = aggregateReplicaClaims([
  { cid: 'cid-a', peerId: 'peer-1', updatedAt: now - 1000 },
  { cid: 'cid-a', peerId: 'peer-2', updatedAt: now - 900 },
  { cid: 'cid-a', peerId: 'peer-1', updatedAt: now - 800 },
  { cid: 'cid-b', peerId: 'peer-3', updatedAt: now - 700 },
  { cid: 'cid-c', peerId: 'peer-4', updatedAt: now - 1000 * 60 * 11 },
], now);

assert.deepEqual(summary.replicaCounts, {
  'cid-a': 2,
  'cid-b': 1,
}, '在线副本统计应按 cid + peerId 去重，并忽略过期声明');
assert.equal(summary.totalReplicas, 3, '应汇总跨节点在线副本数');
assert.equal(summary.replicatedStrategyCount, 2, '应统计存在在线副本的策略条数');

console.log('online replica board: ok');

