import assert from 'node:assert/strict';

const DISCOVERY_RECORD_TTL_MS = 1000 * 60 * 10;

function normalizePointerCandidate(raw = {}) {
  return {
    pointerCid: String(raw.pointerCid || '').trim(),
    parentPointerCid: String(raw.parentPointerCid || '').trim(),
    networkId: String(raw.networkId || 'default').trim(),
    updatedAt: Number(raw.updatedAt || 0),
    publishedAt: Number(raw.publishedAt || raw.updatedAt || 0),
    peerId: String(raw.peerId || '').trim(),
    providerStatus: String(raw.providerStatus || '').trim(),
    strategyCount: Number(raw.strategyCount || 0),
    refs: Number(raw.refs || 0),
    score: Number(raw.score || 0),
  };
}

function isFreshCandidate(candidate, now = Date.now()) {
  return !!candidate.pointerCid && candidate.updatedAt > (now - DISCOVERY_RECORD_TTL_MS);
}

function mergePointerCandidates(...groups) {
  const merged = new Map();
  for (const group of groups) {
    for (const raw of Array.isArray(group) ? group : []) {
      const candidate = normalizePointerCandidate(raw);
      if (!candidate.pointerCid) continue;
      const existing = merged.get(candidate.pointerCid);
      if (!existing || candidate.updatedAt > existing.updatedAt) {
        merged.set(candidate.pointerCid, candidate);
      }
    }
  }
  return [...merged.values()];
}

function groupByNetwork(candidates) {
  const map = new Map();
  for (const candidate of candidates) {
    const networkId = candidate.networkId || 'default';
    if (!map.has(networkId)) map.set(networkId, []);
    map.get(networkId).push(candidate);
  }
  return map;
}

function electWinningPointer(candidates, now = Date.now()) {
  const fresh = candidates.filter(candidate => isFreshCandidate(candidate, now));
  const sorted = [...fresh].sort((a, b) => {
    if (b.refs !== a.refs) return b.refs - a.refs;
    if (b.strategyCount !== a.strategyCount) return b.strategyCount - a.strategyCount;
    if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
    return a.pointerCid.localeCompare(b.pointerCid);
  });
  return sorted[0] || null;
}

function electWinningPointersAcrossNetworks(candidates, now = Date.now()) {
  const grouped = groupByNetwork(candidates);
  const winners = [];
  for (const entries of grouped.values()) {
    const winner = electWinningPointer(entries, now);
    if (winner) winners.push(winner);
  }
  return winners.sort((a, b) => {
    if (b.refs !== a.refs) return b.refs - a.refs;
    if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
    return a.pointerCid.localeCompare(b.pointerCid);
  });
}

const now = Date.now();

const concurrentWrites = mergePointerCandidates(
  [
    { pointerCid: 'bafy-a', networkId: 'net-1', updatedAt: now - 1000, refs: 1, strategyCount: 5, peerId: 'peer-a' },
    { pointerCid: 'bafy-b', networkId: 'net-1', updatedAt: now - 800, refs: 2, strategyCount: 4, peerId: 'peer-b' },
  ],
  [
    { pointerCid: 'bafy-a', networkId: 'net-1', updatedAt: now - 500, refs: 3, strategyCount: 6, peerId: 'peer-c' },
  ],
);

assert.equal(concurrentWrites.length, 2, '并发写入不应覆盖整张索引表，而应按 pointerCid 去重保留两条候选入口');
assert.equal(concurrentWrites.find(item => item.pointerCid === 'bafy-a')?.refs, 3, '同一 pointerCid 的并发写入应保留较新的元数据');

const mergedNetworks = mergePointerCandidates([
  { pointerCid: 'bafy-net1-head', networkId: 'net-1', updatedAt: now - 300, refs: 4, strategyCount: 8 },
  { pointerCid: 'bafy-net1-old', networkId: 'net-1', updatedAt: now - 2000, refs: 1, strategyCount: 3 },
  { pointerCid: 'bafy-net2-head', networkId: 'net-2', updatedAt: now - 200, refs: 2, strategyCount: 10 },
]);

const networkWinners = electWinningPointersAcrossNetworks(mergedNetworks, now);
assert.deepEqual(
  networkWinners.map(item => item.pointerCid),
  ['bafy-net1-head', 'bafy-net2-head'],
  '多个网络并存时，应先按 networkId 选出各自 head，而不是让一条记录覆盖所有网络'
);

const unionCandidates = mergePointerCandidates([
  { pointerCid: 'bafy-merge-a', networkId: 'merged-net', updatedAt: now - 100, refs: 5, strategyCount: 11, parentPointerCid: 'bafy-net1-head' },
  { pointerCid: 'bafy-merge-b', networkId: 'merged-net', updatedAt: now - 120, refs: 3, strategyCount: 12, parentPointerCid: 'bafy-net2-head' },
  { pointerCid: 'bafy-stale', networkId: 'merged-net', updatedAt: now - DISCOVERY_RECORD_TTL_MS - 1, refs: 100, strategyCount: 50 },
]);

const elected = electWinningPointer(unionCandidates, now);
assert.equal(elected?.pointerCid, 'bafy-merge-a', '选举应优先新鲜候选，再按社区引用数、索引覆盖度和更新时间排序');
assert.equal(isFreshCandidate({ pointerCid: 'bafy-stale', updatedAt: now - DISCOVERY_RECORD_TTL_MS - 1 }, now), false, '过期 head 不应参与新一轮入口选举');

console.log('redis pointer election: ok');

